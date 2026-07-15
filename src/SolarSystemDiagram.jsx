import React, { useEffect, useMemo, useState } from "react";
import { searchEntries } from "./api";
import "./solarSystemDiagram.css";

const MIN_BRANCH_WIDTH = 104;
const SIBLING_GAP = 22;
const DEPTH_GAP = 86;
const TOP_ROW_Y = 88;
const LEFT_MARGIN = 58;
const RIGHT_MARGIN = 58;
const BOTTOM_MARGIN = 74;

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/\s+system\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bodyOrder(body) {
  const sourceOrder = Number(body?.source_order);
  const sourceRow = Number(body?.source_row);
  const orbitDepth = Number(body?.orbit_depth);

  return [
    Number.isFinite(sourceOrder) ? sourceOrder : Number.MAX_SAFE_INTEGER,
    Number.isFinite(sourceRow) ? sourceRow : Number.MAX_SAFE_INTEGER,
    Number.isFinite(orbitDepth) ? orbitDepth : Number.MAX_SAFE_INTEGER,
    String(body?.name || ""),
  ];
}

function compareBodies(left, right) {
  const leftOrder = bodyOrder(left);
  const rightOrder = bodyOrder(right);

  for (let index = 0; index < leftOrder.length; index += 1) {
    const leftValue = leftOrder[index];
    const rightValue = rightOrder[index];

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      if (leftValue !== rightValue) return leftValue - rightValue;
      continue;
    }

    const result = String(leftValue).localeCompare(String(rightValue), undefined, {
      sensitivity: "base",
    });

    if (result !== 0) return result;
  }

  return 0;
}

function getBodySystemName(body) {
  return (
    body?.system_name ||
    body?.system_slug ||
    body?.section_name ||
    body?.group_name ||
    ""
  );
}

function getBodyId(body, index = 0) {
  return String(body?.id || body?.slug || `${body?.name || "body"}-${index}`);
}

function normalizeBodies(entries, systemName) {
  const systemKey = normalizeKey(systemName);
  const uniqueBodies = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (normalizeKey(entry?.record_type) !== "celestial body") continue;
    if (normalizeKey(getBodySystemName(entry)) !== systemKey) continue;

    const key = getBodyId(entry, uniqueBodies.size);
    uniqueBodies.set(key, {
      ...entry,
      diagramId: key,
    });
  }

  return [...uniqueBodies.values()].sort(compareBodies);
}

function resolveParentId(body, byId, byName, primaryRootId) {
  if (body?.is_primary_star || body?.is_root_body) return null;

  const parentIds = Array.isArray(body?.parent_body_ids)
    ? body.parent_body_ids
    : [];

  for (const parentId of parentIds) {
    const normalizedId = String(parentId || "");
    if (normalizedId && byId.has(normalizedId) && normalizedId !== body.diagramId) {
      return normalizedId;
    }
  }

  const parentNames = [
    body?.orbits,
    ...(Array.isArray(body?.orbiting_body_names)
      ? body.orbiting_body_names
      : []),
  ].filter(Boolean);

  for (const parentName of parentNames) {
    const match = byName.get(normalizeKey(parentName));
    if (match && match.diagramId !== body.diagramId) {
      return match.diagramId;
    }
  }

  const orbitDepth = Number(body?.orbit_depth);
  if (Number.isFinite(orbitDepth) && orbitDepth > 0 && primaryRootId) {
    return primaryRootId;
  }

  return null;
}

function buildBodyGraph(bodies) {
  const byId = new Map(bodies.map((body) => [body.diagramId, body]));
  const byName = new Map();

  for (const body of bodies) {
    const key = normalizeKey(body?.name);
    if (key && !byName.has(key)) byName.set(key, body);
  }

  const preferredRoot =
    bodies.find((body) => body?.is_primary_star) ||
    bodies.find((body) => body?.is_root_body) ||
    bodies.find((body) => normalizeKey(body?.celestial_category) === "star") ||
    bodies[0] ||
    null;

  const primaryRootId = preferredRoot?.diagramId || null;
  const parentById = new Map();
  const childrenById = new Map();

  for (const body of bodies) {
    childrenById.set(body.diagramId, []);
  }

  for (const body of bodies) {
    const parentId = resolveParentId(body, byId, byName, primaryRootId);
    parentById.set(body.diagramId, parentId);

    if (parentId && childrenById.has(parentId)) {
      childrenById.get(parentId).push(body);
    }
  }

  for (const children of childrenById.values()) {
    children.sort(compareBodies);
  }

  const roots = bodies
    .filter((body) => !parentById.get(body.diagramId))
    .sort((left, right) => {
      if (left?.is_primary_star && !right?.is_primary_star) return -1;
      if (right?.is_primary_star && !left?.is_primary_star) return 1;
      return compareBodies(left, right);
    });

  return {
    byId,
    roots,
    parentById,
    childrenById,
    primaryRootId,
  };
}

