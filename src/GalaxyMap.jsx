import React, { useEffect, useMemo, useRef, useState } from "react";
import SolarSystemDiagram from "./SolarSystemDiagram";
import "./galaxyMap.css";

const GALAXY_DATA_URL = `${import.meta.env.BASE_URL}data/galaxycivs.json`;

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 980;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3.2;

const SECTOR_SPREAD = 2.25;
const DEFAULT_ZOOM = 0.64;
const SYSTEM_RING_BASE = 92;
const SYSTEM_RING_STEP = 58;

const FORBIDDEN_TERMS = ["primus", "guild"];

function nodeId(node) {
  return String(node?.identity ?? node?.elementId ?? "");
}

function relationEndpointId(value) {
  return String(value ?? "");
}

function nodeHasLabel(node, label) {
  return Array.isArray(node?.labels) && node.labels.includes(label);
}

function nodeText(node) {
  return JSON.stringify(node?.properties || {}).toLowerCase();
}

function containsForbiddenTerm(value) {
  const normalized = String(value || "").toLowerCase();
  return FORBIDDEN_TERMS.some((term) => normalized.includes(term));
}

function sectorAccent(primaryCiv = "") {
  const value = primaryCiv.toLowerCase();

  if (value.includes("crown")) return "#a8ffb9";
  if (value.includes("luthan")) return "#d2ff8f";
  if (value.includes("karnate")) return "#ffc66d";
  if (value.includes("veyran")) return "#7fffd0";
  if (value.includes("orak")) return "#ffad6f";
  if (value.includes("cindral")) return "#9fff78";
  if (value.includes("halix")) return "#83e8ff";

  return "#9bffb2";
}

function stableAngle(value) {
  let hash = 0;
  const text = String(value || "");

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return (hash % 360) * (Math.PI / 180);
}

