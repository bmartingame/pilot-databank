import React, { useEffect, useMemo, useRef, useState } from "react";

const ENTRIES_URL = `${import.meta.env.BASE_URL}data/entries.json`;
const CURRENT_YEAR = 4145;
const APPROX_EXODUS_YEAR = CURRENT_YEAR - 1000;
const APPROX_FIRST_CONTACT_YEAR = CURRENT_YEAR - 100;

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 760;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 3.4;
const DEFAULT_ZOOM = 1;

const MANUAL_EVENTS = [
  {
    id: "timeline-pre-exodus-primus-collapse",
    name: "Late Primus Collapse",
    kind: "Glossary",
    start: 3000,
    end: APPROX_EXODUS_YEAR - 35,
    precision: "approximate",
    category: "history",
    linkName: "Primus",
    summary:
      "Primus entered a long period of war, famine, plague, industrial collapse, and city-state conflict before the Exodus.",
  },
  {
    id: "timeline-stars-darken",
    name: "The Stars Begin To Go Dark",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR - 45,
    end: APPROX_EXODUS_YEAR - 20,
    precision: "approximate",
    category: "history",
    linkName: "The War",
    summary:
      "Astronomers confirmed a moving pattern of extinguished suns, forcing the surviving cities of Primus to look outward.",
  },
  {
    id: "timeline-manifold-ftl",
    name: "Primitive Manifold FTL",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR - 20,
    end: APPROX_EXODUS_YEAR,
    precision: "approximate",
    category: "technology",
    linkName: "Manifold Engine",
    summary:
      "Early faster-than-light travel through the Manifold made evacuation possible, but it remained dangerous and expensive.",
  },
  {
    id: "timeline-exodus",
    name: "The Exodus",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR,
    end: APPROX_EXODUS_YEAR,
    precision: "approximate",
    category: "history",
    linkName: "The Exodus",
    summary:
      "Fragments of Primus scattered into the void through primitive Manifold travel nearly one thousand years before the current year.",
  },
  {
    id: "timeline-guild-emergence",
    name: "The Guild Emerges",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR + 5,
    end: APPROX_EXODUS_YEAR + 90,
    precision: "approximate",
    category: "political",
    linkName: "The Guild",
    summary:
      "The Guild emerged in the chaos after the Exodus, perfected Manifold drives, charted stable lanes, and consolidated interstellar movement.",
  },
  {
    id: "timeline-crucible-discovery",
    name: "Crucible And Resonance Discovery",
    kind: "Glossary",
    start: 3650,
    end: 3725,
    precision: "approximate",
    category: "technology",
    linkName: "Resonance",
    summary:
      "Relic fragments revealed a living current of power from the Crucible. This discovery led to Resonance and Core development.",
  },
  {
    id: "timeline-core-wars",
    name: "Core Proliferation Crisis",
    kind: "Glossary",
    start: 3725,
    end: 3820,
    precision: "approximate",
    category: "conflict",
    linkName: "Cores",
    summary:
      "Unregulated Core forging caused disasters and wars until the Guild seized or bought the means of stable Core production.",
  },
  {
    id: "timeline-dmn-frontier",
    name: "DMN-Units Deployed To Frontier",
    kind: "Glossary",
    start: 3820,
    end: 3900,
    precision: "approximate",
    category: "military",
    linkName: "DMN-Units",
    summary:
      "Warp Beast attacks along Guild lanes forced frontier deployments of DMN-Units.",
  },
  {
    id: "timeline-dream-eaters",
    name: "Dream-Eaters Discovered",
    kind: "Threat",
    start: 3950,
    end: 4000,
    precision: "approximate",
    category: "threat",
    linkName: "Dream-Eaters",
    summary:
      "Lesser Mim emanations were uncovered after colonies fell into collective nightmare and comatose collapse.",
  },
  {
    id: "timeline-first-contact",
    name: "First Contact",
    kind: "Glossary",
    start: APPROX_FIRST_CONTACT_YEAR,
    end: APPROX_FIRST_CONTACT_YEAR,
    precision: "approximate",
    category: "threat",
    linkName: "First Contact",
    summary:
      "First Contact proper came with the Mims. Systems fell silent, crews collapsed under hallucination, and the Guild could no longer hide the threat.",
  },
  {
    id: "timeline-new-dark-age",
    name: "The Dark Age",
    kind: "Glossary",
    start: APPROX_FIRST_CONTACT_YEAR,
    end: CURRENT_YEAR,
    precision: "approximate",
    category: "history",
    linkName: "First Contact",
    summary:
      "In the century since First Contact, sectors have gone dark, the Net has been restricted, and Guild-licensed forces hold civilization together.",
  },
  {
    id: "timeline-current-year",
    name: "Current Year",
    kind: "Glossary",
    start: CURRENT_YEAR,
    end: CURRENT_YEAR,
    precision: "exact",
    category: "current",
    linkName: "",
    summary:
      "The current year is 4145.",
  },
];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function titleCaseWords(value) {
  return cleanText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeExportRow(row, index) {
  const node = row?.n ?? row?.entry ?? row?.node ?? row;
  const properties = node?.properties ?? node;

  if (!properties || typeof properties !== "object") return null;

  return {
    ...properties,
    id:
      properties.id ||
      node?.elementId ||
      `static-entry-${index + 1}`,
    name:
      properties.name ||
      properties.title ||
      properties.slug ||
      `UNNAMED ENTRY ${index + 1}`,
  };
}

function getCanonicalRecordType(entry) {
  const raw = normalizeText(
    entry?.record_type ||
      entry?.type ||
      entry?.kind ||
      entry?.document_kind
  );

  if (!raw) return "Entry";
  if (raw === "sub-faction" || raw === "sub faction") return "Sub-Faction";
  if (raw === "celestial_body") return "Celestial Body";

  return titleCaseWords(raw.replace(/[_-]+/g, " "));
}

function parseDurationYears(duration) {
  const text = cleanText(duration);
  const match = text.match(/(\d{3,4})\s*[–—-]\s*(\d{2,4})/);

  if (match) {
    const start = Number(match[1]);
    let end = Number(match[2]);

    if (match[2].length === 2) {
      end = Math.floor(start / 100) * 100 + end;
    }

    if (Number.isFinite(start) && Number.isFinite(end)) {
      return {
        start: Math.min(start, end),
        end: Math.max(start, end),
      };
    }
  }

  const single = text.match(/\b(\d{3,4})\b/);

  if (single) {
    const year = Number(single[1]);

    if (Number.isFinite(year)) {
      return {
        start: year,
        end: year,
      };
    }
  }

  return null;
}

function buildConflictEvents(entries) {
  return entries
    .filter((entry) => getCanonicalRecordType(entry) === "Conflict")
    .map((entry) => {
      const years = parseDurationYears(entry.duration);

      if (!years) return null;

      return {
        id: entry.id,
        entryId: entry.id,
        name: entry.name || "Unnamed Conflict",
        kind: "Conflict",
        start: years.start,
        end: years.end,
        duration: entry.duration,
        precision: "exact",
        category: "conflict",
        summary:
          entry.description ||
          entry.summary ||
          entry.raw_text ||
          "Conflict entry pulled from entries.json.",
      };
    })
    .filter(Boolean);
}

function buildTimelineEvents(entries) {
  const conflictEvents = buildConflictEvents(entries);
  const events = [...MANUAL_EVENTS, ...conflictEvents];

  return events
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end))
    .map((event) => ({
      ...event,
      start: Number(event.start),
      end: Number(event.end),
    }))
    .sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start;
      if (left.end !== right.end) return left.end - right.end;
      return left.name.localeCompare(right.name);
    });
}