function buildSolarLayout(graph) {
  const positions = new Map();
  const edges = [];
  const widthMemo = new Map();

  function subtreeWidth(bodyId) {
    if (widthMemo.has(bodyId)) return widthMemo.get(bodyId);

    const children = graph.childrenById.get(bodyId) || [];
    if (!children.length) {
      widthMemo.set(bodyId, MIN_BRANCH_WIDTH);
      return MIN_BRANCH_WIDTH;
    }

    const childWidths = children.map((child) => subtreeWidth(child.diagramId));
    const width = Math.max(
      MIN_BRANCH_WIDTH,
      childWidths.reduce((sum, value) => sum + value, 0) +
        SIBLING_GAP * Math.max(0, childWidths.length - 1)
    );

    widthMemo.set(bodyId, width);
    return width;
  }

  function placeDescendants(bodyId, centerX, y, spanLeft) {
    const children = graph.childrenById.get(bodyId) || [];
    if (!children.length) return;

    const childWidths = children.map((child) => subtreeWidth(child.diagramId));
    const totalWidth =
      childWidths.reduce((sum, value) => sum + value, 0) +
      SIBLING_GAP * Math.max(0, childWidths.length - 1);

    let cursor = spanLeft + Math.max(0, (subtreeWidth(bodyId) - totalWidth) / 2);

    children.forEach((child, index) => {
      const childWidth = childWidths[index];
      const childX = cursor + childWidth / 2;
      const childY = y + DEPTH_GAP;

      positions.set(child.diagramId, {
        x: childX,
        y: childY,
      });

      edges.push({
        parentId: bodyId,
        childId: child.diagramId,
      });

      placeDescendants(child.diagramId, childX, childY, cursor);
      cursor += childWidth + SIBLING_GAP;
    });
  }

  const roots = graph.roots;
  const rootWidth = Math.max(76, roots.length * 72);
  let mainCursor = LEFT_MARGIN + rootWidth + 42;

  roots.forEach((root, index) => {
    positions.set(root.diagramId, {
      x: LEFT_MARGIN + 34 + index * 72,
      y: TOP_ROW_Y,
    });
  });

  const mainBranches = [];

  for (const root of roots) {
    const children = graph.childrenById.get(root.diagramId) || [];

    for (const child of children) {
      mainBranches.push({
        body: child,
        parentId: root.diagramId,
      });
    }
  }

  // A malformed or incomplete dataset can contain disconnected non-root nodes.
  // Keep them visible on the main row instead of dropping them.
  const assignedToRoot = new Set(mainBranches.map((item) => item.body.diagramId));
  for (const body of graph.byId.values()) {
    if (roots.some((root) => root.diagramId === body.diagramId)) continue;
    if (assignedToRoot.has(body.diagramId)) continue;

    const parentId = graph.parentById.get(body.diagramId);
    if (!parentId || !graph.byId.has(parentId)) {
      mainBranches.push({ body, parentId: null });
    }
  }

  mainBranches.sort((left, right) => compareBodies(left.body, right.body));

  for (const branch of mainBranches) {
    const branchWidth = subtreeWidth(branch.body.diagramId);
    const branchX = mainCursor + branchWidth / 2;

    positions.set(branch.body.diagramId, {
      x: branchX,
      y: TOP_ROW_Y,
    });

    if (branch.parentId) {
      edges.push({
        parentId: branch.parentId,
        childId: branch.body.diagramId,
      });
    }

    placeDescendants(
      branch.body.diagramId,
      branchX,
      TOP_ROW_Y,
      mainCursor
    );

    mainCursor += branchWidth + SIBLING_GAP;
  }

  const positionedBodies = [...positions.entries()];
  const maximumX = positionedBodies.length
    ? Math.max(...positionedBodies.map(([, position]) => position.x))
    : 0;
  const maximumY = positionedBodies.length
    ? Math.max(...positionedBodies.map(([, position]) => position.y))
    : TOP_ROW_Y;

  return {
    positions,
    edges,
    width: Math.max(560, maximumX + RIGHT_MARGIN),
    height: Math.max(250, maximumY + BOTTOM_MARGIN),
  };
}

