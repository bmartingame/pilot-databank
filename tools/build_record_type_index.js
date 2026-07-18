#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const entriesPath = path.join(projectRoot, "public", "data", "entries.json");
const recordTypeIndexPath = path.join(projectRoot, "public", "data", "recordTypeIndex.json");
const searchOptionsPath = path.join(projectRoot, "public", "data", "searchOptions.json");

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

function sortedUnique(values) {
  return [...new Set(
    values
      .map((value) => cleanText(value))
      .filter(Boolean)
  )].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

function incrementCount(map, key) {
  const cleanKey = cleanText(key);
  if (!cleanKey) return;
  map.set(cleanKey, (map.get(cleanKey) || 0) + 1);
}

function main() {
  if (!fs.existsSync(entriesPath)) {
    throw new Error(`Missing ${entriesPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(entriesPath, "utf8"));
  const rows = Array.isArray(payload) ? payload : payload?.entries || [];
  const entries = rows
    .map((row, index) => normalizeExportRow(row, index))
    .filter(Boolean);

  const typeCounts = new Map();

  for (const entry of entries) {
    incrementCount(typeCounts, getCanonicalRecordType(entry));
  }

  const recordTypes = sortedUnique([...typeCounts.keys()]);
  const counts = Object.fromEntries(
    recordTypes.map((recordType) => [recordType, typeCounts.get(recordType) || 0])
  );

  const filters = {
    type: recordTypes,
    faction: sortedUnique(entries.map((entry) => entry.faction)),
    class: sortedUnique(
      entries.map((entry) => entry.classification || entry.class || entry.threatClass)
    ),
    threat: sortedUnique(entries.map((entry) => entry.threatClass || entry.threat_class)),
  };

  const aliases = {
    type: ["type", "record", "record_type"],
    faction: ["faction", "fac"],
    class: ["class", "classification", "cls"],
    threat: ["threat", "threat_class", "tc"],
  };

  fs.mkdirSync(path.dirname(recordTypeIndexPath), { recursive: true });

  fs.writeFileSync(
    recordTypeIndexPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "entries.json",
        recordTypes,
        counts,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  fs.writeFileSync(
    searchOptionsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "entries.json",
        filters,
        aliases,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`Built ${recordTypeIndexPath}`);
  console.log(`Built ${searchOptionsPath}`);
  console.log(`Indexed ${entries.length} entries across ${recordTypes.length} record types`);
}

main();
