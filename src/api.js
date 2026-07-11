const DATA_URL = `${import.meta.env.BASE_URL}data/entries.json`;

const RECORD_TYPE_ALIASES = {
  unit: "Unit",
  units: "Unit",
  glossary: "Glossary",
  threat: "Threat",
  threats: "Threat",
  conflict: "Conflict",
  conflicts: "Conflict",
  faction: "Faction",
  factions: "Faction",
  system: "System",
  systems: "System",
  "celestial body": "Celestial Body",
  "celestial bodies": "Celestial Body",
  celestial_body: "Celestial Body",
  "celestial-body": "Celestial Body",
  body: "Celestial Body",
  bodies: "Celestial Body",
  planet: "Celestial Body",
  moon: "Celestial Body",
  star: "Celestial Body",
  station: "Celestial Body",
  asteroid: "Celestial Body",
  "asteroid belt": "Celestial Body",
};

const RECORD_TYPE_SHORTCUTS = {
  unit: "unit",
  units: "unit",
  u: "unit",

  glossary: "glossary",
  gloss: "glossary",
  g: "glossary",

  threat: "threat",
  threats: "threat",

  conflict: "conflict",
  conflicts: "conflict",

  faction: "faction",
  factions: "faction",

  system: "system",
  systems: "system",
  sys: "system",

  "celestial body": "celestial body",
  "celestial bodies": "celestial body",
  celestial_body: "celestial body",
  "celestial-body": "celestial body",
  body: "celestial body",
  bodies: "celestial body",
  cb: "celestial body",
};

const FILTER_KEY_ALIASES = {
  type: "type",
  record: "type",
  record_type: "type",

  faction: "faction",
  fac: "faction",

  class: "class",
  classification: "class",
  cls: "class",

  threat: "threat",
  threat_class: "threat",
  tc: "threat",
};

let databasePromise = null;

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

function parseReports(properties) {
  if (Array.isArray(properties?.reports)) {
    return properties.reports.filter((report) => report?.text);
  }

  if (properties?.reports_json) {
    try {
      const parsed = JSON.parse(properties.reports_json);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((report) => report?.text)
          .map((report, index) => ({
            id: report.id || `${properties.id || "entry"}__report__${index + 1}`,
            label: report.label || `REPORT ${index + 1}`,
            text: report.text,
            sort_order: report.sort_order ?? index,
          }));
      }
    } catch {
      // Fall through to the inline report fields.
    }
  }

  if (properties?.report_text) {
    return [{
      id: `${properties.id || "entry"}__report__1`,
      label: properties.report_label || "REPORT",
      text: properties.report_text,
      sort_order: 0,
    }];
  }

  return [];
}

function normalizeExportRow(row, index) {
  const node = row?.n ?? row?.entry ?? row?.node ?? row;
  const properties = node?.properties ?? node;

  if (!properties || typeof properties !== "object") return null;

  const entry = {
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

  entry.reports = parseReports(entry);

  if (!entry.tags && entry.tags_text) {
    entry.tags = String(entry.tags_text)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return entry;
}

function getCanonicalRecordType(entry) {
  const subtype = normalizeText(
    entry?.glossary_subtype ||
    entry?.record_subtype ||
    entry?.subtype
  );

  if (subtype === "system") return "System";

  if ([
    "celestial body",
    "celestial_body",
    "planet",
    "moon",
    "star",
    "station",
    "asteroid",
    "asteroid belt",
  ].includes(subtype)) {
    return "Celestial Body";
  }

  const raw = normalizeText(entry?.record_type);
  if (!raw) {
    return entry?.visual || entry?.behavior || entry?.reports?.length
      ? "Unit"
      : "Glossary";
  }

  return RECORD_TYPE_ALIASES[raw] || titleCaseWords(raw);
}

function getCanonicalFaction(entry) {
  const faction = cleanText(entry?.faction);
  return faction ? faction : "UNAFFILIATED";
}

function getCanonicalThreat(entry) {
  return cleanText(entry?.threat_category)
    .toUpperCase()
    .replace(/^CLASS\s+/, "");
}

function flattenSearchValues(value, output) {
  if (value === null || value === undefined) return;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) flattenSearchValues(item, output);
    return;
  }

  if (typeof value === "object") {
    for (const item of Object.values(value)) {
      flattenSearchValues(item, output);
    }
  }
}