function bodyVisualKind(body) {
  const text = normalizeKey(
    [
      body?.celestial_category,
      body?.body_type,
      body?.classification,
      body?.name,
    ].join(" ")
  );

  if (text.includes("black hole")) return "black-hole";
  if (text.includes("star") || body?.is_primary_star) return "star";
  if (text.includes("station") || text.includes("installation")) return "station";
  if (text.includes("belt") || text.includes("asteroid")) return "belt";
  if (text.includes("gas giant") || text.includes("giant")) return "giant";
  if (text.includes("moon")) return "moon";
  return "planet";
}

function BodyGlyph({ body }) {
  const kind = bodyVisualKind(body);

  if (kind === "star") {
    return (
      <g className="solar-glyph solar-glyph-star">
        <circle r="17" />
        <circle r="23" className="solar-glyph-orbit" />
        <path d="M -29 0 H -23 M 23 0 H 29 M 0 -29 V -23 M 0 23 V 29" />
      </g>
    );
  }

  if (kind === "black-hole") {
    return (
      <g className="solar-glyph solar-glyph-black-hole">
        <circle r="15" />
        <ellipse rx="25" ry="7" />
      </g>
    );
  }

  if (kind === "station") {
    return (
      <g className="solar-glyph solar-glyph-station">
        <rect x="-8" y="-8" width="16" height="16" />
        <path d="M -13 0 H 13 M 0 -13 V 13" />
      </g>
    );
  }

  if (kind === "belt") {
    return (
      <g className="solar-glyph solar-glyph-belt">
        <circle r="15" className="solar-glyph-orbit" />
        <circle cx="-10" cy="2" r="2.5" />
        <circle cx="1" cy="-9" r="2" />
        <circle cx="10" cy="5" r="3" />
        <circle cx="-2" cy="10" r="1.8" />
      </g>
    );
  }

  if (kind === "giant") {
    return (
      <g className="solar-glyph solar-glyph-giant">
        <circle r="13" />
        <path d="M -11 -4 H 11 M -12 3 H 12" />
      </g>
    );
  }

  if (kind === "moon") {
    return (
      <g className="solar-glyph solar-glyph-moon">
        <circle r="6" />
      </g>
    );
  }

  return (
    <g className="solar-glyph solar-glyph-planet">
      <circle r="10" />
      <path d="M -8 4 Q 0 -2 8 2" />
    </g>
  );
}

function connectorPath(parent, child) {
  if (Math.abs(parent.y - child.y) < 2) {
    return `M ${parent.x} ${parent.y} H ${child.x}`;
  }

  const bendY = parent.y + Math.max(24, (child.y - parent.y) * 0.44);
  return `M ${parent.x} ${parent.y} V ${bendY} H ${child.x} V ${child.y}`;
}