function laneForEvent(index) {
  const lanes = [0, 1, 2, 3, 4, 5, 6];

  return lanes[index % lanes.length];
}

function yearLabel(event) {
  if (event.start === event.end) return `${event.start}`;

  return `${event.start}–${event.end}`;
}

function isRangeEvent(event) {
  return event.end > event.start;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function eventClassName(event, selectedEvent) {
  return [
    "timeline-event",
    `timeline-event-${event.category || "history"}`,
    selectedEvent?.id === event.id ? "timeline-event-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function TimelineEventDetails({ event, onOpen }) {
  if (!event) {
    return (
      <aside className="timeline-inspector terminal-frame">
        <div className="timeline-inspector-kicker">TIMELINE LINK STANDBY</div>
        <div className="timeline-inspector-title">NO EVENT SELECTED</div>
        <p className="timeline-muted">
          Select a node or range to open its timeline record. Conflict ranges
          link directly to their Conflict entries. Historical nodes attempt to
          open their matching Glossary or Threat entries.
        </p>
      </aside>
    );
  }

  return (
    <aside className="timeline-inspector terminal-frame">
      <div className="timeline-inspector-kicker">
        {String(event.kind || "Timeline").toUpperCase()} // {yearLabel(event)}
      </div>
      <div className="timeline-inspector-title">{event.name}</div>

      <div className="timeline-detail-row">
        <span>DATE</span>
        <strong>{yearLabel(event)}</strong>
      </div>

      <div className="timeline-detail-row">
        <span>TYPE</span>
        <strong>{String(event.kind || "Timeline").toUpperCase()}</strong>
      </div>

      <div className="timeline-detail-row">
        <span>PRECISION</span>
        <strong>{String(event.precision || "exact").toUpperCase()}</strong>
      </div>

      {event.summary ? (
        <p className="timeline-summary">{event.summary}</p>
      ) : null}

      <button
        type="button"
        className="terminal-button timeline-open-button"
        onClick={() => onOpen?.(event)}
      >
        [OPEN LINKED ENTRY]
      </button>
    </aside>
  );
}

export default function TimelineMap({
  onOpenEntry,
  detailPanel = null,
  onInterfaceSfx = null,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const panRef = useRef({ x: 0, y: 0 });
  const [state, setState] = useState({
    loading: true,
    error: null,
    rows: [],
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [openError, setOpenError] = useState("");

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

    fetch(ENTRIES_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load entries.json (${response.status})`);
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

  const entries = useMemo(
    () => state.rows
      .map((row, index) => normalizeExportRow(row, index))
      .filter(Boolean),
    [state.rows]
  );

  const events = useMemo(
    () => buildTimelineEvents(entries),
    [entries]
  );

  const timelineBounds = useMemo(() => {
    const years = events.flatMap((event) => [event.start, event.end]);
    const minYear = Math.min(...years, APPROX_EXODUS_YEAR - 150);
    const maxYear = Math.max(...years, CURRENT_YEAR);

    return {
      minYear: Math.floor((minYear - 10) / 10) * 10,
      maxYear: Math.ceil((maxYear + 10) / 10) * 10,
    };
  }, [events]);

  const positionedEvents = useMemo(() => {
    const left = 95;
    const right = VIEW_WIDTH - 95;
    const axisWidth = right - left;
    const yearRange = Math.max(1, timelineBounds.maxYear - timelineBounds.minYear);
    const laneTop = 164;
    const laneHeight = 58;

    function xForYear(year) {
      return left + ((year - timelineBounds.minYear) / yearRange) * axisWidth;
    }

    return events.map((event, index) => {
      const lane = laneForEvent(index);
      const startX = xForYear(event.start);
      const endX = xForYear(event.end);
      const centerX = (startX + endX) / 2;
      const y = laneTop + lane * laneHeight;

      return {
        ...event,
        lane,
        startX,
        endX,
        centerX,
        y,
        labelY: y - 18,
        width: Math.max(16, endX - startX),
      };
    });
  }, [events, timelineBounds]);

  const decadeTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(timelineBounds.minYear / 50) * 50;

    for (let year = first; year <= timelineBounds.maxYear; year += 50) {
      ticks.push(year);
    }

    return ticks;
  }, [timelineBounds]);

  async function openEvent(event) {
    triggerInterfaceSfx();
    setSelectedEvent(event);
    setOpenError("");

    try {
      if (typeof onOpenEntry !== "function") {
        throw new Error("Timeline entry handler is unavailable.");
      }

      await onOpenEntry({
        id: event.entryId,
        name: event.linkName || event.name,
        kind: event.kind,
        timelineEventId: event.id,
      });
    } catch (error) {
      console.warn("TIMELINE DATABANK LOOKUP FAILURE", error);
      setOpenError(
        error instanceof Error
          ? error.message
          : "Unable to open the selected timeline file."
      );
    }
  }

  function resetView() {
    zoomRef.current = DEFAULT_ZOOM;
    panRef.current = { x: 0, y: 0 };
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }

  function applyZoom(nextZoom, anchor = null) {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

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

    zoomRef.current = clampedZoom;
    panRef.current = nextPan;
    setZoom(clampedZoom);
    setPan(nextPan);
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

  if (state.loading) {
    return (
      <section className="timeline-page terminal-frame">
        <div className="timeline-loading">LOADING CHRONOLOGY INDEX...</div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="timeline-page terminal-frame">
        <div className="timeline-error">TIMELINE LINK FAILURE // {state.error}</div>
      </section>
    );
  }

  return (
    <section className="timeline-page">
      <div className="timeline-header terminal-frame">
        <div>
          <div className="terminal-small">
            CHRONOLOGY ARRAY // CURRENT YEAR {CURRENT_YEAR}
          </div>
          <h2>HISTORICAL CONFLICT TIMELINE</h2>
        </div>

        <div className="timeline-stats">
          <span>{events.length} EVENTS</span>
          <span>{events.filter((event) => event.kind === "Conflict").length} CONFLICTS</span>
          <span>{timelineBounds.minYear}–{timelineBounds.maxYear}</span>
        </div>
      </div>

      <div className="timeline-toolbar terminal-frame">
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
        <span className="timeline-zoom-readout">
          ZOOM {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="timeline-layout">
        <div className="timeline-viewport terminal-frame">
          <svg
            ref={svgRef}
            className="timeline-svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label="Interactive history and conflict timeline"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern
                id="timelineGridSmall"
                width="28"
                height="28"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 28 0 L 0 0 0 28"
                  className="timeline-grid-small"
                />
              </pattern>

              <pattern
                id="timelineGridLarge"
                width="140"
                height="140"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width="140"
                  height="140"
                  fill="url(#timelineGridSmall)"
                />
                <path
                  d="M 140 0 L 0 0 0 140"
                  className="timeline-grid-large"
                />
              </pattern>

              <filter
                id="timelineGlow"
                x="-80%"
                y="-80%"
                width="260%"
                height="260%"
              >
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              fill="url(#timelineGridLarge)"
              onPointerDown={handlePointerDown}
            />

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <line
                x1="95"
                y1="116"
                x2={VIEW_WIDTH - 95}
                y2="116"
                className="timeline-axis"
                vectorEffect="non-scaling-stroke"
              />

              {decadeTicks.map((year) => {
                const x =
                  95 +
                  ((year - timelineBounds.minYear) /
                    Math.max(1, timelineBounds.maxYear - timelineBounds.minYear)) *
                    (VIEW_WIDTH - 190);

                return (
                  <g key={year} className="timeline-tick">
                    <line
                      x1={x}
                      y1="96"
                      x2={x}
                      y2="662"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={x} y="86" textAnchor="middle">
                      {year}
                    </text>
                  </g>
                );
              })}

              <line
                x1={
                  95 +
                  ((CURRENT_YEAR - timelineBounds.minYear) /
                    Math.max(1, timelineBounds.maxYear - timelineBounds.minYear)) *
                    (VIEW_WIDTH - 190)
                }
                y1="86"
                x2={
                  95 +
                  ((CURRENT_YEAR - timelineBounds.minYear) /
                    Math.max(1, timelineBounds.maxYear - timelineBounds.minYear)) *
                    (VIEW_WIDTH - 190)
                }
                y2="680"
                className="timeline-current-line"
                vectorEffect="non-scaling-stroke"
              />

              {positionedEvents.map((event) => {
                const selected = selectedEvent?.id === event.id;
                const className = eventClassName(event, selectedEvent);
                const range = isRangeEvent(event);

                return (
                  <g
                    key={event.id}
                    className={className}
                    onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                    onClick={() => void openEvent(event)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                        keyEvent.preventDefault();
                        void openEvent(event);
                      }
                    }}
                  >
                    {range ? (
                      <>
                        <line
                          x1={event.startX}
                          y1={event.y}
                          x2={event.endX}
                          y2={event.y}
                          className="timeline-event-range"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle
                          cx={event.startX}
                          cy={event.y}
                          r="7"
                          className="timeline-event-range-cap"
                          filter={selected ? "url(#timelineGlow)" : undefined}
                        />
                        <circle
                          cx={event.endX}
                          cy={event.y}
                          r="7"
                          className="timeline-event-range-cap"
                          filter={selected ? "url(#timelineGlow)" : undefined}
                        />
                      </>
                    ) : (
                      <circle
                        cx={event.centerX}
                        cy={event.y}
                        r={selected ? "11" : "8"}
                        className="timeline-event-node"
                        filter={selected ? "url(#timelineGlow)" : undefined}
                      />
                    )}

                    <line
                      x1={event.centerX}
                      y1="116"
                      x2={event.centerX}
                      y2={event.y}
                      className="timeline-event-leader"
                      vectorEffect="non-scaling-stroke"
                    />

                    <text
                      x={event.centerX}
                      y={event.labelY}
                      textAnchor="middle"
                      className="timeline-event-year"
                    >
                      {yearLabel(event)}
                    </text>
                    <text
                      x={event.centerX}
                      y={event.y + 24}
                      textAnchor="middle"
                      className="timeline-event-label"
                    >
                      {event.name}
                    </text>

                    <title>{event.name} // {yearLabel(event)}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="timeline-detail-slot">
          <div className="timeline-detail-stack">
            {detailPanel || (
              <>
                <TimelineEventDetails
                  event={selectedEvent}
                  onOpen={openEvent}
                />

                {openError ? (
                  <div className="timeline-link-error terminal-frame">
                    LINK FAILURE // {openError}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
