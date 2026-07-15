import React, { useEffect, useMemo, useRef, useState } from "react";
import "./cosmologyMap.css";

const COSMOS_DATA_URL = `${import.meta.env.BASE_URL}data/cosmos.json`;

const VIEW_WIDTH = 1500;
const VIEW_HEIGHT = 980;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3.4;
const DEFAULT_ZOOM = 0.86;

function nodeId(node) {
  return String(node?.identity ?? node?.elementId ?? "");
}

function relationEndpointId(value) {
  return String(value ?? "");
}

function nodeHasLabel(node, label) {
  return Array.isArray(node?.labels) && node.labels.includes(label);
}

function planeCategory(node) {
  return String(node?.properties?.category || "unknown").toLowerCase();
}

function planeName(node) {
  return String(node?.properties?.name || "UNNAMED PLANE");
}

function categoryAccent(category) {
  const value = String(category || "").toLowerCase();

  if (value === "material") return "#d7ffd6";
  if (value === "core") return "#9fff78";
  if (value === "elemental") return "#ffc66d";
  if (value === "sensory") return "#83e8ff";

  return "#9bffb2";
}

function categoryLabel(category) {
  const value = String(category || "unknown").toUpperCase();

  if (value === "MATERIAL") return "MATERIAL";
  if (value === "CORE") return "CORE PLANE";
  if (value === "ELEMENTAL") return "ELEMENTAL PLANE";
  if (value === "SENSORY") return "SENSORY PLANE";

  return value;
}

function stableAngle(value) {
  let hash = 0;
  const text = String(value || "");

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return (hash % 360) * (Math.PI / 180);
}

