import React, { useEffect, useMemo, useRef, useState } from "react";

const ENTRIES_URL = `${import.meta.env.BASE_URL}data/entries.json`;
const CURRENT_YEAR = 4145;
const APPROX_EXODUS_YEAR = CURRENT_YEAR - 1000;
const APPROX_FIRST_CONTACT_YEAR = CURRENT_YEAR - 100;

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 760;
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 3.8;
const DEFAULT_ZOOM = 1;

const YEAR_PIXELS = 12;
const WORLD_LEFT = 150;
const WORLD_RIGHT_PADDING = 190;
const AXIS_Y = 108;
const ROW_TOP = 176;
const ROW_HEIGHT = 82;
const ROW_BOTTOM_PADDING = 120;
const EVENT_COLLISION_PADDING = 34;

const MANUAL_EVENTS = [
  {
    id: "timeline-pre-exodus-primus-collapse",
    name: "Late Primus Collapse",
    kind: "Glossary",
    start: 3000,
    end: APPROX_EXODUS_YEAR - 35,
    precision: "exact",
    category: "history",
    linkName: "Late Primus Collapse",
    summary:
      "Primus entered a long period of war, famine, plague, industrial collapse, and city-state conflict before the Exodus.",
  },
  {
    id: "timeline-exodus",
    name: "The Exodus",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR,
    end: APPROX_EXODUS_YEAR+26,
    precision: "exact",
    category: "history",
    linkName: "The Exodus",
    summary:
      "Fragments of Primus scattered into the void through primitive Manifold travel nearly one thousand years before the current year.",
  },
  {
    id: "timeline-guild-emergence",
    name: "The Guild Emerges",
    kind: "Glossary",
    start: APPROX_EXODUS_YEAR + 126,
    end: APPROX_EXODUS_YEAR + 126,
    precision: "exact",
    category: "political",
    linkName: "The Guild Directorate",
    summary:
      "The Guild emerged in the chaos after the Exodus, perfected Manifold drives, charted stable lanes, and consolidated interstellar movement.",
  },
  {
    id: "timeline-crucible-discovery",
    name: "Crucible And Resonance Discovery",
    kind: "Glossary",
    start: 4000,
    end: 4000,
    precision: "exact",
    category: "technology",
    linkName: "Resonance",
    summary:
      "Relic fragments revealed a living current of power from the Crucible. This discovery led to Resonance and Core development.",
  },
  {
    id: "timeline-warp-beast",
    name: "First Warp Beast Appearance",
    kind: "Glossary",
    start: 4020,
    end: 4020,
    precision: "exact",
    category: "conflict",
    linkName: "Warp Beasts",
    summary:
      "The first Warp Beast appeared.",
  },
  {
    id: "timeline-core-wars",
    name: "Core Proliferation Crisis",
    kind: "Glossary",
    start: 4000,
    end: 4050,
    precision: "exact",
    category: "conflict",
    linkName: "Core Proliferation Crisis",
    summary:
      "Unregulated Core forging caused disasters and wars until the Guild seized or bought the means of stable Core production.",
  },
  {
    id: "timeline-first-contact",
    name: "First Contact",
    kind: "Glossary",
    start: APPROX_FIRST_CONTACT_YEAR,
    end: APPROX_FIRST_CONTACT_YEAR,
    precision: "exact",
    category: "threat",
    linkName: "First Contact",
    summary:
      "First Contact proper came with the Mims. Systems fell silent, crews collapsed under hallucination, and the Guild could no longer hide the threat.",
  },
  {
    id: "timeline-new-dark-age",
    name: "The New Dark Age",
    kind: "Glossary",
    start: APPROX_FIRST_CONTACT_YEAR,
    end: CURRENT_YEAR,
    precision: "exact",
    category: "history",
    linkName: "The New Dark Age",
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
  const presentMatch = text.match(/(\d{3,4})\s*(?:[–—-]|\bto\b)\s*present\b/i);

  if (presentMatch) {
    const start = Number(presentMatch[1]);

    if (Number.isFinite(start)) {
      return {
        start,
        end: CURRENT_YEAR,
        openEnded: true,
      };
    }
  }

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
        openEnded: false,
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
        openEnded: false,
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
        openEnded: Boolean(years.openEnded),
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
      openEnded: Boolean(event.openEnded),
    }))
    .sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start;
      if (left.end !== right.end) return left.end - right.end;
      return left.name.localeCompare(right.name);
    });
}