function normalizeGalaxyRows(rows) {
  const nodeMap = new Map();
  const exactRelationMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    for (const key of ["n", "m"]) {
      const node = row?.[key];
      const id = nodeId(node);

      if (node && id) {
        nodeMap.set(id, {
          ...node,
          id,
        });
      }
    }

    const relation = row?.c;

    if (relation) {
      const relationId = String(
        relation.elementId ??
          relation.identity ??
          `${relation.type}:${relation.start}:${relation.end}:${JSON.stringify(
            relation.properties || {}
          )}`
      );

      exactRelationMap.set(relationId, {
        ...relation,
        id: relationId,
        startId: relationEndpointId(relation.start),
        endId: relationEndpointId(relation.end),
      });
    }
  }

  const allNodes = [...nodeMap.values()];
  const allRelations = [...exactRelationMap.values()];

  const forbiddenIds = new Set();
  const guildCivIds = new Set();

  for (const node of allNodes) {
    if (nodeHasLabel(node, "Civ")) {
      forbiddenIds.add(node.id);

      if (containsForbiddenTerm(node?.properties?.name)) {
        guildCivIds.add(node.id);
      }

      continue;
    }

    if (containsForbiddenTerm(nodeText(node))) {
      forbiddenIds.add(node.id);
    }
  }

  for (const relation of allRelations) {
    if (relation.type !== "CONTROLS") continue;

    const startNode = nodeMap.get(relation.startId);
    const endNode = nodeMap.get(relation.endId);

    if (guildCivIds.has(relation.startId) && nodeHasLabel(endNode, "Sector")) {
      forbiddenIds.add(relation.endId);
    }

    if (guildCivIds.has(relation.endId) && nodeHasLabel(startNode, "Sector")) {
      forbiddenIds.add(relation.startId);
    }
  }

  for (const relation of allRelations) {
    if (relation.type !== "IN_SECTOR") continue;

    const startNode = nodeMap.get(relation.startId);
    const endNode = nodeMap.get(relation.endId);

    if (
      nodeHasLabel(startNode, "System") &&
      forbiddenIds.has(relation.endId)
    ) {
      forbiddenIds.add(relation.startId);
    }

    if (
      nodeHasLabel(endNode, "System") &&
      forbiddenIds.has(relation.startId)
    ) {
      forbiddenIds.add(relation.endId);
    }
  }

  const visibleNodes = allNodes.filter((node) => {
    if (forbiddenIds.has(node.id)) return false;

    return nodeHasLabel(node, "System") || nodeHasLabel(node, "Sector");
  });

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const semanticRelationMap = new Map();

  for (const relation of allRelations) {
    if (!visibleNodeIds.has(relation.startId)) continue;
    if (!visibleNodeIds.has(relation.endId)) continue;

    if (
      relation.type !== "IN_SECTOR" &&
      relation.type !== "HYPERSPACE_LANE"
    ) {
      continue;
    }

    const sortedEndpoints = [relation.startId, relation.endId].sort();
    const laneName = relation?.properties?.lane || "";
    const semanticKey = [
      relation.type,
      sortedEndpoints[0],
      sortedEndpoints[1],
      laneName,
    ].join("|");

    if (!semanticRelationMap.has(semanticKey)) {
      semanticRelationMap.set(semanticKey, {
        ...relation,
        semanticKey,
      });
    }
  }

  const sectors = visibleNodes
    .filter((node) => nodeHasLabel(node, "Sector"))
    .sort((left, right) =>
      String(left?.properties?.name || "").localeCompare(
        String(right?.properties?.name || "")
      )
    );

  const systems = visibleNodes
    .filter((node) => nodeHasLabel(node, "System"))
    .sort((left, right) =>
      String(left?.properties?.name || "").localeCompare(
        String(right?.properties?.name || "")
      )
    );

  const relations = [...semanticRelationMap.values()];
  const inSectorRelations = relations.filter(
    (relation) => relation.type === "IN_SECTOR"
  );
  const laneRelations = relations.filter(
    (relation) => relation.type === "HYPERSPACE_LANE"
  );

  const systemSectorMap = new Map();
  const sectorSystemsMap = new Map();

  for (const sector of sectors) {
    sectorSystemsMap.set(sector.id, []);
  }

  for (const relation of inSectorRelations) {
    const startNode = nodeMap.get(relation.startId);
    const endNode = nodeMap.get(relation.endId);

    let system = null;
    let sector = null;

    if (
      nodeHasLabel(startNode, "System") &&
      nodeHasLabel(endNode, "Sector")
    ) {
      system = startNode;
      sector = endNode;
    } else if (
      nodeHasLabel(endNode, "System") &&
      nodeHasLabel(startNode, "Sector")
    ) {
      system = endNode;
      sector = startNode;
    }

    if (!system || !sector) continue;

    if (!systemSectorMap.has(system.id)) {
      systemSectorMap.set(system.id, sector.id);
    }

    const sectorSystems = sectorSystemsMap.get(sector.id) || [];

    if (!sectorSystems.some((item) => item.id === system.id)) {
      sectorSystems.push(system);
      sectorSystems.sort((left, right) =>
        String(left?.properties?.name || "").localeCompare(
          String(right?.properties?.name || "")
        )
      );
      sectorSystemsMap.set(sector.id, sectorSystems);
    }
  }

  return {
    nodeMap,
    sectors,
    systems,
    inSectorRelations,
    laneRelations,
    systemSectorMap,
    sectorSystemsMap,
  };
}