function normalizeCosmosRows(rows) {
  const nodeMap = new Map();
  const relationMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    for (const key of ["n", "m"]) {
      const node = row?.[key];
      const id = nodeId(node);

      if (node && id && nodeHasLabel(node, "Plane")) {
        nodeMap.set(id, {
          ...node,
          id,
        });
      }
    }

    const relation = row?.c;

    if (!relation) continue;

    const startId = relationEndpointId(relation.start);
    const endId = relationEndpointId(relation.end);

    if (!startId || !endId) continue;

    const sortedEndpoints = [startId, endId].sort();
    const semanticKey = [
      relation.type || "LINK",
      sortedEndpoints[0],
      sortedEndpoints[1],
    ].join("|");

    if (!relationMap.has(semanticKey)) {
      relationMap.set(semanticKey, {
        ...relation,
        id: String(relation.elementId ?? relation.identity ?? semanticKey),
        semanticKey,
        startId,
        endId,
      });
    }
  }

  const planes = [...nodeMap.values()].sort((left, right) => {
    const rank = {
      material: 0,
      core: 1,
      elemental: 2,
      sensory: 3,
      unknown: 4,
    };

    const leftRank = rank[planeCategory(left)] ?? 99;
    const rightRank = rank[planeCategory(right)] ?? 99;

    if (leftRank !== rightRank) return leftRank - rightRank;

    return planeName(left).localeCompare(planeName(right));
  });

  const links = [...relationMap.values()].filter(
    (link) => nodeMap.has(link.startId) && nodeMap.has(link.endId)
  );

  const categoryCounts = planes.reduce((counts, plane) => {
    const category = planeCategory(plane);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  return {
    nodeMap,
    planes,
    links,
    categoryCounts,
  };
}

function buildCosmosLayout(graph) {
  const positions = new Map();
  const center = {
    x: VIEW_WIDTH / 2,
    y: VIEW_HEIGHT / 2,
  };

  const coreAngles = new Map([
    ["Astral", -142],
    ["Temporal", -76],
    ["Manifold", 8],
    ["Crucible", 92],
  ]);

  const grouped = graph.planes.reduce((groups, plane) => {
    const category = planeCategory(plane);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(plane);
    return groups;
  }, new Map());

  for (const plane of graph.planes) {
    const category = planeCategory(plane);
    const name = planeName(plane);

    if (category === "material") {
      positions.set(plane.id, center);
      continue;
    }

    if (category === "core") {
      const coreGroup = grouped.get("core") || [];
      const fallbackIndex = Math.max(0, coreGroup.findIndex((item) => item.id === plane.id));
      const fallbackAngle = -150 + fallbackIndex * (300 / Math.max(1, coreGroup.length - 1));
      const angleDegrees = coreAngles.has(name)
        ? coreAngles.get(name)
        : fallbackAngle;
      const angle = angleDegrees * (Math.PI / 180);
      const radius = 245;

      positions.set(plane.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
      continue;
    }

    if (category === "elemental") {
      const group = grouped.get("elemental") || [];
      const index = Math.max(0, group.findIndex((item) => item.id === plane.id));
      const angle =
        (-170 + index * (340 / Math.max(1, group.length - 1))) *
        (Math.PI / 180);
      const radius = 388;

      positions.set(plane.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
      continue;
    }

    if (category === "sensory") {
      const group = grouped.get("sensory") || [];
      const index = Math.max(0, group.findIndex((item) => item.id === plane.id));
      const angle =
        (-150 + index * (300 / Math.max(1, group.length - 1))) *
        (Math.PI / 180);
      const radius = 500;

      positions.set(plane.id, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
      continue;
    }

    const angle = stableAngle(plane.id);
    positions.set(plane.id, {
      x: center.x + Math.cos(angle) * 540,
      y: center.y + Math.sin(angle) * 540,
    });
  }

  return positions;
}

function linkPath(start, end, link) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const curveOffset =
    ((Math.round(stableAngle(link.semanticKey) * 1000) % 7) - 3) * 9;
  const middleX = (start.x + end.x) / 2 + perpendicularX * curveOffset;
  const middleY = (start.y + end.y) / 2 + perpendicularY * curveOffset;

  return `M ${start.x} ${start.y} Q ${middleX} ${middleY} ${end.x} ${end.y}`;
}

function CosmologyLegend() {
  return (
    <div className="cosmos-legend">
      <div>
        <span className="cosmos-legend-node cosmos-legend-material" />
        MATERIAL
      </div>
      <div>
        <span className="cosmos-legend-node cosmos-legend-core" />
        CORE
      </div>
      <div>
        <span className="cosmos-legend-node cosmos-legend-elemental" />
        ELEMENTAL
      </div>
      <div>
        <span className="cosmos-legend-node cosmos-legend-sensory" />
        SENSORY
      </div>
    </div>
  );
}

export default function CosmologyMap({ onOpenEntry, detailPanel = null }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const panRef = useRef({
    x: (VIEW_WIDTH * (1 - DEFAULT_ZOOM)) / 2,
    y: (VIEW_HEIGHT * (1 - DEFAULT_ZOOM)) / 2,
  });

  const [state, setState] = useState({
    loading: true,
    error: null,
    rows: [],
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({
    x: (VIEW_WIDTH * (1 - DEFAULT_ZOOM)) / 2,
    y: (VIEW_HEIGHT * (1 - DEFAULT_ZOOM)) / 2,
  });
  const [showLabels, setShowLabels] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [selectedPlane, setSelectedPlane] = useState(null);
  const [openingPlaneName, setOpeningPlaneName] = useState("");
  const [nodeOpenError, setNodeOpenError] = useState("");

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    let alive = true;

    fetch(COSMOS_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load cosmos.json (${response.status})`);
        }

        return response.json();
      })
      .then((rows) => {
        if (alive) {
          setState({
            loading: false,
            error: null,
            rows,
          });
        }
      })
      .catch((error) => {
        if (alive) {
          setState({
            loading: false,
            error: error.message,
            rows: [],
          });
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const graph = useMemo(
    () => normalizeCosmosRows(state.rows),
    [state.rows]
  );

  const positions = useMemo(
    () => buildCosmosLayout(graph),
    [graph]
  );

  function resetView() {
    const resetPan = {
      x: (VIEW_WIDTH * (1 - DEFAULT_ZOOM)) / 2,
      y: (VIEW_HEIGHT * (1 - DEFAULT_ZOOM)) / 2,
    };

    zoomRef.current = DEFAULT_ZOOM;
    panRef.current = resetPan;
    setZoom(DEFAULT_ZOOM);
    setPan(resetPan);
  }

  function applyZoom(nextZoom, anchor = null) {
    const clampedZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, nextZoom)
    );

    if (!anchor) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }

    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const worldX = (anchor.x - currentPan.x) / currentZoom;
    const worldY = (anchor.y - currentPan.y) / currentZoom;
    const nextPan = {
      x: anchor.x - worldX * clampedZoom,
      y: anchor.y - worldY * clampedZoom,
    };

    panRef.current = nextPan;
    zoomRef.current = clampedZoom;
    setPan(nextPan);
    setZoom(clampedZoom);
  }

  useEffect(() => {
    if (state.loading || state.error) return undefined;

    const svg = svgRef.current;
    if (!svg) return undefined;

    const handleNativeWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = svg.getBoundingClientRect();
      const anchor = {
        x:
          ((event.clientX - rect.left) / Math.max(1, rect.width)) *
          VIEW_WIDTH,
        y:
          ((event.clientY - rect.top) / Math.max(1, rect.height)) *
          VIEW_HEIGHT,
      };

      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      applyZoom(zoomRef.current * factor, anchor);
    };

    svg.addEventListener("wheel", handleNativeWheel, {
      passive: false,
    });

    return () => {
      svg.removeEventListener("wheel", handleNativeWheel);
    };
  }, [state.loading, state.error]);

  function handlePointerDown(event) {
    const svg = svgRef.current;
    if (!svg) return;

    svg.setPointerCapture?.(event.pointerId);

    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startPan: panRef.current,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    const svg = svgRef.current;

    if (!drag || !svg || drag.pointerId !== event.pointerId) return;

    const rect = svg.getBoundingClientRect();
    const scaleX = VIEW_WIDTH / Math.max(1, rect.width);
    const scaleY = VIEW_HEIGHT / Math.max(1, rect.height);
    const nextPan = {
      x: drag.startPan.x + (event.clientX - drag.clientX) * scaleX,
      y: drag.startPan.y + (event.clientY - drag.clientY) * scaleY,
    };

    panRef.current = nextPan;
    setPan(nextPan);
  }

  function handlePointerUp(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function selectPlane(plane) {
    const name = planeName(plane);
    const category = planeCategory(plane);

    setSelectedPlane({
      id: plane.id,
      name,
      category,
    });
    setNodeOpenError("");
    setOpeningPlaneName(name);

    try {
      if (typeof onOpenEntry !== "function") {
        throw new Error("Databank entry handler is unavailable.");
      }

      await onOpenEntry({
        name,
        category,
        kind: "Plane",
        mapNodeId: plane.id,
      });
    } catch (error) {
      console.warn("COSMOLOGY DATABANK LOOKUP FAILURE", error);
      setNodeOpenError(
        error instanceof Error
          ? error.message
          : "Unable to open the selected cosmology file."
      );
    } finally {
      setOpeningPlaneName("");
    }
  }

  if (state.loading) {
    return (
      <section className="cosmology-map-page terminal-frame">
        <div className="cosmology-map-loading">
          LOADING COSMOLOGICAL TOPOLOGY...
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="cosmology-map-page terminal-frame">
        <div className="cosmology-map-error">
          COSMOLOGY LINK FAILURE // {state.error}
        </div>
      </section>
    );
  }

  return (
    <section className="cosmology-map-page">
      <div className="cosmology-map-header terminal-frame">
        <div>
          <div className="terminal-small">
            COSMOLOGY ARRAY // PLANAR TOPOLOGY
          </div>
          <h2>COSMOLOGY MATRIX</h2>
        </div>

        <div className="cosmology-map-stats">
          <span>{graph.planes.length} PLANES</span>
          <span>{graph.links.length} LINKS</span>
          <span>{graph.categoryCounts.core || 0} CORE</span>
          <span>{graph.categoryCounts.elemental || 0} ELEMENTAL</span>
          <span>{graph.categoryCounts.sensory || 0} SENSORY</span>
        </div>
      </div>

      <div className="cosmology-map-toolbar terminal-frame">
        <button
          type="button"
          className="terminal-button"
          onClick={() => applyZoom(zoom * 1.18)}
        >
          [+]
        </button>
        <button
          type="button"
          className="terminal-button"
          onClick={() => applyZoom(zoom / 1.18)}
        >
          [-]
        </button>
        <button
          type="button"
          className="terminal-button"
          onClick={resetView}
        >
          [RESET]
        </button>
        <button
          type="button"
          className={`terminal-button ${showLabels ? "cosmos-control-active" : ""}`}
          onClick={() => setShowLabels((current) => !current)}
          aria-pressed={showLabels}
        >
          [LABELS]
        </button>
        <button
          type="button"
          className={`terminal-button ${showLinks ? "cosmos-control-active" : ""}`}
          onClick={() => setShowLinks((current) => !current)}
          aria-pressed={showLinks}
        >
          [LINKS]
        </button>
        <span className="cosmology-zoom-readout">
          ZOOM {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="cosmology-map-layout">
        <div className="cosmology-map-viewport terminal-frame">
          <svg
            ref={svgRef}
            className="cosmology-map-svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label="Interactive graph of cosmological planes and links"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern
                id="cosmosGridSmall"
                width="30"
                height="30"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 30 0 L 0 0 0 30"
                  className="cosmos-grid-small"
                />
              </pattern>

              <pattern
                id="cosmosGridLarge"
                width="150"
                height="150"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="150"
                  height="150"
                  fill="url(#cosmosGridSmall)"
                />
                <path
                  d="M 150 0 L 0 0 0 150"
                  className="cosmos-grid-large"
                />
              </pattern>

              <filter
                id="cosmosGlow"
                x="-85%"
                y="-85%"
                width="270%"
                height="270%"
              >
                <feGaussianBlur stdDeviation="3.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              fill="url(#cosmosGridLarge)"
              onPointerDown={handlePointerDown}
            />

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <circle
                cx={VIEW_WIDTH / 2}
                cy={VIEW_HEIGHT / 2}
                r="250"
                className="cosmos-orbit-ring cosmos-orbit-core"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={VIEW_WIDTH / 2}
                cy={VIEW_HEIGHT / 2}
                r="388"
                className="cosmos-orbit-ring cosmos-orbit-elemental"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={VIEW_WIDTH / 2}
                cy={VIEW_HEIGHT / 2}
                r="500"
                className="cosmos-orbit-ring cosmos-orbit-sensory"
                vectorEffect="non-scaling-stroke"
              />

              {showLinks ? (
                <g className="cosmos-links">
                  {graph.links.map((link) => {
                    const start = positions.get(link.startId);
                    const end = positions.get(link.endId);
                    const startNode = graph.nodeMap.get(link.startId);
                    const endNode = graph.nodeMap.get(link.endId);

                    if (!start || !end || !startNode || !endNode) return null;

                    const categories = [
                      planeCategory(startNode),
                      planeCategory(endNode),
                    ].sort();
                    const categoryClass = categories.join("-");

                    return (
                      <path
                        key={link.semanticKey}
                        d={linkPath(start, end, link)}
                        className={`cosmos-link cosmos-link-${categoryClass}`}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              ) : null}

              <g className="cosmos-plane-nodes">
                {graph.planes.map((plane) => {
                  const position = positions.get(plane.id);
                  if (!position) return null;

                  const category = planeCategory(plane);
                  const name = planeName(plane);
                  const isSelected = selectedPlane?.id === plane.id;
                  const showPlaneLabel = showLabels || isSelected;

                  return (
                    <g
                      key={plane.id}
                      className={`cosmos-plane-node cosmos-plane-${category} ${
                        isSelected ? "cosmos-plane-selected" : ""
                      }`}
                      transform={`translate(${position.x} ${position.y})`}
                      style={{
                        "--cosmos-accent": categoryAccent(category),
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => void selectPlane(plane)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void selectPlane(plane);
                        }
                      }}
                    >
                      {category === "material" ? (
                        <>
                          <circle
                            r="42"
                            className="cosmos-plane-halo"
                            filter="url(#cosmosGlow)"
                          />
                          <circle r="30" className="cosmos-plane-core" />
                          <path
                            d="M -16 0 H 16 M 0 -16 V 16"
                            className="cosmos-plane-mark"
                          />
                        </>
                      ) : category === "core" ? (
                        <>
                          <circle
                            r="30"
                            className="cosmos-plane-halo"
                            filter="url(#cosmosGlow)"
                          />
                          <polygon
                            points="0,-23 20,-11 20,11 0,23 -20,11 -20,-11"
                            className="cosmos-plane-core"
                          />
                        </>
                      ) : category === "elemental" ? (
                        <>
                          <circle
                            r="23"
                            className="cosmos-plane-halo"
                            filter="url(#cosmosGlow)"
                          />
                          <path
                            d="M 0 -21 L 19 12 L -19 12 Z"
                            className="cosmos-plane-core"
                          />
                        </>
                      ) : (
                        <>
                          <circle
                            r="21"
                            className="cosmos-plane-halo"
                            filter="url(#cosmosGlow)"
                          />
                          <path
                            d="M 0 -19 L 19 0 L 0 19 L -19 0 Z"
                            className="cosmos-plane-core"
                          />
                        </>
                      )}

                      {showPlaneLabel ? (
                        <text
                          y={category === "material" ? "-52" : "-34"}
                          textAnchor="middle"
                          className="cosmos-plane-label"
                        >
                          {name}
                        </text>
                      ) : null}

                      <text
                        y={category === "material" ? "58" : "40"}
                        textAnchor="middle"
                        className="cosmos-plane-category"
                      >
                        {categoryLabel(category)}
                      </text>

                      <title>
                        {name} // {categoryLabel(category)}
                      </title>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        </div>

        <div className="cosmology-map-detail-slot">
          {detailPanel || (
            <aside className="cosmology-map-inspector terminal-frame">
              <div className="cosmology-inspector-title">
                {openingPlaneName
                  ? `RETRIEVING // ${openingPlaneName}`
                  : "COSMOLOGY LINK STANDBY"}
              </div>

              {nodeOpenError ? (
                <p className="cosmology-map-error-text">
                  LINK FAILURE // {nodeOpenError}
                </p>
              ) : (
                <p className="cosmology-muted">
                  Select a plane to open its matching Databank entry from
                  entries.json.
                </p>
              )}

              <CosmologyLegend />
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
