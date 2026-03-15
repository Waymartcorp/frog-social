type ResolutionStatus = "open" | "monitoring" | "resolved";

export interface CaseStateMessage {
  id: string;
  threadId: string;
  content: string;
}

export interface CaseState {
  threadId: string;
  situationSummary: string;
  initialObservations: string[];
  missingDetails: string[];
  domainsInPlay: string[];
  actionsTried: string[];
  resolutionStatus: ResolutionStatus;
  sourceMessageIds: string[];
}

type KnownFacts = {
  waterSource: boolean;
  ph: boolean;
  phCalibration: boolean;
  conductivity: boolean;
  buffering: boolean;
  flow: boolean;
  vibration: boolean;
  density: boolean;
  feeding: boolean;
  handling: boolean;
  injection: boolean;
  lesions: boolean;
  light: boolean;
  disturbance: boolean;
  systemMaturity: boolean;
  biofilterStatus: boolean;
  systemNewOrCycling: boolean;
};

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "water chemistry": [
    "ph",
    "gh",
    "kh",
    "buffer",
    "buffering",
    "remineral",
    "conductivity",
    "tds",
    "ec",
    "salt",
    "salinity",
    "ro",
    "di",
    "reverse osmosis",
    "well water",
    "city water",
    "tap water",
  ],
  "flow and vibration": [
    "flow",
    "nozzle",
    "splash",
    "surface agitation",
    "vibration",
    "hum",
    "noise",
    "pump",
    "rack",
  ],
  "density and feeding": [
    "density",
    "stocking",
    "crowd",
    "competition",
    "feeding",
    "not eating",
    "off food",
    "food left",
    "uneaten",
    "feeding response",
  ],
  "handling and disturbance": [
    "handling",
    "handled",
    "grabbed",
    "picked up",
    "net",
    "netting",
    "injection",
    "inject",
    "light",
    "bright",
    "disturbance",
    "traffic",
    "room entries",
    "door",
  ],
  "lesions and shelters": [
    "lesion",
    "redness",
    "ulcer",
    "skin",
    "wound",
    "abrasion",
    "pvc",
    "shelter",
    "hide",
    "tube",
  ],
  "system setup": [
    "new system",
    "newly set up",
    "cycling",
    "cycled",
    "biofilter",
    "mature filter",
    "seeded",
    "recently modified",
    "system maturity",
  ],
};

const ACTION_PATTERNS = [
  "water change",
  "changed water",
  "reduced flow",
  "increased flow",
  "lowered temperature",
  "raised temperature",
  "isolated",
  "quarantine",
  "salt bath",
  "changed feed",
  "added buffer",
  "remineralized",
  "adjusted light",
  "moved tank",
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function extractKnownFacts(messages: CaseStateMessage[]): KnownFacts {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const systemMaturity = /(system maturity|mature filter|cycled|cycling|new system|newly set up)/.test(all);
  const biofilterStatus = /(biofilter|seeded filter|mature filter|cycling)/.test(all);
  return {
    waterSource: /(ro|di|reverse osmosis|well water|city water|tap water)/.test(all),
    ph: /\bph\b/.test(all),
    phCalibration: /(calibrat)/.test(all),
    conductivity: /(conductivity|tds|ec|ppm|ms\/cm|us\/cm|µs\/cm)/.test(all),
    buffering: /(buffer|buffering|gh|kh|bicarbonate|remineral)/.test(all),
    flow: /(flow|nozzle|splash|surface agitation)/.test(all),
    vibration: /(vibration|hum|noise|pump|rack)/.test(all),
    density: /(density|stocking|crowd|competition)/.test(all),
    feeding: /(feeding|not eating|off food|uneaten|food left|feeding response)/.test(all),
    handling: /(handling|handled|grabbed|picked up|net|netting)/.test(all),
    injection: /(inject|injection)/.test(all),
    lesions: /(lesion|redness|ulcer|skin|wound|abrasion)/.test(all),
    light: /(light|bright|dark cycle|photoperiod)/.test(all),
    disturbance: /(disturbance|traffic|room entries|door|noise)/.test(all),
    systemMaturity,
    biofilterStatus,
    systemNewOrCycling: /(new system|newly set up|cycling|recently modified)/.test(all),
  };
}

function inferDomainsInPlay(messages: CaseStateMessage[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => all.includes(keyword)))
    .map(([domain]) => domain);
}