function buildLayout(graph) {
  const sectorCoords = graph.sectors.map((sector) => {
    const coords = sector?.properties?.coords || {};

    return {
      sector,
      rawX: Number.isFinite(Number(coords.x)) ? Number(coords.x) : 0,
      rawY: Number.isFinite(Number(coords.y)) ? Number(coords.y) : 0,
    };
  });

  const xValues = sectorCoords.map((item) => item.rawX);
  const yValues = sectorCoords.map((item) => item.rawY);
  const minX = Math.min(...xValues, 0);
  const maxX = Math.max(...xValues, 1);
  const minY = Math.min(...yValues, 0);
  const maxY = Math.max(...yValues, 1);
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);
  const marginX = 165;
  const marginY = 125;
  const usableWidth = VIEW_WIDTH - marginX * 2;
  const usableHeight = VIEW_HEIGHT - marginY * 2;

  const duplicateCoordinateGroups = new Map();

  for (const item of sectorCoords) {
    const key = `${item.rawX}|${item.rawY}`;
    const group = duplicateCoordinateGroups.get(key) || [];
    group.push(item);
    duplicateCoordinateGroups.set(key, group);
  }

  const positions = new Map();

  for (const group of duplicateCoordinateGroups.values()) {
    group.sort((left, right) =>
      String(left.sector?.properties?.name || "").localeCompare(
        String(right.sector?.properties?.name || "")
      )
    );

    group.forEach((item, groupIndex) => {
      const normalizedX =
        marginX + ((item.rawX - minX) / xRange) * usableWidth;
      const normalizedY =
        VIEW_HEIGHT -
        marginY -
        ((item.rawY - minY) / yRange) * usableHeight;


      const baseX =
        VIEW_WIDTH / 2 +
        (normalizedX - VIEW_WIDTH / 2) * SECTOR_SPREAD;
      const baseY =
        VIEW_HEIGHT / 2 +
        (normalizedY - VIEW_HEIGHT / 2) * SECTOR_SPREAD;

      const duplicateOffset =
        group.length > 1
          ? {
              x:
                Math.cos((Math.PI * 2 * groupIndex) / group.length) *
                46,
              y:
                Math.sin((Math.PI * 2 * groupIndex) / group.length) *
                46,
            }
          : { x: 0, y: 0 };

      positions.set(item.sector.id, {
        x: baseX + duplicateOffset.x,
        y: baseY + duplicateOffset.y,
      });
    });
  }

  const unassignedSystems = [];

  for (const system of graph.systems) {
    const sectorId = graph.systemSectorMap.get(system.id);
    const sectorPosition = positions.get(sectorId);

    if (!sectorPosition) {
      unassignedSystems.push(system);
      continue;
    }

    const siblings = graph.sectorSystemsMap.get(sectorId) || [];
    const siblingIndex = Math.max(
      0,
      siblings.findIndex((item) => item.id === system.id)
    );

    const ringIndex = Math.floor(siblingIndex / 10);
    const indexInRing = siblingIndex % 10;
    const itemsInRing = Math.min(10, siblings.length - ringIndex * 10);
    const radius = SYSTEM_RING_BASE + ringIndex * SYSTEM_RING_STEP;
    const startAngle = stableAngle(sectorId);
    const angle =
      startAngle +
      (Math.PI * 2 * indexInRing) / Math.max(1, itemsInRing);

    positions.set(system.id, {
      x: sectorPosition.x + Math.cos(angle) * radius,
      y: sectorPosition.y + Math.sin(angle) * radius,
    });
  }

  unassignedSystems.forEach((system, index) => {
    positions.set(system.id, {
      x: 130 + (index % 12) * 105,
      y: VIEW_HEIGHT - 55 - Math.floor(index / 12) * 45,
    });
  });

  return positions;
}

function lanePath(start, end, lane, laneIndex = 0) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const hashOffset =
    ((Math.round(stableAngle(lane?.properties?.lane || lane.id) * 1000) %
      5) -
      2) *
    8;
  const curveOffset = hashOffset + laneIndex * 6;
  const middleX = (start.x + end.x) / 2 + perpendicularX * curveOffset;
  const middleY = (start.y + end.y) / 2 + perpendicularY * curveOffset;

  const labelText = String(lane?.properties?.lane || "UNNAMED LANE");
  const labelT = length < 180 ? 0.62 : 0.54;
  const oneMinusT = 1 - labelT;

  const anchorX =
    oneMinusT * oneMinusT * start.x +
    2 * oneMinusT * labelT * middleX +
    labelT * labelT * end.x;
  const anchorY =
    oneMinusT * oneMinusT * start.y +
    2 * oneMinusT * labelT * middleY +
    labelT * labelT * end.y;

  const sideSeed = Math.round(stableAngle(lane?.properties?.lane || lane.id) * 1000);
  const labelDirection = (sideSeed + laneIndex) % 2 === 0 ? 1 : -1;
  const labelLift = 44 + Math.min(30, Math.abs(curveOffset) * 0.9);
  const alongOffset =
    length < 150
      ? 0
      : ((sideSeed % 3) - 1) * Math.min(30, length * 0.08);

  const unitX = dx / length;
  const unitY = dy / length;
  const labelX =
    anchorX +
    perpendicularX * labelLift * labelDirection +
    unitX * alongOffset;
  const labelY =
    anchorY +
    perpendicularY * labelLift * labelDirection +
    unitY * alongOffset;

  const labelWidth = Math.min(
    184,
    Math.max(62, labelText.length * 6.7 + 18)
  );

  const leaderStartX =
    labelX - Math.sign(perpendicularX * labelDirection || 1) * labelWidth * 0.44;
  const leaderStartY = labelY;

  return {
    d: `M ${start.x} ${start.y} Q ${middleX} ${middleY} ${end.x} ${end.y}`,
    labelText,
    labelX,
    labelY,
    labelWidth,
    anchorX,
    anchorY,
    leaderD: `M ${anchorX} ${anchorY} L ${leaderStartX} ${leaderStartY}`,
  };
}

function laneTouchesSystem(lane, graph) {
  const startNode = graph.nodeMap.get(lane.startId);
  const endNode = graph.nodeMap.get(lane.endId);

  return nodeHasLabel(startNode, "System") || nodeHasLabel(endNode, "System");
}