function buildSearchText(entry) {
  const values = [];
  flattenSearchValues(entry, values);
  return values.join(" ").toLowerCase();
}

function sortUnique(values) {
  return [...new Set(
    values
      .map((value) => cleanText(value))
      .filter(Boolean)
  )].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

function buildDatabase(entries) {
  const searchRows = entries.map((entry) => ({
    entry,
    name: normalizeText(entry.name),
    searchText: buildSearchText(entry),
    recordType: normalizeText(getCanonicalRecordType(entry)),
    faction: normalizeText(getCanonicalFaction(entry)),
    classification: normalizeText(entry.classification),
    threat: getCanonicalThreat(entry),
  }));

  return {
    entries,
    byId: new Map(entries.map((entry) => [String(entry.id), entry])),
    searchRows,
    options: {
      type: sortUnique(entries.map(getCanonicalRecordType)),
      faction: sortUnique(entries.map(getCanonicalFaction)),
      class: sortUnique(entries.map((entry) => entry.classification)),
      threat: sortUnique(entries.map(getCanonicalThreat)),
    },
  };
}

async function loadDatabase() {
  if (!databasePromise) {
    databasePromise = fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Static data fetch failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.entries)
            ? payload.entries
            : [];

        const entries = rows
          .map(normalizeExportRow)
          .filter(Boolean);

        if (!entries.length) {
          throw new Error("The static JSON file contains no readable entries.");
        }

        return buildDatabase(entries);
      });
  }

  return databasePromise;
}

function tokenizeQuery(rawQuery) {
  return (
    String(rawQuery || "").match(
      /[+-]?[A-Za-z_][A-Za-z0-9_-]*:"[^"]*"|[+-]?"[^"]*"|[+-]?\S+/g
    ) || []
  );
}

function parseCliQuery(rawQuery) {
  const parsed = {
    required_terms: [],
    required_phrases: [],
    excluded_terms: [],
    excluded_phrases: [],
    include_record_types: [],
    exclude_record_types: [],
    include_factions: [],
    exclude_factions: [],
    include_classes: [],
    exclude_classes: [],
    include_threat_categories: [],
    exclude_threat_categories: [],
    raw: rawQuery || "",
  };

  for (const rawToken of tokenizeQuery(rawQuery)) {
    let token = rawToken;
    const negative = token.startsWith("-");
    const positive = token.startsWith("+");

    if (negative || positive) token = token.slice(1);
    if (!token) continue;

    const shortcut = RECORD_TYPE_SHORTCUTS[normalizeText(token)];
    if (shortcut) {
      const target = negative
        ? parsed.exclude_record_types
        : parsed.include_record_types;
      target.push(shortcut);
      continue;
    }

    const colonIndex = token.indexOf(":");
    if (colonIndex > 0) {
      const rawKey = token.slice(0, colonIndex);
      const canonicalKey = FILTER_KEY_ALIASES[normalizeText(rawKey)];
      let value = token.slice(colonIndex + 1).trim();

      if (
        value.startsWith('"') &&
        value.endsWith('"') &&
        value.length >= 2
      ) {
        value = value.slice(1, -1);
      }

      value = normalizeText(value);
      if (!canonicalKey || !value) continue;

      if (canonicalKey === "type") {
        const normalizedType =
          RECORD_TYPE_SHORTCUTS[value] ||
          normalizeText(RECORD_TYPE_ALIASES[value] || value);

        const target = negative
          ? parsed.exclude_record_types
          : parsed.include_record_types;
        target.push(normalizedType);
        continue;
      }

      if (canonicalKey === "faction") {
        const target = negative
          ? parsed.exclude_factions
          : parsed.include_factions;
        target.push(value);
        continue;
      }

      if (canonicalKey === "class") {
        const target = negative
          ? parsed.exclude_classes
          : parsed.include_classes;
        target.push(value);
        continue;
      }

      if (canonicalKey === "threat") {
        const threat = value
          .toUpperCase()
          .replace(/^CLASS\s+/, "")
          .trim();

        const target = negative
          ? parsed.exclude_threat_categories
          : parsed.include_threat_categories;
        target.push(threat);
        continue;
      }
    }

    const isQuoted =
      token.startsWith('"') &&
      token.endsWith('"') &&
      token.length >= 2;

    const text = normalizeText(
      isQuoted ? token.slice(1, -1) : token
    );

    if (!text) continue;

    if (isQuoted) {
      const target = negative
        ? parsed.excluded_phrases
        : parsed.required_phrases;
      target.push(text);
    } else {
      const target = negative
        ? parsed.excluded_terms
        : parsed.required_terms;
      target.push(text);
    }
  }

  for (const [key, values] of Object.entries(parsed)) {
    if (Array.isArray(values)) {
      parsed[key] = [...new Set(values)];
    }
  }

  return parsed;
}