function yearLabel(event) {
  if (event.openEnded) return `${event.start}–Present`;
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
    event.openEnded ? "timeline-event-open-ended" : "",
    selectedEvent?.id === event.id ? "timeline-event-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function estimateLabelWidth(event) {
  const nameLength = cleanText(event.name).length;
  const yearLength = yearLabel(event).length;

  return clamp(Math.max(nameLength * 7.2, yearLength * 6.8) + 42, 120, 430);
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function chooseTimelineRow(rows, occupiedRange) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const hasCollision = rows[rowIndex].some((range) =>
      rangesOverlap(range, occupiedRange)
    );

    if (!hasCollision) {
      rows[rowIndex].push(occupiedRange);
      return rowIndex;
    }
  }

  rows.push([occupiedRange]);
  return rows.length - 1;
}

function TimelineEventDetails({ event, onOpen }) {
  if (!event) {
    return (
      <aside className="timeline-inspector terminal-frame">
        <div className="timeline-inspector-kicker">TIMELINE LINK STANDBY</div>
        <div className="timeline-inspector-title">NO EVENT SELECTED</div>
        <p className="timeline-muted">
          Select a node or range to open its timeline record. Events share rows
          only when their markers, ranges, and labels do not overlap.
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
  const initializedViewRef = useRef(false);
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
    () =>
      state.rows
        .map((row, index) => normalizeExportRow(row, index))
        .filter(Boolean),
    [state.rows]
  );

  const events = useMemo(() => buildTimelineEvents(entries), [entries]);

  const timelineBounds = useMemo(() => {
    const years = events.flatMap((event) => [event.start, event.end]);
    const minYear = Math.min(...years, APPROX_EXODUS_YEAR - 150);
    const maxYear = Math.max(...years, CURRENT_YEAR);

    return {
      minYear: Math.floor((minYear - 10) / 10) * 10,
      maxYear: Math.ceil((maxYear + 10) / 10) * 10,
    };
  }, [events]);

  const timelineWorld = useMemo(() => {
    const width =
      WORLD_LEFT +
      (timelineBounds.maxYear - timelineBounds.minYear) * YEAR_PIXELS +
      WORLD_RIGHT_PADDING;

    return {
      width: Math.max(width, VIEW_WIDTH),
      height: VIEW_HEIGHT,
    };
  }, [timelineBounds]);

  function xForYear(year) {
    return WORLD_LEFT + (year - timelineBounds.minYear) * YEAR_PIXELS;
  }

  const positionedEvents = useMemo(() => {
    const rows = [];

    return events.map((event) => {
      const startX = xForYear(event.start);
      const endX = xForYear(event.end);
      const centerX = (startX + endX) / 2;
      const labelWidth = estimateLabelWidth(event);
      const eventStart = Math.min(startX, endX);
      const eventEnd = Math.max(startX, endX);
      const occupiedRange = {
        start:
          Math.min(eventStart, centerX - labelWidth / 2) -
          EVENT_COLLISION_PADDING,
        end:
          Math.max(eventEnd, centerX + labelWidth / 2) +
          EVENT_COLLISION_PADDING,
      };
      const rowIndex = chooseTimelineRow(rows, occupiedRange);
      const y = ROW_TOP + rowIndex * ROW_HEIGHT;

      return {
        ...event,
        rowIndex,
        startX,
        endX,
        centerX,
        y,
        labelY: y + 32,
        yearY: y + 18,
        kindY: y + 46,
        labelWidth,
        width: Math.max(16, endX - startX),
      };
    });
  }, [events, timelineBounds]);

  const rowCount = useMemo(() => {
    if (!positionedEvents.length) return 1;

    return Math.max(...positionedEvents.map((event) => event.rowIndex)) + 1;
  }, [positionedEvents]);

  const worldHeight = Math.max(
    VIEW_HEIGHT,
    ROW_TOP + rowCount * ROW_HEIGHT + ROW_BOTTOM_PADDING
  );

  const majorTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(timelineBounds.minYear / 50) * 50;

    for (let year = first; year <= timelineBounds.maxYear; year += 50) {
      ticks.push(year);
    }

    return ticks;
  }, [timelineBounds]);

  const minorTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(timelineBounds.minYear / 10) * 10;

    for (let year = first; year <= timelineBounds.maxYear; year += 10) {
      if (year % 50 !== 0) {
        ticks.push(year);
      }
    }

    return ticks;
  }, [timelineBounds]);

  function getFocusPan(focusYear = 3820) {
    const focusX = xForYear(focusYear);

    return {
      x: 120 - focusX * DEFAULT_ZOOM,
      y: 0,
    };
  }

  useEffect(() => {
    if (!positionedEvents.length || initializedViewRef.current) return;

    initializedViewRef.current = true;
    const nextPan = getFocusPan(3820);
    zoomRef.current = DEFAULT_ZOOM;
    panRef.current = nextPan;
    setZoom(DEFAULT_ZOOM);
    setPan(nextPan);
  }, [positionedEvents.length, timelineBounds]);

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

  function setViewport(nextZoom, nextPan) {
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  }

  function resetView() {
    setViewport(DEFAULT_ZOOM, getFocusPan(3820));
  }

  function focusYear(year) {
    const focusX = xForYear(year);
    setViewport(1, {
      x: VIEW_WIDTH / 2 - focusX,
      y: 0,
    });
  }

  function applyZoom(nextZoom, anchor = null) {
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

    if (!anchor) {
      setViewport(clampedZoom, panRef.current);
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

    setViewport(clampedZoom, nextPan);
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

  const currentYearX = xForYear(CURRENT_YEAR);

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
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            triggerInterfaceSfx();
            focusYear(APPROX_EXODUS_YEAR);
          }}
        >
          [EXODUS]
        </button>
        <button
          type="button"
          className="terminal-button"
          onClick={() => {
            triggerInterfaceSfx();
            focusYear(CURRENT_YEAR);
          }}
        >
          [CURRENT]
        </button>
        <span className="timeline-zoom-readout">
          ZOOM {Math.round(zoom * 100)}% // DRAG TO PAN // WHEEL TO ZOOM
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
              width={Math.max(timelineWorld.width, VIEW_WIDTH * 4)}
              height={Math.max(worldHeight, VIEW_HEIGHT * 2)}
              x={-VIEW_WIDTH * 2}
              y={-VIEW_HEIGHT}
              fill="url(#timelineGridLarge)"
              onPointerDown={handlePointerDown}
            />

            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <line
                x1={WORLD_LEFT}
                y1={AXIS_Y}
                x2={timelineWorld.width - WORLD_RIGHT_PADDING}
                y2={AXIS_Y}
                className="timeline-axis"
                vectorEffect="non-scaling-stroke"
              />

              {minorTicks.map((year) => {
                const x = xForYear(year);

                return (
                  <g key={year} className="timeline-minor-tick">
                    <line
                      x1={x}
                      y1={AXIS_Y - 12}
                      x2={x}
                      y2={worldHeight - 44}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {majorTicks.map((year) => {
                const x = xForYear(year);

                return (
                  <g key={year} className="timeline-tick">
                    <line
                      x1={x}
                      y1={AXIS_Y - 22}
                      x2={x}
                      y2={worldHeight - 44}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={x} y={AXIS_Y - 34} textAnchor="middle">
                      {year}
                    </text>
                  </g>
                );
              })}

              <line
                x1={currentYearX}
                y1={AXIS_Y - 34}
                x2={currentYearX}
                y2={worldHeight - 44}
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
                    <rect
                      x={Math.min(event.startX, event.centerX - event.labelWidth / 2) - 18}
                      y={event.y - 17}
                      width={
                        Math.max(
                          Math.abs(event.endX - event.startX),
                          event.labelWidth
                        ) + 36
                      }
                      height="70"
                      className="timeline-event-hitbox"
                    />

                    <line
                      x1={event.centerX}
                      y1={AXIS_Y}
                      x2={event.centerX}
                      y2={event.y}
                      className="timeline-event-leader"
                      vectorEffect="non-scaling-stroke"
                    />

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
                          r={selected ? "8" : "6"}
                          className="timeline-event-range-cap"
                          filter={selected ? "url(#timelineGlow)" : undefined}
                        />
                        {!event.openEnded ? (
                          <circle
                            cx={event.endX}
                            cy={event.y}
                            r={selected ? "8" : "6"}
                            className="timeline-event-range-cap"
                            filter={selected ? "url(#timelineGlow)" : undefined}
                          />
                        ) : null}
                      </>
                    ) : (
                      <circle
                        cx={event.centerX}
                        cy={event.y}
                        r={selected ? "10" : "7"}
                        className="timeline-event-node"
                        filter={selected ? "url(#timelineGlow)" : undefined}
                      />
                    )}

                    <text
                      x={event.centerX}
                      y={event.yearY}
                      textAnchor="middle"
                      className="timeline-event-year"
                    >
                      {yearLabel(event)}
                    </text>

                    <text
                      x={event.centerX}
                      y={event.labelY}
                      textAnchor="middle"
                      className="timeline-event-label"
                    >
                      {event.name}
                    </text>

                    <text
                      x={event.centerX}
                      y={event.kindY}
                      textAnchor="middle"
                      className="timeline-event-kind"
                    >
                      {String(event.kind || "Timeline").toUpperCase()}
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