function extractActionsTried(messages: CaseStateMessage[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  return ACTION_PATTERNS.filter((pattern) => all.includes(pattern));
}

function buildMissingDetails(facts: KnownFacts): string[] {
  const missing: string[] = [];
  if (!facts.systemMaturity || !facts.biofilterStatus) {
    missing.push("System maturity / biofilter status");
  }
  if (!facts.waterSource) missing.push("Water source (RO, city, well, mixed)");
  if (!facts.ph) missing.push("Measured pH");
  if (!facts.phCalibration) missing.push("pH meter calibration status");
  if (!facts.conductivity) missing.push("Conductivity/TDS readings");
  if (!facts.buffering) missing.push("Buffering / remineralization context (GH/KH)");
  if (!facts.flow) missing.push("Flow/nozzle/splash context");
  if (!facts.vibration) missing.push("Vibration/pump-noise context");
  if (!facts.density) missing.push("Tank density / stocking context");
  if (!facts.feeding) missing.push("Observed feeding response");
  if (!facts.handling && !facts.injection) missing.push("Recent handling/injection history");
  if (!facts.lesions) missing.push("Lesion/skin finding details");
  if (!facts.light && !facts.disturbance) missing.push("Light and disturbance context");
  return missing;
}

function buildInitialObservations(messages: CaseStateMessage[], facts: KnownFacts): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const observations: string[] = [];

  if (facts.systemMaturity || facts.biofilterStatus) {
    if (facts.systemNewOrCycling) {
      observations.push("System maturity is likely an active factor (new/cycling context present).");
    } else {
      observations.push("System maturity and biofilter context are being discussed as case factors.");
    }
  } else {
    observations.push("System maturity / biofilter status is not yet established in the thread.");
  }

  if (/(not eating|off food|reduced feeding|poor feeding)/.test(all)) {
    observations.push("Reduced feeding behavior has been reported.");
  }
  if (/(lesion|redness|ulcer|skin|wound|abrasion)/.test(all)) {
    observations.push("Skin findings or lesions have been reported.");
  }
  if (/(vibration|hum|noise|pump)/.test(all)) {
    observations.push("Mechanical disturbance signals are present.");
  }
  if (/(ro|di|reverse osmosis|well water|city water|tap water)/.test(all)) {
    observations.push("Water-source details are present in the discussion.");
  }

  return observations;
}

function buildSituationSummary(observations: string[], domains: string[], missingDetails: string[]): string {
  const firstObservation = observations[0] ?? "A husbandry case is active and requires structured follow-up.";
  const domainText = domains.length > 0 ? ` Domains in play: ${domains.join(", ")}.` : "";
  const missingText =
    missingDetails.length > 0
      ? ` Missing details still needed: ${missingDetails.slice(0, 3).join(", ")}.`
      : " Core husbandry context is reasonably complete for first-pass review.";
  return `${firstObservation}${domainText}${missingText}`;
}

function inferResolutionStatus(messages: CaseStateMessage[]): ResolutionStatus {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  if (/(resolved|improved|back to normal|doing well|recovered|stabilized)/.test(all)) {
    return "resolved";
  }
  if (/(monitoring|watching|observing|holding steady|not sure yet|early improvement)/.test(all)) {
    return "monitoring";
  }
  return "open";
}

export function buildCaseState(messages: CaseStateMessage[], threadId: string): CaseState {
  const knownFacts = extractKnownFacts(messages);
  const domainsInPlay = inferDomainsInPlay(messages);
  const actionsTried = extractActionsTried(messages);
  const missingDetails = buildMissingDetails(knownFacts);
  const initialObservations = buildInitialObservations(messages, knownFacts);
  const situationSummary = buildSituationSummary(initialObservations, domainsInPlay, missingDetails);
  const resolutionStatus = inferResolutionStatus(messages);

  return {
    threadId,
    situationSummary,
    initialObservations,
    missingDetails,
    domainsInPlay,
    actionsTried,
    resolutionStatus,
    sourceMessageIds: messages.map((message) => message.id),
  };
}