export default function SolarSystemDiagram({ systemName, onOpenBody }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    bodies: [],
  });
  const [selectedBodyId, setSelectedBodyId] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, bodies: [] });
    setSelectedBodyId(null);

    searchEntries('type:"Celestial Body"', 10000)
      .then((data) => {
        if (!alive) return;

        const bodies = normalizeBodies(data?.results || [], systemName);
        setState({
          loading: false,
          error: null,
          bodies,
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          bodies: [],
        });
      });

    return () => {
      alive = false;
    };
  }, [systemName]);

  const graph = useMemo(() => buildBodyGraph(state.bodies), [state.bodies]);
  const layout = useMemo(() => buildSolarLayout(graph), [graph]);
  const selectedBody = selectedBodyId
    ? graph.byId.get(selectedBodyId)
    : null;

  function handleBodyOpen(body) {
    setSelectedBodyId(body.diagramId);

    if (typeof onOpenBody === "function") {
      onOpenBody(body);
    }
  }

  return (
    <section className="solar-system-panel terminal-frame">
      <div className="solar-system-header">
        <div>
          <div className="terminal-small">SYSTEM CARTOGRAPHICS</div>
          <h3>{systemName}</h3>
        </div>

        <div className="solar-system-count">
          {state.bodies.length} BODIES
        </div>
      </div>

      {state.loading ? (
        <div className="solar-system-message">MAPPING ORBITAL STRUCTURE...</div>
      ) : null}

      {state.error ? (
        <div className="solar-system-message solar-system-error">
          CARTOGRAPHIC LINK FAILURE // {state.error}
        </div>
      ) : null}

      {!state.loading && !state.error && !state.bodies.length ? (
        <div className="solar-system-message">
          NO CELESTIAL BODY RECORDS FOUND
        </div>
      ) : null}

      {!state.loading && !state.error && state.bodies.length ? (
        <>
          <div className="solar-system-scroll">
            <svg
              className="solar-system-svg"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width}
              height={layout.height}
              role="img"
              aria-label={`Orbital diagram for ${systemName}`}
            >
              <defs>
                <pattern
                  id="solarFineGrid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M 24 0 L 0 0 0 24" className="solar-grid-fine" />
                </pattern>
                <filter
                  id="solarGlow"
                  x="-80%"
                  y="-80%"
                  width="260%"
                  height="260%"
                >
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect
                width={layout.width}
                height={layout.height}
                fill="url(#solarFineGrid)"
              />

              <line
                x1={LEFT_MARGIN}
                y1={TOP_ROW_Y}
                x2={layout.width - RIGHT_MARGIN}
                y2={TOP_ROW_Y}
                className="solar-main-orbit-line"
              />

              <g className="solar-connectors">
                {layout.edges.map((edge) => {
                  const parent = layout.positions.get(edge.parentId);
                  const child = layout.positions.get(edge.childId);
                  if (!parent || !child) return null;

                  return (
                    <path
                      key={`${edge.parentId}-${edge.childId}`}
                      d={connectorPath(parent, child)}
                    />
                  );
                })}
              </g>

              <g className="solar-body-nodes">
                {state.bodies.map((body) => {
                  const position = layout.positions.get(body.diagramId);
                  if (!position) return null;

                  const selected = selectedBodyId === body.diagramId;
                  const parentId = graph.parentById.get(body.diagramId);
                  const parent = parentId ? graph.byId.get(parentId) : null;
                  const typeLabel =
                    body?.body_type ||
                    body?.classification ||
                    body?.celestial_category ||
                    "Celestial Body";

                  return (
                    <g
                      key={body.diagramId}
                      className={`solar-body-node ${
                        selected ? "solar-body-selected" : ""
                      }`}
                      transform={`translate(${position.x} ${position.y})`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBodyOpen(body)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleBodyOpen(body);
                        }
                      }}
                    >
                      <g filter="url(#solarGlow)">
                        <BodyGlyph body={body} />
                      </g>

                      <text y="-28" textAnchor="middle" className="solar-body-name">
                        {body?.name || "UNNAMED BODY"}
                      </text>
                      <text y="34" textAnchor="middle" className="solar-body-type">
                        {String(typeLabel).toUpperCase()}
                      </text>

                      <title>
                        {body?.name || "UNNAMED BODY"}
                        {parent?.name ? ` // ORBITS ${parent.name}` : " // ROOT BODY"}
                      </title>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="solar-system-footer">
            {selectedBody ? (
              <>
                <span>{selectedBody.name}</span>
                <span>
                  {graph.parentById.get(selectedBody.diagramId)
                    ? `ORBITS ${
                        graph.byId.get(graph.parentById.get(selectedBody.diagramId))
                          ?.name || "UNKNOWN"
                      }`
                    : "ROOT BODY"}
                </span>
                <span>
                  ORDER {selectedBody.source_order ?? "?"} // DEPTH {selectedBody.orbit_depth ?? "?"}
                </span>
              </>
            ) : (
              <span>SELECT BODY // OPEN DATABANK RECORD</span>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