function calculateLaneTravelHours(start, end) {
  if (!start || !end) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);


  const hours = Math.max(1, Math.round((distance / 4.8) ** 1.28));

  return {
    distance,
    hours,
  };
}

function formatLaneTravelTime(hours) {
  if (!Number.isFinite(hours)) return "UNKNOWN";

  const roundedHours = Math.max(1, Math.round(hours));
  const days = Math.floor(roundedHours / 24);
  const remainderHours = roundedHours % 24;

  if (days <= 0) {
    return `${roundedHours} ${roundedHours === 1 ? "HOUR" : "HOURS"}`;
  }

  if (remainderHours === 0) {
    return `${roundedHours} HOURS // ${days} ${days === 1 ? "DAY" : "DAYS"}`;
  }

  return `${roundedHours} HOURS // ${days}D ${remainderHours}H`;
}

function formatLaneTravelTimeForSpeech(hours) {
  if (!Number.isFinite(hours)) return "unknown";

  const roundedHours = Math.max(1, Math.round(hours));
  const days = Math.floor(roundedHours / 24);
  const remainderHours = roundedHours % 24;

  if (days <= 0) {
    return `${roundedHours} ${roundedHours === 1 ? "hour" : "hours"}`;
  }

  if (remainderHours === 0) {
    return `${roundedHours} hours, or ${days} ${days === 1 ? "day" : "days"}`;
  }

  return `${roundedHours} hours, or ${days} days and ${remainderHours} hours`;
}

function getLaneName(lane) {
  return String(
    lane?.properties?.lane ||
      lane?.properties?.name ||
      "Unnamed lane"
  );
}

function buildLaneSpeechLine(lane) {
  return getLaneName(lane);
}

