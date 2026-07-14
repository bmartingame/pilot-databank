
import React, { useEffect, useRef, useState } from "react";
import { getEntry, searchEntries, getRasterImageUrl, getSearchOptions } from "./api";
import { getRecordDisplayConfig, resolveRecordType } from "./recordDisplayConfig";
import SearchAutocompleteInput from "./SearchAutocomplete";
import GalaxyMap from "./GalaxyMap";
import "./styles.css";

const TTS_SETTINGS = {
  enabled: true,
  rate: 0.82,
  pitch: 0.55,
  volume: 0.82,
};

const TTS_PRONUNCIATION_REPLACEMENTS = [
    ["mechs", "meks"],
    ["mech", "mek"],
    ["DMN", "D M N"],
    ["CR", "C R"],
    ["exo", "ex-o"],
    ["voidship", "void ship"],
    ["Cerebrax", "Sehr-e-bracks"],
    ["cerebrax", "Sehr-e-bracks"],
    ["CEREBRAX", "Sehr-e-bracks"],
    ["gantries", "gan-trees"],
    ["Orak", "Or-rak"],
    ["orak", "Or-rak"],
    ["Chronodrakes", "Chro-no-drakes"],
    ["Chrono", "Chro-no"],
    ["Chronovores", "Chro-no-vores"],
    ["quadruped", "kwad-ru-ped"],
    ["Epoch", "E-pok"],
    ["Forgeheart", "Forge-heart"],
    ["Combatant", "Combat-ant"],
    ["Class I", "Class One"],
    ["Class V", "Class Five"],
    ["Class II", "Class Two"], 
    ["Class III", "Class Three"],
    ["Class IV", "Class Four"],
    ["Darknet", "Dark-net"],
    ["-I", "One"],
    ["-II", "Two"],
    ["-III", "Three"],
    ["-IV", "Four"],
    ["-V", "Five"],
    ["-VI", "Six"],
];

function applyTtsPronunciations(text) {
  let output = text || "";

  for (const [from, to] of TTS_PRONUNCIATION_REPLACEMENTS) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`\\b${escaped}\\b`, "gi"), to);
  }

  return output;
}

function getPilotVoice() {
  if (!("speechSynthesis" in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferredNames = [
    "Microsoft David",
    "Microsoft Mark",
    "Google US English",
    "Alex",
    "Daniel",
  ];

  for (const preferred of preferredNames) {
    const match = voices.find((voice) =>
      voice.name.toLowerCase().includes(preferred.toLowerCase())
    );
    if (match) return match;
  }

  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ||
    voices[0] ||
    null
  );
}

function speakDatabankLine(text, options = {}) {
  if (!TTS_SETTINGS.enabled || !("speechSynthesis" in window) || !text) return null;

  window.speechSynthesis.cancel();

  const spokenText = applyTtsPronunciations(text);
  const utterance = new SpeechSynthesisUtterance(spokenText);
  const voice = getPilotVoice();

  if (voice) utterance.voice = voice;

  utterance.rate = options.rate ?? TTS_SETTINGS.rate;
  utterance.pitch = options.pitch ?? TTS_SETTINGS.pitch;
  utterance.volume = options.volume ?? TTS_SETTINGS.volume;

  utterance.onend = options.onend || null;
  utterance.onerror = options.onerror || null;

  window.speechSynthesis.speak(utterance);
  return utterance;
}

function stopDatabankSpeech() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

let audioContextRef = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContextRef) {
    audioContextRef = new AudioContextClass();
  }

  if (audioContextRef.state === "suspended") {
    audioContextRef.resume();
  }

  return audioContextRef;
}

function makeNoiseBuffer(ctx, durationSeconds = 0.08) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const decay = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  return buffer;
}

function playNoiseBurst(ctx, startTime, duration, volume = 0.12, filterFreq = 1800) {
  const source = ctx.createBufferSource();
  source.buffer = makeNoiseBuffer(ctx, duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFreq, startTime);
  filter.Q.setValueAtTime(1.8, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(startTime);
  source.stop(startTime + duration + 0.01);
}

function playTone(ctx, startTime, frequency, duration, volume = 0.08, type = "square") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * 0.72), startTime + duration);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function playQuerySubmitSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Cassette transport thunk + short data chirps.
  playNoiseBurst(ctx, now, 0.055, 0.11, 420);
  playTone(ctx, now + 0.030, 110, 0.075, 0.06, "sawtooth");
  playTone(ctx, now + 0.105, 880, 0.045, 0.045, "square");
  playTone(ctx, now + 0.155, 1320, 0.035, 0.035, "square");
  playNoiseBurst(ctx, now + 0.205, 0.040, 0.055, 2400);
}

function playEntrySelectSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Relay click + CRT lock tone.
  playNoiseBurst(ctx, now, 0.030, 0.095, 2600);
  playNoiseBurst(ctx, now + 0.045, 0.022, 0.060, 1200);
  playTone(ctx, now + 0.065, 520, 0.050, 0.035, "triangle");
  playTone(ctx, now + 0.120, 260, 0.060, 0.030, "square");
}

function playEntryCloseSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Reverse relay snap + tape-stop dip.
  playNoiseBurst(ctx, now, 0.026, 0.080, 1700);
  playTone(ctx, now + 0.025, 340, 0.070, 0.035, "square");
  playTone(ctx, now + 0.080, 160, 0.085, 0.030, "sawtooth");
  playNoiseBurst(ctx, now + 0.150, 0.030, 0.040, 520);
}

function playNarrationStartSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tape head engage + speaker carrier tone.
  playNoiseBurst(ctx, now, 0.045, 0.070, 900);
  playTone(ctx, now + 0.035, 240, 0.055, 0.035, "square");
  playTone(ctx, now + 0.090, 760, 0.040, 0.030, "triangle");
  playNoiseBurst(ctx, now + 0.135, 0.040, 0.035, 3100);
}

function playNarrationStopSfx() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Hard mute relay + tape brake chirp.
  playNoiseBurst(ctx, now, 0.025, 0.085, 2100);
  playTone(ctx, now + 0.020, 520, 0.035, 0.035, "square");
  playTone(ctx, now + 0.065, 180, 0.070, 0.030, "sawtooth");
  playNoiseBurst(ctx, now + 0.125, 0.025, 0.035, 620);
}

function normalizeReadoutText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildEntryReadout(entry, data = null) {
  if (!entry) return "";

  const recordType = resolveRecordType(entry, data);
  const config = getRecordDisplayConfig(recordType);
  const lines = [`${entry.name}.`, `Type: ${recordType}.`];

  for (const meta of config.meta || []) {
    const value = resolveDisplayValue(meta.value, entry, data);
    if (hasDisplayValue(value)) {
      lines.push(`${meta.label}: ${formatDisplayValue(value)}.`);
    }
  }

  for (const section of config.sections || []) {
    if (section.readout === false) continue;

    if (section.type === "reports") {
      const reports = getReports(entry, data);
      for (const report of reports) {
        const label = report.label ? `${report.label}: ` : "";
        lines.push(`Report: ${label}${normalizeReadoutText(report.text)}.`);
      }
      continue;
    }

    if (section.type === "facts") {
      for (const field of section.fields || []) {
        const value = resolveDisplayValue(field.value, entry, data);
        if (hasDisplayValue(value)) {
          lines.push(`${field.label}: ${normalizeReadoutText(formatDisplayValue(value))}.`);
        }
      }
      continue;
    }

    if (section.type === "text") {
      const value = resolveDisplayValue(section.value, entry, data);
      if (hasDisplayValue(value)) {
        lines.push(`${section.title}: ${normalizeReadoutText(formatDisplayValue(value))}.`);
      }
    }
  }

  return lines.filter(Boolean).join(" ");
}