function matchesAll(values, predicate) {
  return values.every(predicate);
}

function scoreEntry(row, parsed) {
  const firstPhrase = parsed.required_phrases[0] || "";
  const firstTerm = parsed.required_terms[0] || "";

  if (firstPhrase && row.name === firstPhrase) return 1000;
  if (firstTerm && row.name === firstTerm) return 900;
  if (firstPhrase && row.name.includes(firstPhrase)) return 700;
  if (firstTerm && row.name.includes(firstTerm)) return 500;
  return 0;
}

function rowMatches(row, parsed) {
  if (!matchesAll(parsed.required_terms, (term) => row.searchText.includes(term))) {
    return false;
  }

  if (!matchesAll(parsed.required_phrases, (phrase) => row.searchText.includes(phrase))) {
    return false;
  }

  if (!matchesAll(parsed.excluded_terms, (term) => !row.searchText.includes(term))) {
    return false;
  }

  if (!matchesAll(parsed.excluded_phrases, (phrase) => !row.searchText.includes(phrase))) {
    return false;
  }

  if (
    parsed.include_record_types.length &&
    !parsed.include_record_types.includes(row.recordType)
  ) {
    return false;
  }

  if (parsed.exclude_record_types.includes(row.recordType)) {
    return false;
  }

  if (
    parsed.include_factions.length &&
    !parsed.include_factions.includes(row.faction)
  ) {
    return false;
  }

  if (parsed.exclude_factions.includes(row.faction)) {
    return false;
  }

  if (
    parsed.include_classes.length &&
    !parsed.include_classes.includes(row.classification)
  ) {
    return false;
  }

  if (parsed.exclude_classes.includes(row.classification)) {
    return false;
  }

  if (
    parsed.include_threat_categories.length &&
    !parsed.include_threat_categories.includes(row.threat)
  ) {
    return false;
  }

  if (parsed.exclude_threat_categories.includes(row.threat)) {
    return false;
  }

  return true;
}

export async function searchEntries(query, limit = 100) {
  const database = await loadDatabase();
  const parsed = parseCliQuery(query);

  const results = database.searchRows
    .filter((row) => rowMatches(row, parsed))
    .map((row) => ({
      entry: row.entry,
      score: scoreEntry(row, parsed),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.entry.name || "").localeCompare(
        String(right.entry.name || ""),
        undefined,
        { sensitivity: "base" }
      );
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 100)))
    .map(({ entry, score }) => ({
      ...entry,
      score,
    }));

  return {
    query,
    parsed,
    count: results.length,
    results,
  };
}

export async function getEntry(entryId) {
  const database = await loadDatabase();
  const entry = database.byId.get(String(entryId));

  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  return {
    entry,
    collection: null,
    source_file: entry.source_filename
      ? { file_name: entry.source_filename }
      : null,
    section: null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    reports: Array.isArray(entry.reports) ? entry.reports : [],
    related: [],
  };
}

export async function getSearchOptions() {
  const database = await loadDatabase();

  return {
    filters: database.options,
    aliases: {
      type: ["type", "record", "record_type"],
      faction: ["faction", "fac"],
      class: ["class", "classification", "cls"],
      threat: ["threat", "threat_class", "tc"],
    },
  };
}

export function getRasterImageUrl(imageUrl) {
  return imageUrl || "";
}