function speakLaneSpeechLine(text) {
  if (!text || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find((voice) =>
      /google us english|microsoft david|microsoft mark|english/i.test(
        `${voice.name} ${voice.lang}`
      )
    ) || voices[0];

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = 0.82;
  utterance.pitch = 0.55;
  utterance.volume = 0.82;

  window.speechSynthesis.speak(utterance);
}

function laneEndpointName(node) {
  return String(node?.properties?.name || "UNKNOWN ENDPOINT");
}

function LaneDetailsPanel({ selectedLane, graph }) {
  if (!selectedLane) return null;

  const startNode = graph.nodeMap.get(selectedLane.startId);
  const endNode = graph.nodeMap.get(selectedLane.endId);
  const laneName =
    selectedLane?.properties?.lane ||
    selectedLane?.properties?.name ||
    "UNNAMED LANE";
  const risk = String(selectedLane?.properties?.risk || "UNSPECIFIED").toUpperCase();
  const travel = selectedLane.travel || null;

  return (
    <aside className="galaxy-map-inspector galaxy-lane-inspector terminal-frame">
      <div className="galaxy-inspector-kicker">HYPERSPACE LANE</div>
      <div className="galaxy-inspector-title">{laneName}</div>

      <div className="galaxy-detail-row">
        <span>ORIGIN</span>
        <strong>{laneEndpointName(startNode)}</strong>
      </div>

      <div className="galaxy-detail-row">
        <span>DESTINATION</span>
        <strong>{laneEndpointName(endNode)}</strong>
      </div>

      <div className="galaxy-detail-row">
        <span>TRANSIT TIME</span>
        <strong>{formatLaneTravelTime(travel?.hours)}</strong>
      </div>

      <div className="galaxy-detail-row">
        <span>RISK</span>
        <strong>{risk}</strong>
      </div>
    </aside>
  );
}

function getSystemLabelPlacement(system, position, graph, positions) {
  const sectorId = graph.systemSectorMap.get(system.id);
  const sectorPosition = positions.get(sectorId);

  if (!sectorPosition) {
    return {
      x: 0,
      y: -22,
      textAnchor: "middle",
    };
  }

  const dx = position.x - sectorPosition.x;
  const dy = position.y - sectorPosition.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const unitX = dx / length;
  const unitY = dy / length;
  const labelDistance = 26;

  let textAnchor = "middle";

  if (unitX > 0.34) {
    textAnchor = "start";
  } else if (unitX < -0.34) {
    textAnchor = "end";
  }

  return {
    x: unitX * labelDistance,
    y: unitY * labelDistance + 1,
    textAnchor,
  };
}



function GraphNodeDetails({ selection, graph }) {
  if (!selection) {
    return (
      <>
        <div className="galaxy-inspector-title">NO NODE SELECTED</div>
        <p className="galaxy-muted">
          Select a sector or system to inspect its navigation record.
        </p>

        <div className="galaxy-legend">
          <div>
            <span className="legend-sector" /> SECTOR NODE
          </div>
          <div>
            <span className="legend-system" /> SYSTEM NODE
          </div>
          <div>
            <span className="legend-lane legend-lane-low" /> LOW RISK
          </div>
          <div>
            <span className="legend-lane legend-lane-med" /> MED RISK
          </div>
          <div>
            <span className="legend-lane legend-lane-high" /> HIGH RISK
          </div>
        </div>
      </>
    );
  }

  const node = graph.nodeMap.get(selection.id);

  if (!node) return null;

  const isSector = nodeHasLabel(node, "Sector");
  const properties = node.properties || {};
  const sectorId = isSector
    ? node.id
    : graph.systemSectorMap.get(node.id);
  const sector = graph.nodeMap.get(sectorId);
  const systems = isSector
    ? graph.sectorSystemsMap.get(node.id) || []
    : [];

  return (
    <>
      <div className="galaxy-inspector-kicker">
        {isSector ? "SECTOR RECORD" : "SYSTEM RECORD"}
      </div>
      <div className="galaxy-inspector-title">
        {properties.name || "UNNAMED NODE"}
      </div>

      {isSector ? (
        <>
          <div className="galaxy-detail-row">
            <span>PRIMARY CIV</span>
            <strong>{properties.primaryCiv || "UNALIGNED"}</strong>
          </div>
          <div className="galaxy-detail-row">
            <span>TIER</span>
            <strong>{String(properties.tier || "UNSPECIFIED").toUpperCase()}</strong>
          </div>
          <div className="galaxy-detail-row">
            <span>COORDINATES</span>
            <strong>
              {properties?.coords
                ? `${properties.coords.x}, ${properties.coords.y}`
                : "UNKNOWN"}
            </strong>
          </div>
          <div className="galaxy-detail-row">
            <span>KNOWN SYSTEMS</span>
            <strong>{systems.length}</strong>
          </div>

          {systems.length ? (
            <div className="galaxy-system-list">
              {systems.map((system) => (
                <button
                  key={system.id}
                  type="button"
                  onClick={() =>
                    selection.setSelection({
                      kind: "System",
                      id: system.id,
                    })
                  }
                >
                  &gt; {system?.properties?.name || "UNNAMED SYSTEM"}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="galaxy-detail-row">
            <span>SECTOR</span>
            <strong>{sector?.properties?.name || "UNASSIGNED"}</strong>
          </div>
          <div className="galaxy-detail-row">
            <span>PRIMARY CIV</span>
            <strong>{sector?.properties?.primaryCiv || "UNALIGNED"}</strong>
          </div>
        </>
      )}
    </>
  );
}

export default function GalaxyMap({ onOpenEntry, detailPanel = null, onInterfaceSfx = null, onNarrate = null }) {
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
  const [showSystemLabels, setShowSystemLabels] = useState(false);
  const [showSectorLabels, setShowSectorLabels] = useState(true);
  const [showFactionLabels, setShowFactionLabels] = useState(true);
  const [showLaneLabels, setShowLaneLabels] = useState(true);
  const [showSystems, setShowSystems] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedLane, setSelectedLane] = useState(null);
  const [openingNodeName, setOpeningNodeName] = useState("");
  const [nodeOpenError, setNodeOpenError] = useState("");

  function triggerInterfaceSfx() {
    if (typeof onInterfaceSfx === "function") {
      onInterfaceSfx();
    }
  }

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    let alive = true;

    fetch(GALAXY_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load galaxycivs.json (${response.status})`
          );
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
    () => normalizeGalaxyRows(state.rows),
    [state.rows]
  );

  const positions = useMemo(
    () => buildLayout(graph),
    [graph]
  );

  const selectedGraphNode = selectedNode
    ? graph.nodeMap.get(selectedNode.id)
    : null;
  const selectedSystemName =
    selectedNode?.kind === "System"
      ? selectedGraphNode?.properties?.name || ""
      : "";

  const laneRenderData = useMemo(() => {
    const pairCounts = new Map();

    return graph.laneRelations
      .map((lane) => {
        const start = positions.get(lane.startId);
        const end = positions.get(lane.endId);

        if (!start || !end) return null;

        const pairKey = [lane.startId, lane.endId].sort().join("|");
        const pairIndex = pairCounts.get(pairKey) || 0;
        pairCounts.set(pairKey, pairIndex + 1);

        return {
          lane,
          ...lanePath(start, end, lane, pairIndex),
        };
      })
      .filter(Boolean);
  }, [graph.laneRelations, positions]);

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
      setZoom(clampedZoom);
      zoomRef.current = clampedZoom;
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
      startPan: pan,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    const svg = svgRef.current;

    if (!drag || !svg || drag.pointerId !== event.pointerId) return;

    const rect = svg.getBoundingClientRect();
    const scaleX = VIEW_WIDTH / Math.max(1, rect.width);
    const scaleY = VIEW_HEIGHT / Math.max(1, rect.height);

    setPan({
      x: drag.startPan.x + (event.clientX - drag.clientX) * scaleX,
      y: drag.startPan.y + (event.clientY - drag.clientY) * scaleY,
    });
  }

  function handlePointerUp(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function selectLane(lane) {
    triggerInterfaceSfx();

    const start = positions.get(lane.startId);
    const end = positions.get(lane.endId);
    const travel = calculateLaneTravelHours(start, end);
    const spokenLine = buildLaneSpeechLine(lane);

    if (typeof onNarrate === "function") {
      onNarrate(spokenLine);
    } else {
      speakLaneSpeechLine(spokenLine);
    }

    setSelectedLane({
      ...lane,
      travel,
    });
    setSelectedNode(null);
    setSelectedSystemName("");
    setNodeOpenError("");
    setOpeningNodeName("");
  }

  async function selectNode(node) {
    triggerInterfaceSfx();

    setSelectedLane(null);

    const kind = nodeHasLabel(node, "Sector") ? "Sector" : "System";
    const name = node?.properties?.name || "";

    setSelectedNode({
      kind,
      id: node.id,
    });
    setNodeOpenError("");
    setOpeningNodeName(name);

    try {
      if (typeof onOpenEntry !== "function") {
        throw new Error("Databank entry handler is unavailable.");
      }

      await onOpenEntry({
        name,
        kind,
        mapNodeId: node.id,
      });
    } catch (error) {
      console.warn("MAP DATABANK LOOKUP FAILURE", error);
      setNodeOpenError(
        error instanceof Error
          ? error.message
          : "Unable to open the selected databank file."
      );
    } finally {
      setOpeningNodeName("");
    }
  }

  if (state.loading) {
    return (
      <section className="galaxy-map-page terminal-frame">
        <div className="galaxy-map-loading">
          LOADING SECTOR NAVIGATION MATRIX...
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="galaxy-map-page terminal-frame">
        <div className="galaxy-map-error">
          MAP LINK FAILURE // {state.error}
        </div>
      </section>
    );
  }

  return (
    <section className="galaxy-map-page">
      <div className="galaxy-map-header terminal-frame">
        <div>
          <div className="terminal-small">
            NAVIGATION ARRAY // PRIMUS AND GUILD DATA REDACTED
          </div>
          <h2>SECTOR TRANSIT MATRIX</h2>
        </div>

        <div className="galaxy-map-stats">
          <span>{graph.sectors.length} SECTORS</span>
          <span>{graph.systems.length} SYSTEMS</span>
          <span>{graph.laneRelations.length} LANES</span>
        </div>
      </div>

      <div className="galaxy-map-toolbar terminal-frame">
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            triggerInterfaceSfx();
            applyZoom(zoom * 1.18);
          }}
        >
          [+]
        </button>
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            triggerInterfaceSfx();
            applyZoom(zoom / 1.18);
          }}
        >
          [-]
        </button>
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            triggerInterfaceSfx();
            resetView();
          }}
        >
          [RESET]
        </button>
        <button
          type="button"
          className={`terminal-button ${
            showSystems ? "map-control-active" : ""
          }`}
          onClick={() => {
            triggerInterfaceSfx();
            setShowSystems((current) => !current);
          }}
          aria-pressed={showSystems}
        >
          {showSystems ? "[COLLAPSE SECTORS]" : "[EXPAND SECTORS]"}
        </button>
        <button
          type="button"
          className={`terminal-button ${
            showSectorLabels ? "map-control-active" : ""
          }`}
          onClick={() => {
            triggerInterfaceSfx();
            setShowSectorLabels((current) => !current);
          }}
          aria-pressed={showSectorLabels}
        >
          [SECTOR LABELS]
        </button>
        <button
          type="button"
          className={`terminal-button ${
            showFactionLabels ? "map-control-active" : ""
          }`}
          onClick={() => {
            triggerInterfaceSfx();
            setShowFactionLabels((current) => !current);
          }}
          aria-pressed={showFactionLabels}
        >
          [FACTIONS]
        </button>
        <button
          type="button"
          className={`terminal-button ${
            showSystemLabels ? "map-control-active" : ""
          }`}
          onClick={() => {
            triggerInterfaceSfx();
            setShowSystemLabels((current) => !current);
          }}
          aria-pressed={showSystemLabels}
          disabled={!showSystems}
        >
          [SYSTEM LABELS]
        </button>
        <button
          type="button"
          className={`terminal-button ${
            showLaneLabels ? "map-control-active" : ""
          }`}
          onClick={() => {
            triggerInterfaceSfx();
            setShowLaneLabels((current) => !current);
          }}
          aria-pressed={showLaneLabels}
        >
          [LANE LABELS]
        </button>
        <span className="galaxy-zoom-readout">
          ZOOM {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="galaxy-map-layout">
        <div className="galaxy-map-viewport terminal-frame">
          <svg
            ref={svgRef}
            className="galaxy-map-svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label="Interactive graph of sectors, systems, and hyperspace lanes"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern
                id="galaxyGridSmall"
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 28 0 L 0 0 0 28"
                  className="galaxy-grid-small"
                />
              </pattern>

              <pattern
                id="galaxyGridLarge"
                width="140"
                height="140"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="140"
                  height="140"
                  fill="url(#galaxyGridSmall)"
                />
                <path
                  d="M 140 0 L 0 0 0 140"
                  className="galaxy-grid-large"
                />
              </pattern>

              <filter
                id="galaxyGlow"
                x="-80%"
                y="-80%"
                width="260%"
                height="260%"
              >
                <feGaussianBlur stdDeviation="3.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              fill="url(#galaxyGridLarge)"
              onPointerDown={handlePointerDown}
            />

            <g
              transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
            >
              {showSystems ? (
                <g className="galaxy-membership-links">
                  {graph.inSectorRelations.map((relation) => {
                    const start = positions.get(relation.startId);
                    const end = positions.get(relation.endId);

                    if (!start || !end) return null;

                    return (
                      <line
                        key={relation.semanticKey}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              ) : null}

              <g className="galaxy-lanes">
                {laneRenderData.map(({ lane, d, labelX, labelY }) => {
                  if (!showSystems && laneTouchesSystem(lane, graph)) {
                    return null;
                  }

                  const risk = String(
                    lane?.properties?.risk || "unknown"
                  )
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-");

                  return (
                    <g key={lane.semanticKey}>
                      <path
                        d={d}
                        className={`galaxy-lane galaxy-lane-${risk} ${
                          selectedLane?.semanticKey === lane.semanticKey
                            ? "galaxy-lane-selected"
                            : ""
                        }`}
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => selectLane(lane)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectLane(lane);
                          }
                        }}
                      />

                    </g>
                  );
                })}
              </g>

              <g className="galaxy-sector-nodes">
                {graph.sectors.map((sector) => {
                  const position = positions.get(sector.id);
                  if (!position) return null;

                  const isSelected = selectedNode?.id === sector.id;
                  const name = sector?.properties?.name || "UNNAMED SECTOR";
                  const primaryCiv =
                    sector?.properties?.primaryCiv || "UNALIGNED";

                  return (
                    <g
                      key={sector.id}
                      className={`galaxy-sector-node ${
                        isSelected ? "galaxy-node-selected" : ""
                      }`}
                      transform={`translate(${position.x} ${position.y})`}
                      style={{
                        "--sector-accent": sectorAccent(primaryCiv),
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => void selectNode(sector)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void selectNode(sector);
                        }
                      }}
                    >
                      <circle
                        r="30"
                        className="galaxy-sector-halo"
                        filter="url(#galaxyGlow)"
                      />
                      <circle r="21" className="galaxy-sector-core" />
                      <path
                        d="M -9 0 H 9 M 0 -9 V 9"
                        className="galaxy-sector-crosshair"
                      />
                      {showSectorLabels || isSelected ? (
                        <text
                          y="-42"
                          textAnchor="middle"
                          className="galaxy-sector-label"
                        >
                          {name}
                        </text>
                      ) : null}

                      {showFactionLabels ? (
                        <text
                          y="88"
                          textAnchor="middle"
                          className="galaxy-sector-civ"
                        >
                          {primaryCiv}
                        </text>
                      ) : null}
                      <title>
                        {name} // {primaryCiv}
                      </title>
                    </g>
                  );
                })}
              </g>

              {showSystems ? (
                <g className="galaxy-system-nodes">
                  {graph.systems.map((system) => {
                  const position = positions.get(system.id);
                  if (!position) return null;

                  const isSelected = selectedNode?.id === system.id;
                  const name = system?.properties?.name || "UNNAMED SYSTEM";
                  const displayLabel =
                    showSystemLabels || isSelected;
                  const labelPlacement = getSystemLabelPlacement(
                    system,
                    position,
                    graph,
                    positions
                  );

                  return (
                    <g
                      key={system.id}
                      className={`galaxy-system-node ${
                        isSelected ? "galaxy-node-selected" : ""
                      }`}
                      transform={`translate(${position.x} ${position.y})`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => void selectNode(system)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void selectNode(system);
                        }
                      }}
                    >
                      <circle r="8" className="galaxy-system-core" />
                      <circle r="13" className="galaxy-system-ring" />

                      {displayLabel ? (
                        <>
                          <line
                            x1={labelPlacement.x * 0.42}
                            y1={labelPlacement.y * 0.42}
                            x2={labelPlacement.x * 0.78}
                            y2={labelPlacement.y * 0.78}
                            className="galaxy-system-label-leader"
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            x={labelPlacement.x}
                            y={labelPlacement.y}
                            textAnchor={labelPlacement.textAnchor}
                            dominantBaseline="middle"
                            className="galaxy-system-label"
                          >
                            {name}
                          </text>
                        </>
                      ) : null}

                      <title>{name}</title>
                    </g>
                  );
                  })}
                </g>
              ) : null}

              {showLaneLabels ? (
                <g className="galaxy-lane-labels">
                  {laneRenderData.map(({
                    lane,
                    labelText,
                    labelX,
                    labelY,
                    labelWidth,
                    anchorX,
                    anchorY,
                    leaderD,
                  }) => {
                    if (!showSystems && laneTouchesSystem(lane, graph)) {
                      return null;
                    }

                    return (
                      <g
                        key={`label-${lane.semanticKey}`}
                        className={`galaxy-lane-label-callout ${
                          selectedLane?.semanticKey === lane.semanticKey
                            ? "galaxy-lane-label-selected"
                            : ""
                        }`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => selectLane(lane)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectLane(lane);
                          }
                        }}
                      >
                        <path
                          d={leaderD}
                          className="galaxy-lane-label-leader"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle
                          cx={anchorX}
                          cy={anchorY}
                          r="3.2"
                          className="galaxy-lane-label-anchor"
                          vectorEffect="non-scaling-stroke"
                        />
                        <g
                          transform={`translate(${labelX} ${labelY})`}
                          className="galaxy-lane-label-block"
                        >
                          <rect
                            x={-labelWidth / 2}
                            y="-8.5"
                            width={labelWidth}
                            height="17"
                            rx="2"
                            className="galaxy-lane-label-plate"
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            className="galaxy-lane-label"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {labelText}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              ) : null}
            </g>
          </svg>
        </div>

        <div className="galaxy-map-detail-slot">
          <div className="galaxy-map-detail-stack">
            {selectedLane ? (
              <LaneDetailsPanel selectedLane={selectedLane} graph={graph} />
            ) : detailPanel || (
              <aside className="galaxy-map-inspector terminal-frame">
                <div className="galaxy-inspector-title">
                  {openingNodeName
                    ? `RETRIEVING // ${openingNodeName}`
                    : "DATABANK LINK STANDBY"}
                </div>

                {nodeOpenError ? (
                  <p className="galaxy-map-error-text">
                    LINK FAILURE // {nodeOpenError}
                  </p>
                ) : (
                  <p className="galaxy-muted">
                    Select a system or sector node to open its matching entry
                    from entries.json, or select a hyperspace lane to inspect
                    its route and travel time.
                  </p>
                )}

                <div className="galaxy-legend">
                  <div>
                    <span className="legend-sector" /> SECTOR NODE
                  </div>
                  <div>
                    <span className="legend-system" /> SYSTEM NODE
                  </div>
                  <div>
                    <span className="legend-lane legend-lane-low" /> LOW RISK
                  </div>
                  <div>
                    <span className="legend-lane legend-lane-med" /> MED RISK
                  </div>
                  <div>
                    <span className="legend-lane legend-lane-high" /> HIGH RISK
                  </div>
                </div>
              </aside>
            )}

            {!selectedLane && selectedSystemName ? (
              <SolarSystemDiagram
                systemName={selectedSystemName}
                onOpenBody={(body) =>
                  onOpenEntry?.({
                    name: body?.name || "",
                    kind: "Celestial Body",
                    mapNodeId: body?.id || body?.diagramId || "",
                  })
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