function snippet(value, maxLen = 220) {
  if (!value) return "";
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}...` : clean;
}

function collectText(...values) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function deriveFaction(entry, data = null) {
  if (entry?.faction) return entry.faction;
  if (data?.entry?.faction) return data.entry.faction;

  const corpus = collectText(
    entry?.name,
    entry?.collection_title,
    entry?.group_name,
    entry?.section_name,
    data?.collection?.title,
    data?.source_file?.file_name,
  );

  const rules = [
    ["CEREBRAX", ["cerebrax"]],
    ["KARNATE", ["karnate"]],
    ["PRIMUS", ["primus", "civilian", "common vehicles", "common vehicle"]],
    ["LUTHAN", ["luthan"]],
    ["JACKALS", ["jackals", "jackal"]],
    ["VOIDBORN", ["voidborn"]],
    ["PHAGE", ["phage"]],
    ["NEBULITE", ["nebulite", "nebullite"]],
    ["MIMS", ["mims"]],
    ["GUILD", ["guild"]],
    ["CROWN", ["crown"]],
    ["ORAK", ["orak"]],
    ["VEYRAN", ["veyran", "veyren"]],
    ["CINDRAL", ["cindral"]],
    ["HALIX", ["halix"]],
  ];

  for (const [label, needles] of rules) {
    if (needles.some((needle) => corpus.includes(needle))) return label;
  }

  return "UNAFFILIATED";
}

function getReports(entry, data = null) {
  if (data?.reports?.length) {
    return data.reports
      .filter((report) => report?.text)
      .map((report, index) => ({
        id: report.id || `report-${index}`,
        label: report.label || `REPORT ${index + 1}`,
        text: report.text,
      }));
  }

  if (entry?.report_text) {
    return [{
      id: "report-inline",
      label: entry.report_label || "REPORT",
      text: entry.report_text,
    }];
  }

  return [];
}


function getThreatClass(entry) {
  if (!entry?.threat_category) return "";
  return `Class ${entry.threat_category}${entry.threat_category_name ? ` - ${entry.threat_category_name}` : ""}`;
}

function getGlossaryDescription(entry) {
  return entry?.description || entry?.body || "";
}


function getRawEntry(entry, data = null) {
  return data?.entry || entry || {};
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatDisplayValue(value) {
  if (typeof value === "boolean") return value ? "YES" : "NO";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, item]) => hasDisplayValue(item))
      .map(([key, item]) => `${key}: ${item}`)
      .join(", ");
  }
  return String(value);
}

function resolveDisplayValue(valueDefinition, entry, data = null) {
  const rawEntry = getRawEntry(entry, data);

  if (Array.isArray(valueDefinition)) {
    for (const candidate of valueDefinition) {
      const value = resolveDisplayValue(candidate, entry, data);
      if (hasDisplayValue(value)) return value;
    }
    return "";
  }

  switch (valueDefinition) {
    case "faction":
      return deriveFaction(entry, data);
    case "recordType":
      return resolveRecordType(entry, data);
    case "threatClass":
      return getThreatClass(rawEntry);
    case "description":
      return getGlossaryDescription(rawEntry);
    case "reports":
      return getReports(entry, data);
    default:
      return rawEntry?.[valueDefinition] ?? entry?.[valueDefinition] ?? "";
  }
}

function Panel({ title, children, className = "" }) {
  return (
    <section className={`ascii-panel ${className}`.trim()}>
      <div className="ascii-panel-header">+--[ {title} ]</div>
      <div className="ascii-panel-body">{children}</div>
      <div className="ascii-panel-footer">+------------------------------------------</div>
    </section>
  );
}

function MetaLines({ entry, data = null }) {
  const recordType = resolveRecordType(entry, data);
  const config = getRecordDisplayConfig(recordType);

  return (
    <div className="meta-lines">
      <div>TYPE&nbsp;&nbsp;&nbsp;&nbsp; // {recordType.toUpperCase()}</div>

      {(config.meta || []).map((meta) => {
        const value = resolveDisplayValue(meta.value, entry, data);
        if (!hasDisplayValue(value)) return null;

        return (
          <div key={`${recordType}-${meta.label}`}>
            {meta.label}&nbsp; // {formatDisplayValue(value)}
          </div>
        );
      })}
    </div>
  );
}

function EntryCard({ entry, onOpen }) {
  const recordType = resolveRecordType(entry);
  const config = getRecordDisplayConfig(recordType);
  const className = [
    "entry-card",
    config.cardClassName,
    "terminal-button",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={className}
      onClick={() => {
        playEntrySelectSfx();
        onOpen(entry.id);
      }}
    >
      <div className="entry-heading-row">
        <div>
          <div className="entry-title">&gt; {entry.name}</div>
          <MetaLines entry={entry} />
        </div>
      </div>
    </button>
  );
}

function DataBlock({ label, value }) {
  if (!value) return null;
  return (
    <div className="data-block">
      <div className="data-label">{label}</div>
      <p>{value}</p>
    </div>
  );
}
function RasterImage({ imageUrl, name }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("loading");

  useEffect(() => {
    if (!imageUrl) return undefined;

    let cancelled = false;
    setMode("loading");

    const sourceImage = new Image();

    sourceImage.crossOrigin = "anonymous";
    sourceImage.decoding = "async";

    sourceImage.onload = () => {
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        const outputSize = 640;
        const lowResolutionSize  = 64;

        const lowCanvas = document.createElement("canvas");
        lowCanvas.width = lowResolutionSize;
        lowCanvas.height = lowResolutionSize;

        const lowContext = lowCanvas.getContext("2d", {
          willReadFrequently: true,
        });

        const outputContext = canvas.getContext("2d");

        if (!lowContext || !outputContext) {
          throw new Error("Canvas rendering is unavailable.");
        }

        const sourceWidth = sourceImage.naturalWidth;
        const sourceHeight = sourceImage.naturalHeight;
        const cropSize = Math.min(sourceWidth, sourceHeight);
        const sourceX = Math.floor((sourceWidth - cropSize) / 2);
        const sourceY = Math.floor((sourceHeight - cropSize) / 2);

        lowContext.clearRect(
          0,
          0,
          lowResolutionSize,
          lowResolutionSize
        );

        lowContext.drawImage(
          sourceImage,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          lowResolutionSize,
          lowResolutionSize
        );

        const imageData = lowContext.getImageData(
          0,
          0,
          lowResolutionSize,
          lowResolutionSize
        );

        const pixels = imageData.data;

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];

          const gray =
            red * 0.299 +
            green * 0.587 +
            blue * 0.114;

          const normalized = gray / 255;

          const gammaAdjusted = Math.pow(normalized, 0.92) * 255;
          
          const contrasted = Math.max(
            0,
            Math.min(
              255,
              (gammaAdjusted - 128) * 1.12 + 118
            )
          );
          
          const grain = (Math.random() - 0.5) * 18;
          
          const pixelNumber = index / 4;
          const pixelY = Math.floor(pixelNumber / lowResolutionSize);
          const scanlineDarkening = pixelY % 2 === 0 ? -4 : 0;
          
          const noisyValue = Math.max(
            0,
            Math.min(
              255,
              contrasted + grain + scanlineDarkening
            )
          );
          
          pixels[index] = Math.min(255, noisyValue * 0.04);
          pixels[index + 1] = Math.min(220, noisyValue * 0.92);
          pixels[index + 2] = Math.min(255, noisyValue * 0.28);
        }

        lowContext.putImageData(imageData, 0, 0);

        canvas.width = outputSize;
        canvas.height = outputSize;

        outputContext.clearRect(0, 0, outputSize, outputSize);
        outputContext.imageSmoothingEnabled = false;

        outputContext.drawImage(
          lowCanvas,
          0,
          0,
          lowResolutionSize,
          lowResolutionSize,
          0,
          0,
          outputSize,
          outputSize
        );

        setMode("canvas");
      } catch (error) {
        console.warn("IMAGE RASTER FALLBACK", error);
        setMode("fallback");
      }
    };

    sourceImage.onerror = () => {
      if (!cancelled) setMode("fallback");
    };

    sourceImage.src = getRasterImageUrl(imageUrl, 640);

    return () => {
      cancelled = true;
      sourceImage.onload = null;
      sourceImage.onerror = null;
    };
  }, [imageUrl]);

  if (!imageUrl) return null;

  return (
    <div className="raster-image-frame">
      <canvas
        ref={canvasRef}
        className={`raster-image ${
          mode === "canvas" ? "raster-image-ready" : "raster-image-hidden"
        }`}
        role="img"
        aria-label={
          name
            ? `${name} rasterized reference image`
            : "Rasterized reference image"
        }
      />

      {mode === "fallback" ? (
        <img
          className="raster-image raster-image-css-fallback"
          src={getRasterImageUrl(imageUrl, 640)}
          alt={name ? `${name} reference image` : "Reference image"}
          onError={() => setMode("failed")}
        />
      ) : null}

      {mode === "loading" ? (
        <div className="image-loading">RASTERIZING SIGNAL...</div>
      ) : null}

      {mode === "failed" ? (
        <div className="image-failure">IMAGE SIGNAL DEGRADED</div>
      ) : null}
    </div>
  );
}

function ConfiguredDetailBody({ entry, data }) {
  const recordType = resolveRecordType(entry, data);
  const config = getRecordDisplayConfig(recordType);

  const renderedSections = (config.sections || []).map((section, sectionIndex) => {
    const key = `${recordType}-${section.title}-${sectionIndex}`;

    if (section.type === "reports") {
      const reports = getReports(entry, data);
      if (!reports.length) return null;

      return (
        <Panel key={key} title={section.title}>
          {reports.map((report) => (
            <div key={report.id} className="report-block">
              <div className="terminal-small">[{report.label}]</div>
              <p>{report.text}</p>
            </div>
          ))}
        </Panel>
      );
    }

    if (section.type === "image") {
      const imageUrl = resolveDisplayValue(section.value, entry, data);
      if (!hasDisplayValue(imageUrl)) return null;

      return (
        <Panel key={key} title={section.title}>
          <RasterImage imageUrl={imageUrl} name={entry.name} />
        </Panel>
      );
    }

    if (section.type === "facts") {
      const facts = (section.fields || [])
        .map((field) => ({
          ...field,
          resolvedValue: resolveDisplayValue(field.value, entry, data),
        }))
        .filter((field) => hasDisplayValue(field.resolvedValue));

      if (!facts.length) return null;

      return (
        <Panel key={key} title={section.title}>
          {facts.map((field) => (
            <DataBlock
              key={`${key}-${field.label}`}
              label={field.label}
              value={formatDisplayValue(field.resolvedValue)}
            />
          ))}
        </Panel>
      );
    }

    const value = resolveDisplayValue(section.value, entry, data);
    if (!hasDisplayValue(value)) return null;

    return (
      <Panel key={key} title={section.title}>
        <p>{formatDisplayValue(value)}</p>
      </Panel>
    );
  });

  return <div className="detail-body">{renderedSections}</div>;
}

function DetailPanel({ entryId, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const spokenEntryRef = useRef(null);
  const activeReadoutRef = useRef(null);
  const [isReadingEntry, setIsReadingEntry] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });

    getEntry(entryId)
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error: error.message, data: null });
      });

    return () => {
      alive = false;
    };
  }, [entryId]);

  const entry = state.data?.entry;

  useEffect(() => {
    if (!entry?.name) return;
    if (spokenEntryRef.current === entry.id) return;

    spokenEntryRef.current = entry.id;
    speakDatabankLine(entry.name);
  }, [entry?.id, entry?.name]);

  useEffect(() => {
    setIsReadingEntry(false);
    activeReadoutRef.current = null;
  }, [entryId]);

  function handleReadoutToggle() {
    if (!entry) return;

    if (isReadingEntry) {
      activeReadoutRef.current = null;
      setIsReadingEntry(false);
      playNarrationStopSfx();
      stopDatabankSpeech();
      return;
    }

    const readout = buildEntryReadout(entry, state.data);
    if (!readout) return;

    playNarrationStartSfx();
    setIsReadingEntry(true);

    const utterance = speakDatabankLine(readout, {
      rate: 0.9,
      pitch: 0.48,
      volume: 0.86,
      onend: () => {
        if (activeReadoutRef.current === utterance) {
          activeReadoutRef.current = null;
          setIsReadingEntry(false);
        }
      },
      onerror: () => {
        if (activeReadoutRef.current === utterance) {
          activeReadoutRef.current = null;
          setIsReadingEntry(false);
        }
      },
    });

    activeReadoutRef.current = utterance;
  }

  return (
    <aside className="detail-panel terminal-frame">
      <div className="detail-header">
        <div>
          <div className="terminal-small">FILE OPEN</div>
          <h2>{entry?.name || "LOADING"}</h2>
          {entry ? <MetaLines entry={entry} data={state.data} /> : null}
        </div>
        <div className="detail-controls">
          <button
            className="icon-button terminal-button"
            onClick={() => {
              playEntryCloseSfx();
              stopDatabankSpeech();
              onClose();
            }}
            aria-label="Close detail panel"
          >
            [X]
          </button>
          <button
            className={`speaker-button terminal-button ${isReadingEntry ? "speaker-active" : ""}`}
            onClick={handleReadoutToggle}
            aria-label={isReadingEntry ? "Stop entry readout" : "Read entry aloud"}
            title={isReadingEntry ? "Stop entry readout" : "Read entry aloud"}
            disabled={!entry}
          >
            {isReadingEntry ? "■" : "🔊"}
          </button>
        </div>
      </div>

      {state.loading ? <p className="muted">RETRIEVING FILE...</p> : null}
      {state.error ? <p className="error">LINK FAILURE // {state.error}</p> : null}

      {entry ? <ConfiguredDetailBody entry={entry} data={state.data} /> : null}
    </aside>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("databank");
  const [inputValue, setInputValue] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    type: ["Unit", "Glossary", "System", "Celestial Body", "Threat", "Conflict", "Faction"],
    faction: [],
    class: [],
    threat: ["I", "II", "III", "IV", "V"],
  });
  const [searchState, setSearchState] = useState({
    loading: false,
    error: null,
    results: [],
    count: 0,
  });

  const welcomeSpokenRef = useRef(false);

  useEffect(() => {
    let alive = true;

    getSearchOptions()
      .then((data) => {
        if (!alive || !data?.filters) return;
        setSearchOptions((current) => ({
          ...current,
          ...data.filters,
        }));
      })
      .catch((error) => {
        console.warn("STATIC DATA OPTION LOAD FAILURE", error);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const speakWelcome = () => {
      if (welcomeSpokenRef.current) return;
      welcomeSpokenRef.current = true;
      speakDatabankLine("Welcome Pilot");
    };

    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();

    window.speechSynthesis.onvoiceschanged = loadVoices;

    const timer = window.setTimeout(speakWelcome, 450);

    window.addEventListener("pointerdown", speakWelcome, { once: true });
    window.addEventListener("keydown", speakWelcome, { once: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", speakWelcome);
      window.removeEventListener("keydown", speakWelcome);
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const q = inputValue.trim();
    setSelectedEntryId(null);

    if (!q) {
      setSubmittedQuery("");
      setHasSearched(false);
      setSearchState({ loading: false, error: null, results: [], count: 0 });
      return;
    }

    playQuerySubmitSfx();
    setSubmittedQuery(q);
    setHasSearched(true);
    setSearchState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await searchEntries(q);
      const resultCount = data.count || 0;
      setSearchState({
        loading: false,
        error: null,
        results: data.results || [],
        count: resultCount,
      });
      speakDatabankLine(`${resultCount} record${resultCount === 1 ? "" : "s"} retrieved`);
    } catch (error) {
      setSearchState({
        loading: false,
        error: error.message,
        results: [],
        count: 0,
      });
    }
  }

  function handleClear() {
    setInputValue("");
    setSubmittedQuery("");
    setHasSearched(false);
    setSelectedEntryId(null);
    setSearchState({ loading: false, error: null, results: [], count: 0 });
  }

  let statusText = "AWAITING INPUT";
  if (searchState.loading) statusText = `QUERYING // ${submittedQuery.toUpperCase()}`;
  else if (searchState.error) statusText = `LINK FAILURE // ${searchState.error}`;
  else if (hasSearched) statusText = `${searchState.count} RECORD${searchState.count === 1 ? "" : "S"} RETURNED`;

  return (
    <div className="app-shell terminal-theme">
      <header className="hero terminal-frame">
        <h1>PILOT DATABANK</h1>
      </header>

      <nav className="app-tabs terminal-frame" aria-label="Databank sections">
        <button
          type="button"
          className={`app-tab ${activeTab === "databank" ? "app-tab-active" : ""}`}
          onClick={() => {
            stopDatabankSpeech();
            setActiveTab("databank");
          }}
          aria-pressed={activeTab === "databank"}
        >
          [DATABANK]
        </button>

        <button
          type="button"
          className={`app-tab ${activeTab === "galaxy" ? "app-tab-active" : ""}`}
          onClick={() => {
            stopDatabankSpeech();
            setSelectedEntryId(null);
            setActiveTab("galaxy");
          }}
          aria-pressed={activeTab === "galaxy"}
        >
          [SECTOR MAP]
        </button>
      </nav>

      {activeTab === "databank" ? (
        <main className="main-layout">
        <section className="search-column">
          <form className="search-box terminal-frame" onSubmit={handleSubmit}>
            <span className="search-prefix">&gt;</span>
            <SearchAutocompleteInput
              value={inputValue}
              onChange={setInputValue}
              options={searchOptions}
              placeholder="ENTER QUERY // "
              autoFocus
            />
          </form>

          <div className={`status ${searchState.error ? "error" : ""}`}>{statusText}</div>
          <div className="command-hint">
            
          </div>

          {hasSearched ? (
            searchState.results.length ? (
              <div className="results-grid">
                {searchState.results.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onOpen={setSelectedEntryId} />
                ))}
              </div>
            ) : !searchState.loading && !searchState.error ? (
              <div className="empty-state terminal-frame">
                <div className="terminal-small">NO MATCHING FILES</div>
              </div>
            ) : null
          ) : null}
        </section>

        {selectedEntryId ? (
          <DetailPanel entryId={selectedEntryId} onClose={() => setSelectedEntryId(null)} />
        ) : (
          <aside className="detail-panel placeholder-panel terminal-frame">
            <div className="terminal-small">FILE VIEWER STANDBY</div>
          </aside>
        )}
      </main>
      ) : (
        <GalaxyMap />
      )}
    </div>
  );
}
