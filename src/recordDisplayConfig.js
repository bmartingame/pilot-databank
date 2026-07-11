export const RECORD_DISPLAY_CONFIG = {
  Unit: {
    cardClassName: "unit-card",
    meta: [
      { label: "FACTION", value: "faction" },
      { label: "CLASS", value: ["classification", "body_class", "body_type"] },
    ],
    sections: [
      { title: "VISUAL", type: "text", value: "visual" },
      { title: "BEHAVIOR", type: "text", value: "behavior" },
      //{ title: "REPORTS", type: "reports", value: "reports" },
    ],
  },

  Threat: {
    cardClassName: "threat-card",
    meta: [
      { label: "FACTION", value: "faction" },
      { label: "THREAT", value: "threatClass" },
    ],
    sections: [
      { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
      { title: "DESCRIPTION", type: "text", value: "description" },
    ],
   },

    Glossary: {
        cardClassName: "glossary-card",
        meta: [
            { label: "FACTION", value: "faction" },
            { label: "THREAT", value: "threatClass" },
        ],
        sections: [
            { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
            { title: "DESCRIPTION", type: "text", value: "description" },
        ],
    },

    Conflict: {
        cardClassName: "conflict-card",
        meta: [
            { label: "DURATION", value: "duration" },
        ],
        sections: [
            { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
            { title: "DESCRIPTION", type: "text", value: "description" },
        ],
    },

    Faction: {
        cardClassName: "faction-card",
        meta: [
            { label: "FACTION", value: "faction" },
            { label: "THREAT", value: "threatClass" },
        ],
        sections: [
            { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
            {
                title: "DIPLOMATIC RELATIONS",
                type: "facts",
                fields: [
                    { label: "ALLIED", value: "allied" },
                    { label: "FRIENDLY", value: "friendly" },
                    { label: "COOPERATIVE", value: "cooperative" },
                    { label: "NEUTRAL", value: "neutral" },
                    { label: "TENSE", value: "tense" },
                    { label: "HOSTILE", value: "hostile" },
                    { label: "AT WAR", value: "at_war" },
                ],
            },
            { title: "DESCRIPTION", type: "text", value: "description" },
        ],
    },

  System: {
    cardClassName: "system-card",
    meta: [
      { label: "FACTION", value: "faction" },
      { label: "SECTOR", value: ["sector_name", "sector"] },
      { label: "STAR", value: ["star_type", "star_result"] },
    ],
    sections: [
      /*{
        title: "SYSTEM DATA",
        type: "facts",
        fields: [
          { label: "SECTOR", value: ["sector_name", "sector"] },
          { label: "STAR TYPE", value: ["star_type", "star_result"] },
          { label: "MAJOR BODIES", value: ["major_bodies", "body_count"] },
          { label: "PRIMARY HABITATION", value: "primary_habitation" },
          { label: "PRIMARY ROLE", value: "primary_role" },
        ],
      },*/
      { title: "DESCRIPTION", type: "text", value: "description" },
      { title: "WHY MAJOR", type: "text", value: "why_major" },
      { title: "DM USE", type: "text", value: "dm_use" },
      { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
    ],
  },

  "Celestial Body": {
    cardClassName: "celestial-body-card",
    meta: [
      { label: "SYSTEM", value: ["system_name", "parent_system_name"] },
      { label: "BODY", value: ["body_class", "body_type", "classification"] },
      { label: "ORBIT", value: ["orbit_order", "orbit_index"] },
    ],
    sections: [
      //{
      //  title: "CELESTIAL DATA",
      //  type: "facts",
      //  fields: [
      //    { label: "SYSTEM", value: ["system_name", "parent_system_name"] },
      //    { label: "BODY CLASS", value: ["body_class", "body_type", "classification"] },
      //    { label: "PLANET KIND", value: ["planet_kind", "kind"] },
      //    { label: "PLANET TYPE", value: ["planet_type", "subtype"] },
      //    { label: "STAR TYPE", value: "star_type" },
      //    { label: "ATMOSPHERE", value: ["atmosphere", "atmosphere_type"] },
      //    { label: "COMPOSITION", value: ["atmosphere_composition", "composition"] },
      //    { label: "LIFE", value: "life" },
      //    { label: "MOONS", value: ["moons", "moon_count"] },
      //    { label: "RINGS", value: ["has_rings", "rings"] },
      //    { label: "RING COMPOSITION", value: "ring_composition" },
      //    { label: "ORBIT ORDER", value: ["orbit_order", "orbit_index"] },
      //    { label: "ORBIT RADIUS", value: "orbit_radius" },
      //  ],
      //},
      { title: "DESCRIPTION", type: "text", value: "description" },
      { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
    ],
  },

  Default: {
    cardClassName: "generic-card",
    meta: [
      { label: "FACTION", value: "faction" },
      { label: "CLASS", value: ["classification", "body_class", "body_type"] },
      { label: "SECTOR", value: "sector_name" },
      { label: "SYSTEM", value: "system_name" },
      { label: "THREAT", value: "threatClass" },
    ],
    sections: [
      { title: "VISUAL", type: "text", value: "visual" },
      { title: "BEHAVIOR", type: "text", value: "behavior" },
      { title: "REPORTS", type: "reports", value: "reports" },
      { title: "DESCRIPTION", type: "text", value: "description" },
      { title: "VISUAL REFERENCE", type: "image", value: "image_url", readout: false },
    ],
  },
};


// Maps alternate database values to the display registry above.
export const RECORD_TYPE_ALIASES = {
  unit: "Unit",
  units: "Unit",
  glossary: "Glossary",
  system: "System",
  systems: "System",
  "celestial body": "Celestial Body",
  celestial_body: "Celestial Body",
  body: "Celestial Body",
  planet: "Celestial Body",
  moon: "Celestial Body",
  star: "Celestial Body",
  station: "Celestial Body",
  asteroid: "Celestial Body",
  "asteroid belt": "Celestial Body",
};

export const RECORD_SUBTYPE_ALIASES = {
  system: "System",
  "celestial body": "Celestial Body",
  celestial_body: "Celestial Body",
  planet: "Celestial Body",
  moon: "Celestial Body",
  star: "Celestial Body",
  station: "Celestial Body",
  asteroid: "Celestial Body",
  "asteroid belt": "Celestial Body",
};


function normalizeTypeKey(value) {
  return String(value || "").trim().toLowerCase();
}


export function resolveRecordType(entry, data = null) {
  const fullEntry = data?.entry || entry || {};
  const subtype = normalizeTypeKey(
    fullEntry.glossary_subtype ||
    fullEntry.record_subtype ||
    fullEntry.subtype
  );

  if (subtype && RECORD_SUBTYPE_ALIASES[subtype]) {
    return RECORD_SUBTYPE_ALIASES[subtype];
  }

  const rawType = normalizeTypeKey(
    fullEntry.record_type ||
    entry?.record_type
  );

  if (rawType && RECORD_TYPE_ALIASES[rawType]) {
    return RECORD_TYPE_ALIASES[rawType];
  }

  if (rawType) {
    const configuredType = Object.keys(RECORD_DISPLAY_CONFIG).find(
      (key) => key.toLowerCase() === rawType
    );
    if (configuredType) return configuredType;
  }

  const hasUnitFields =
    fullEntry.visual ||
    fullEntry.behavior ||
    fullEntry.report_text ||
    fullEntry.cr ||
    fullEntry.cr_text ||
    data?.reports?.length;

  return hasUnitFields ? "Unit" : "Glossary";
}


export function getRecordDisplayConfig(recordType) {
  return (
    RECORD_DISPLAY_CONFIG[recordType] ||
    RECORD_DISPLAY_CONFIG.Default
  );
}
