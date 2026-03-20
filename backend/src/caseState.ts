type ResolutionStatus = "open" | "monitoring" | "resolved";
type MessageIntent = "ACTION" | "OBSERVATION" | "CONTEXT" | "PLAN";
type CurrentCaseStatus = "open" | "monitoring" | "improved" | "unresolved" | "mixed / still under discussion";
type MessageRole = "expert" | "trusted" | "standard";

export interface CaseStateMessage {
  id: string;
  threadId: string;
  content: string;
  role?: MessageRole | string;
  correctionSignal?: boolean;
}

export interface CaseState {
  threadId: string;
  caseUpdate: string;
  currentStrategy: string[];
  currentStatus: CurrentCaseStatus;
  situationSummary: string;
  initialObservations: string[];
  missingDetails: string[];
  domainsInPlay: string[];
  actionsTried: string[];
  suggestedNextSteps: string[];
  resolutionStatus: ResolutionStatus;
  sourceMessageIds: string[];
}

export interface KeyStrategiesResult {
  ready: boolean;
  title: string;
  message?: string;
  primaryIntervention?: string;
  secondaryIntervention?: string;
  supportingActions?: string[];
  whyThisDirection?: string;
}

export interface InterpretationAuditRow {
  key: string;
  combinedScore: number;
  recentScore: number;
  mentionPosts: number;
  recentMentionPosts: number;
}

export interface InterpretationAudit {
  correctionDetected: boolean;
  highImpactCorrection: boolean;
  correctionPenalties: Record<string, number>;
  dominantFactor: string;
  isDominant: boolean;
  ranking: InterpretationAuditRow[];
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

const DOMAIN_TO_NEXT_STEPS: Record<string, string[]> = {
  "water chemistry": [
    "Review water source and remineralization context.",
    "Measure pH with a calibrated meter.",
    "Track conductivity trends across recent days.",
  ],
  "flow and vibration": [
    "Review flow/nozzle splash and pump vibration.",
    "Check for recent pump behavior or noise changes.",
  ],
  "density and feeding": [
    "Review tank density and competition signals.",
    "Observe feeding response directly across tanks.",
  ],
  "handling and disturbance": [
    "Review recent handling/injection history.",
    "Review light and room disturbance around the rack.",
  ],
  "lesions and shelters": [
    "Review lesion notes and shelter/abrasion context.",
    "Check physical contact points in tanks and shelters.",
  ],
  "system setup": [
    "Review system maturity and biofilter status.",
    "Review recent setup changes that may affect stability.",
  ],
};

const ACTION_REGEXES = [
  /\b(changed|adjusted|reduced|increased|moved|added|cleaned|slowed|raised|lowered|calibrated|isolated|quarantined|remineralized|buffered|flushed|repositioned|shifted)\b/i,
  /\b(we|i)\s+(did|tried|updated|switched|stopped)\b/i,
  /\b(move|moved)\s+(the\s+)?(nozzle|pump|flow)\b/i,
  /\b(reduced|changed|adjusted)\s+(the\s+)?(pressure|noise|vibration|splash|flow)\b/i,
];

const PLAN_REGEXES = [
  /\b(will|we'll|i'll|going to|plan to|planning to|next we|next i)\b/i,
  /\b(continue to monitor|watch for|recheck|test again)\b/i,
];

const OBSERVATION_REGEXES = [
  /\b(looks|looked|seems|seemed|appears|appeared|is|are|was|were|noticed|observed|seeing)\b/i,
  /\b(not eating|off food|lesion|redness|floating|letharg|cloudy|improv|worse|stable)\b/i,
];

const CONTEXT_REGEXES = [
  /\b(using|on|setup|system|water source|rack|room|environment|biofilter|maturity|current)\b/i,
  /\b(we use|we are on|currently on|our setup)\b/i,
];

const OUTCOME_POSITIVE_REGEXES = [
  /\b(improv(ed|ing)?|got better|better now|stabilized|stabilised)\b/i,
  /\b(disappeared|went away|resolved|cleared up)\b/i,
  /\b(stopped mortality|mortality stopped|stopped dying|deaths stopped)\b/i,
  /\b(reduced lethargy|less lethargy|redness disappeared)\b/i,
];

const OUTCOME_STRONG_RESOLVED_REGEXES = [
  /\b(fully resolved|resolved now|back to normal|recovered)\b/i,
  /\b(stopped mortality)\b/i,
];

const OUTCOME_UNCERTAINTY_REGEXES = [
  /\b(monitor|watch|still early|not sure|unclear|for now)\b/i,
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function isCorrectionSignalText(text: string): boolean {
  return CORRECTION_SIGNAL_REGEXES.some((regex) => regex.test(text));
}

function isGeneratedSummaryArtifact(text: string): boolean {
  const normalized = normalize(text);
  if (isCorrectionSignalText(normalized)) {
    return false;
  }
  const markers = [
    "initially, this case started",
    "early discussion considered",
    "later responses suggest",
    "current thinking is shifting toward",
    "at this stage, the working strategy",
    "current status is",
    "domains in play:",
    "missing details still needed:",
    "discussion summary",
    "generated summary",
    "case update:",
  ];
  let hits = 0;
  for (const marker of markers) {
    if (normalized.includes(marker)) {
      hits += 1;
    }
  }
  return hits >= 1;
}

interface WeightedSentence {
  text: string;
  messageIndex: number;
  recencyWeight: number;
}

interface OutcomeSummary {
  topOutcomeSnippets: string[];
  likelyFixSnippets: string[];
  positiveScore: number;
  strongResolvedScore: number;
  uncertaintyScore: number;
}

function toSentenceUnits(messages: CaseStateMessage[]): WeightedSentence[] {
  const total = Math.max(messages.length, 1);
  const units: WeightedSentence[] = [];
  messages.forEach((message, index) => {
    const recencyWeight = 1 + (index / total);
    message.content
      .split(/[\n.!?]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part.length > 3)
      .filter((part) => !isGeneratedSummaryArtifact(part))
      .forEach((part) => {
        units.push({ text: part, messageIndex: index, recencyWeight });
      });
  });
  return units;
}

function scoreIntent(text: string, regexes: RegExp[]): number {
  return regexes.reduce((score, regex) => score + (regex.test(text) ? 1 : 0), 0);
}

function classifyIntent(text: string): MessageIntent {
  const actionScore = scoreIntent(text, ACTION_REGEXES);
  const planScore = scoreIntent(text, PLAN_REGEXES);
  const observationScore = scoreIntent(text, OBSERVATION_REGEXES);
  const contextScore = scoreIntent(text, CONTEXT_REGEXES);

  const ranked: Array<{ intent: MessageIntent; score: number }> = [
    { intent: "ACTION", score: actionScore },
    { intent: "PLAN", score: planScore },
    { intent: "OBSERVATION", score: observationScore },
    { intent: "CONTEXT", score: contextScore },
  ];

  ranked.sort((a, b) => b.score - a.score);
  if (ranked[0].score > 0) {
    return ranked[0].intent;
  }
  // Fallback: descriptive sentences tend to be observations.
  return "OBSERVATION";
}

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const withCap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(withCap) ? withCap : `${withCap}.`;
}

function toFieldNoteText(text: string): string {
  const cleaned = String(text || "")
    .replace(/\bcurrent thinking\b/gi, "")
    .replace(/\binterpretation\b/gi, "")
    .replace(/\bunder review\b/gi, "")
    .replace(/\bthis suggests\b/gi, "")
    .replace(/\bthis direction is based on\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => clipSentence(part, 160))
    .map((part) => sentenceCase(part));

  return unique(sentences).slice(0, 6).join(" ");
}

function scoreAndSelectByIntent(
  messages: CaseStateMessage[]
): Record<MessageIntent, string[]> {
  const scored: Record<MessageIntent, Array<{ text: string; score: number }>> = {
    ACTION: [],
    PLAN: [],
    OBSERVATION: [],
    CONTEXT: [],
  };

  for (const sentence of toSentenceUnits(messages)) {
    const intent = classifyIntent(sentence.text);
    scored[intent].push({
      text: sentenceCase(sentence.text),
      score: sentence.recencyWeight,
    });
  }

  const pick = (intent: MessageIntent): string[] =>
    unique(
      scored[intent]
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.text)
    ).slice(0, 10);

  return {
    ACTION: pick("ACTION"),
    PLAN: pick("PLAN"),
    OBSERVATION: pick("OBSERVATION"),
    CONTEXT: pick("CONTEXT"),
  };
}

function detectOutcomeSummary(messages: CaseStateMessage[]): OutcomeSummary {
  const outcomes: Array<{ text: string; score: number }> = [];
  const likelyFix: Array<{ text: string; score: number }> = [];
  let positiveScore = 0;
  let strongResolvedScore = 0;
  let uncertaintyScore = 0;

  for (const sentence of toSentenceUnits(messages)) {
    const text = sentence.text;
    const weighted = sentence.recencyWeight;
    const positiveHit = OUTCOME_POSITIVE_REGEXES.some((regex) => regex.test(text));
    const strongResolvedHit = OUTCOME_STRONG_RESOLVED_REGEXES.some((regex) => regex.test(text));
    const uncertaintyHit = OUTCOME_UNCERTAINTY_REGEXES.some((regex) => regex.test(text));
    const actionHit = ACTION_REGEXES.some((regex) => regex.test(text));

    if (positiveHit) {
      positiveScore += weighted;
      outcomes.push({ text: sentenceCase(text), score: weighted });
    }
    if (strongResolvedHit) {
      strongResolvedScore += weighted;
    }
    if (uncertaintyHit) {
      uncertaintyScore += weighted;
    }
    if (positiveHit && actionHit) {
      likelyFix.push({ text: sentenceCase(text), score: weighted + 0.25 });
    }
  }

  return {
    topOutcomeSnippets: unique(outcomes.sort((a, b) => b.score - a.score).map((entry) => entry.text)).slice(0, 3),
    likelyFixSnippets: unique(likelyFix.sort((a, b) => b.score - a.score).map((entry) => entry.text)).slice(0, 2),
    positiveScore,
    strongResolvedScore,
    uncertaintyScore,
  };
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

function extractActionsTried(messages: CaseStateMessage[], actionSnippets: string[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const patternHits = ACTION_PATTERNS.filter((pattern) => all.includes(pattern));
  return unique([...actionSnippets, ...patternHits]).slice(0, 10);
}

function buildMissingDetails(facts: KnownFacts, contextSnippets: string[]): string[] {
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
  if (contextSnippets.length === 0) missing.push("Current setup/system context details");
  return missing;
}

function buildInitialObservations(
  messages: CaseStateMessage[],
  facts: KnownFacts,
  observationSnippets: string[],
  outcomeSnippets: string[]
): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const observations: string[] = [...outcomeSnippets, ...observationSnippets].filter(
    (entry) => !isCorrectionSignalText(entry)
  );

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

  return unique(observations.map((entry) => toFieldNoteText(entry)).filter(Boolean)).slice(0, 12);
}

function buildSituationSummary(
  observations: string[],
  domains: string[],
  missingDetails: string[],
  contextSnippets: string[],
  outcomeSummary: OutcomeSummary
): string {
  const signalFacts = unique(observations.map((entry) => clipSentence(entry, 120))).slice(0, 3);
  const contextFacts = unique(contextSnippets.map((entry) => clipSentence(entry, 110))).slice(0, 2);
  const parts: string[] = [];
  if (signalFacts.length > 0) {
    parts.push(`Observed signals: ${signalFacts.join(" ")}`);
  }
  if (contextFacts.length > 0) {
    parts.push(`Reported conditions: ${contextFacts.join(" ")}`);
  }
  if (outcomeSummary.topOutcomeSnippets.length > 0) {
    parts.push(`Recent outcomes: ${clipSentence(outcomeSummary.topOutcomeSnippets[0], 120)}`);
  }
  if (parts.length === 0) {
    return "Observed signals are limited. Additional field notes are needed.";
  }
  return toFieldNoteText(parts.join(" "));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function normalizePlanToStep(plan: string): string {
  return plan
    .replace(/^(we|i)\s+(will|going to|plan to|planning to)\s+/i, "")
    .replace(/^(next)\s+/i, "")
    .trim();
}

function clipSentence(text: string, maxLen = 180): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3).trimEnd()}...`;
}

function buildSuggestedNextSteps(domains: string[], missingDetails: string[], planSnippets: string[]): string[] {
  const fromDomains = domains.flatMap((domain) => DOMAIN_TO_NEXT_STEPS[domain] ?? []);
  const fromMissing: string[] = [];
  const fromPlans = planSnippets
    .map((plan) => normalizePlanToStep(plan))
    .filter(Boolean)
    .map((plan) => sentenceCase(plan));

  if (missingDetails.some((detail) => detail.toLowerCase().includes("water source"))) {
    fromMissing.push("Review water source and remineralization context.");
  }
  if (missingDetails.some((detail) => detail.toLowerCase().includes("ph"))) {
    fromMissing.push("Measure pH with a calibrated meter.");
  }
  if (missingDetails.some((detail) => detail.toLowerCase().includes("biofilter") || detail.toLowerCase().includes("system maturity"))) {
    fromMissing.push("Review system maturity and biofilter status.");
  }
  if (missingDetails.some((detail) => detail.toLowerCase().includes("feeding"))) {
    fromMissing.push("Observe feeding response directly.");
  }
  if (missingDetails.some((detail) => detail.toLowerCase().includes("flow") || detail.toLowerCase().includes("vibration") || detail.toLowerCase().includes("pump"))) {
    fromMissing.push("Review flow/nozzle splash and pump vibration.");
  }

  return unique([...fromPlans, ...fromDomains, ...fromMissing]).slice(0, 8);
}

function buildCurrentStrategy(
  messages: CaseStateMessage[],
  fallbackSteps: string[],
  correction: CorrectionSummary = detectCorrectionSignals(messages)
): string[] {
  const advisoryPattern =
    /(should|need to|recommend|priority|priorit|focus on|isolate|reduce|lower|avoid|step|plan|start by|first|next move|move the nozzle|water changes|calibrat)/i;
  const expertPattern =
    /(we've seen|in our facility|as a vet|recommendation|best first move|usually works|priority right now|strongly recommend)/i;
  const evidence = analyzeHypothesisEvidence(messages, correction);
  const anchors = extractCaseAnchors(messages);
  const leadingHypothesis = evidence.top.key;
  const contextHint = anchors.context.length > 0 ? ` for ${joinAsList(anchors.context)}` : "";
  const symptomHint = anchors.symptoms.length > 0 ? ` with ${joinAsList(anchors.symptoms)}` : "";

  const baseSteps: Record<string, string> = {
    isolate_static:
      `Isolate a subset${contextHint} into static containers with daily water changes to test whether system conditions are driving the issue${symptomHint}.`,
    reduce_disturbance:
      `Reduce handling, room traffic, and other disturbance around affected tanks${contextHint}, then track behavior and feeding response over 48-72 hours.`,
    flow_vibration:
      `Reposition nozzle angle/height and reduce pump vibration or splash load, then compare lesion and appetite trends tank-by-tank.`,
    water_validation:
      `Run paired pH and conductivity checks with a freshly calibrated meter before and after interventions, and keep one stable water recipe.`,
    feeding_density:
      `Split high-density groups and increase feeding access/frequency to reduce competition, then monitor whether appetite recovers.`,
    system_stability:
      `Simplify system load while biofilter/system maturity stabilizes (fewer changes at once), and hold conditions steady for trend interpretation.`,
  };

  const hypothesisToKeys: Record<HypothesisKey, string[]> = {
    "flow-disturbance": ["flow_vibration", "reduce_disturbance", "isolate_static"],
    "water-chemistry": ["water_validation", "isolate_static", "system_stability"],
    "density-feeding": ["feeding_density", "reduce_disturbance", "isolate_static"],
    "system-maturity": ["system_stability", "water_validation", "isolate_static"],
    "handling-disturbance": ["reduce_disturbance", "flow_vibration", "isolate_static"],
    infection: ["isolate_static", "reduce_disturbance", "water_validation"],
  };

  const keywordToKey: Array<{ pattern: RegExp; key: keyof typeof baseSteps }> = [
    { pattern: /(isolate|static container|separate tank|subset)/i, key: "isolate_static" },
    { pattern: /(disturbance|handling|traffic|clamping|injection|avoid stress)/i, key: "reduce_disturbance" },
    { pattern: /(nozzle|flow|splash|vibration|pump|noise)/i, key: "flow_vibration" },
    { pattern: /(ph|conductivity|calibrat|water source|remineral|buffer|daily water)/i, key: "water_validation" },
    { pattern: /(feeding|competition|density|stocking|off food)/i, key: "feeding_density" },
    { pattern: /(biofilter|cycling|new system|system maturity|stability)/i, key: "system_stability" },
  ];

  const scoreByKey = new Map<string, number>();
  const countByKey = new Map<string, number>();
  const seenByMessageKey = new Set<string>();

  const addScore = (key: string, score: number, messageIndex?: number) => {
    const dedupeKey = `${messageIndex ?? -1}:${key}`;
    if (seenByMessageKey.has(dedupeKey)) {
      return;
    }
    seenByMessageKey.add(dedupeKey);
    scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + score);
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  };

  for (const unit of toSentenceUnits(messages)) {
    const isAdvisory = advisoryPattern.test(unit.text);
    const expertBoost = expertPattern.test(unit.text) ? 0.8 : 0;
    for (const { pattern, key } of keywordToKey) {
      if (pattern.test(unit.text) && (isAdvisory || unit.recencyWeight > 1.25)) {
        addScore(key, unit.recencyWeight + expertBoost, unit.messageIndex);
      }
    }
  }

  for (const step of fallbackSteps) {
    for (const { pattern, key } of keywordToKey) {
      if (pattern.test(step)) {
        addScore(key, 0.7);
      }
    }
  }

  if (evidence.dominant) {
    for (const key of hypothesisToKeys[leadingHypothesis]) {
      addScore(key, 1.4);
    }
  } else {
    for (const key of hypothesisToKeys[leadingHypothesis]) {
      addScore(key, 0.45);
    }
    if (evidence.second) {
      for (const key of hypothesisToKeys[evidence.second.key]) {
        addScore(key, 0.4);
      }
    }
  }

  const rankedKeys = Array.from(scoreByKey.entries())
    .map(([key, score]) => ({
      key,
      score: score + (countByKey.get(key) ?? 1) * 0.5,
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.key)
    .filter((key) => key in baseSteps);

  const prioritized = unique(
    rankedKeys
      .map((key) => baseSteps[key])
      .filter(Boolean)
  );

  const minStrategyItems = 3;
  const fallbackOrdered = hypothesisToKeys[leadingHypothesis].map((key) => baseSteps[key]);
  const merged = unique([...prioritized, ...fallbackOrdered]).slice(0, 6);
  if (merged.length >= minStrategyItems) {
    return merged;
  }
  return unique([...merged, ...Object.values(baseSteps)]).slice(0, minStrategyItems);
}

interface CaseAnchors {
  symptoms: string[];
  context: string[];
  environment: string[];
}

type HypothesisKey =
  | "water-chemistry"
  | "infection"
  | "flow-disturbance"
  | "density-feeding"
  | "system-maturity"
  | "handling-disturbance";

const HYPOTHESIS_PATTERNS: Record<HypothesisKey, RegExp[]> = {
  "water-chemistry": [/\bammonia\b/, /\bnitrite\b/, /\bph\b/, /\bconductivity\b/, /\bwater chemistry\b/],
  infection: [/\bpathogen\b/, /\binfection\b/, /\bmycobacter\b/, /\bdisease\b/],
  "flow-disturbance": [/\bnozzle\b/, /\bflow\b/, /\bsplash\b/, /\bvibration\b/, /\bpump\b/, /\bnoise\b/],
  "density-feeding": [/\bdensity\b/, /\bstocking\b/, /\bcompetition\b/, /\bfeeding\b/, /\boff food\b/],
  "system-maturity": [/\bbiofilter\b/, /\bcycling\b/, /\bnew system\b/, /\bsystem maturity\b/],
  "handling-disturbance": [/\bhandling\b/, /\bdisturbance\b/, /\btraffic\b/, /\binjection\b/, /\bclamping\b/],
};

const CORRECTION_SIGNAL_REGEXES = [
  /\bthis is not accurate\b/i,
  /\bthis is incorrect\b/i,
  /\bover[- ]emphasized\b/i,
  /\bshould not be\b/i,
  /\bi disagree with the summary\b/i,
  /\bsummary is wrong\b/i,
];

interface HypothesisEvidenceRow {
  key: HypothesisKey;
  overallScore: number;
  recentScore: number;
  mentionPosts: number;
  recentMentionPosts: number;
  combinedScore: number;
}

interface HypothesisAssessment {
  ranked: HypothesisEvidenceRow[];
  top: HypothesisEvidenceRow;
  second?: HypothesisEvidenceRow;
  dominant: boolean;
}

interface CorrectionSummary {
  hasAnyCorrection: boolean;
  hasHighImpactCorrection: boolean;
  penalties: Partial<Record<HypothesisKey, number>>;
}

function topicScore(text: string, patterns: RegExp[]): number {
  return patterns.reduce((acc, pattern) => acc + (pattern.test(text) ? 1 : 0), 0);
}

function normalizeRole(role?: string): MessageRole {
  const normalized = String(role || "standard").toLowerCase();
  if (normalized === "expert") return "expert";
  if (normalized === "trusted") return "trusted";
  return "standard";
}

function detectCorrectionSignals(messages: CaseStateMessage[]): CorrectionSummary {
  const penalties: Partial<Record<HypothesisKey, number>> = {};
  let hasAnyCorrection = false;
  let hasHighImpactCorrection = false;

  for (const message of messages) {
    const text = message.content || "";
    const isCorrectionSignal = Boolean(message.correctionSignal) || CORRECTION_SIGNAL_REGEXES.some((regex) => regex.test(text));
    if (!isCorrectionSignal) {
      continue;
    }
    hasAnyCorrection = true;

    const role = normalizeRole(message.role);
    const roleWeight = role === "expert" ? 2.5 : role === "trusted" ? 1.4 : 0.9;
    if (role === "expert") {
      hasHighImpactCorrection = true;
    }

    const lowered = normalize(text);
    const targetedKeys = (Object.keys(HYPOTHESIS_PATTERNS) as HypothesisKey[]).filter(
      (key) => topicScore(lowered, HYPOTHESIS_PATTERNS[key]) > 0
    );

    // Untargeted correction still dampens overconfidence globally.
    if (targetedKeys.length === 0) {
      for (const key of Object.keys(HYPOTHESIS_PATTERNS) as HypothesisKey[]) {
        penalties[key] = (penalties[key] ?? 0) + roleWeight * 0.35;
      }
      continue;
    }

    for (const key of targetedKeys) {
      penalties[key] = (penalties[key] ?? 0) + roleWeight;
    }
  }

  return { hasAnyCorrection, hasHighImpactCorrection, penalties };
}

function analyzeHypothesisEvidence(messages: CaseStateMessage[], correction: CorrectionSummary): HypothesisAssessment {
  const recentWindow = messages.slice(-Math.min(messages.length, 3));
  const rows: HypothesisEvidenceRow[] = (Object.keys(HYPOTHESIS_PATTERNS) as HypothesisKey[]).map((key) => {
    let overallScore = 0;
    let recentScore = 0;
    let mentionPosts = 0;
    let recentMentionPosts = 0;

    for (const message of messages) {
      const score = topicScore(normalize(message.content), HYPOTHESIS_PATTERNS[key]);
      overallScore += score;
      if (score > 0) {
        mentionPosts += 1;
      }
    }

    for (const message of recentWindow) {
      const score = topicScore(normalize(message.content), HYPOTHESIS_PATTERNS[key]);
      recentScore += score;
      if (score > 0) {
        recentMentionPosts += 1;
      }
    }

    const correctionPenalty = correction.penalties[key] ?? 0;
    const combinedScore = Math.max(0, recentScore * 2 + overallScore - correctionPenalty);
    return { key, overallScore, recentScore, mentionPosts, recentMentionPosts, combinedScore };
  });

  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  const top = rows[0] ?? { key: "flow-disturbance", overallScore: 0, recentScore: 0, mentionPosts: 0, recentMentionPosts: 0, combinedScore: 0 };
  const second = rows[1];
  const gap = top.combinedScore - (second?.combinedScore ?? 0);
  const dominant =
    (top.recentMentionPosts >= 2 && top.recentScore >= 2 && gap >= 1.5) ||
    (top.recentMentionPosts >= 1 && top.recentScore >= 3 && top.mentionPosts >= 3 && gap >= 2);

  // Guardrail: once interpretation is challenged, avoid premature single-factor lock-in.
  return { ranked: rows, top, second, dominant: correction.hasAnyCorrection ? false : dominant };
}

function extractCaseAnchors(messages: CaseStateMessage[]): CaseAnchors {
  const all = normalize(messages.map((message) => message.content).join(" "));
  const anchors: CaseAnchors = { symptoms: [], context: [], environment: [] };

  if (/(lesion|redness|ulcer|skin|abrasion|irritation)/.test(all)) anchors.symptoms.push("skin lesions and redness");
  if (/(not eating|off food|reduced feeding|poor feeding|feeding response)/.test(all)) anchors.symptoms.push("reduced feeding response");
  if (/(letharg|listless|weak|inactive)/.test(all)) anchors.symptoms.push("lethargy");
  if (/(mortality|deaths|dying)/.test(all)) anchors.symptoms.push("ongoing mortality");

  if (/(post[- ]shipment|shipment|arrival|arrived|new frogs|received)/.test(all)) anchors.context.push("post-shipment cohorts");
  if (/(male frogs|males|male)/.test(all)) anchors.context.push("male frogs");
  if (/(within days|within weeks|recently)/.test(all)) anchors.context.push("recent onset");
  if (/(new system|cycling|biofilter|system maturity)/.test(all)) anchors.context.push("an evolving system setup");

  if (/(nozzle|flow|splash|surface agitation)/.test(all)) anchors.environment.push("flow/nozzle disturbance");
  if (/(vibration|pump|noise|hum)/.test(all)) anchors.environment.push("pump vibration and noise load");
  if (/(disturbance|traffic|handling|clamping|injection)/.test(all)) anchors.environment.push("handling and disturbance pressure");
  if (/(density|stocking|competition|crowd)/.test(all)) anchors.environment.push("density and feeding competition");
  if (/(maintenance|workload|labor|load)/.test(all)) anchors.environment.push("high maintenance burden");

  return {
    symptoms: unique(anchors.symptoms).slice(0, 3),
    context: unique(anchors.context).slice(0, 2),
    environment: unique(anchors.environment).slice(0, 3),
  };
}

function joinAsList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function countMeaningfulPosts(messages: CaseStateMessage[]): number {
  return messages.filter((message) => {
    const text = message.content.trim();
    if (text.length < 35) {
      return false;
    }
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return wordCount >= 6;
  }).length;
}

function toDeepAction(step: string, anchors: CaseAnchors): string {
  const normalized = step.toLowerCase();
  const contextHint = anchors.context.length > 0 ? ` for ${joinAsList(anchors.context)}` : "";
  const symptomHint = anchors.symptoms.length > 0 ? ` with ${joinAsList(anchors.symptoms)}` : "";

  if (/(static containers|isolate a subset|daily water changes)/.test(normalized)) {
    return `Isolate a subset${contextHint} into static containers with daily water changes, and compare trend changes against system-connected tanks to confirm whether shared system conditions are driving the issue${symptomHint}.`;
  }
  if (/(disturbance|room traffic|handling)/.test(normalized)) {
    return `Reduce handling and room disturbance immediately${contextHint}, and hold this lower-stress setup for 48-72 hours while tracking feeding and lesion trend changes.`;
  }
  if (/(nozzle|flow|vibration|splash|pump)/.test(normalized)) {
    return "Reposition nozzle flow and dampen pump vibration/splash load, then monitor whether appetite and skin findings improve in the next observation window.";
  }
  if (/(ph|conductivity|calibrated|water recipe|water source)/.test(normalized)) {
    return "Run paired pH/conductivity checks with a freshly calibrated meter before and after interventions, and keep one stable water recipe so outcomes stay interpretable.";
  }
  if (/(density|feeding|competition)/.test(normalized)) {
    return "Split density pressure and increase feeding access/frequency so weaker frogs are not outcompeted, then reassess appetite and body condition by subgroup.";
  }
  if (/(biofilter|system maturity|stability|cycling)/.test(normalized)) {
    return "Reduce simultaneous system changes and hold stable husbandry conditions while the system matures, so you can separate signal from noise.";
  }

  return sentenceCase(step);
}

function buildWhyDirection(
  hypothesis: HypothesisAssessment,
  anchors: CaseAnchors,
  correction: CorrectionSummary
): string {
  const driverMap: Record<HypothesisKey, string> = {
    "flow-disturbance": "flow/nozzle disturbance and vibration load",
    "water-chemistry": "water chemistry instability",
    "density-feeding": "feeding pressure and density competition",
    "system-maturity": "system maturity and biofilter instability",
    "handling-disturbance": "handling and disturbance pressure",
    infection: "possible infectious contribution with system stress",
  };
  const symptomPart = anchors.symptoms.length > 0 ? `Observed issues include ${joinAsList(anchors.symptoms)}.` : "";
  const contextPart = anchors.context.length > 0 ? `Case context includes ${joinAsList(anchors.context)}.` : "";
  const environmentPart = anchors.environment.length > 0 ? `Field signals include ${joinAsList(anchors.environment)}.` : "";
  if (correction.hasAnyCorrection) {
    return [symptomPart, contextPart, environmentPart, "Actions focus on repeated field signals and direct checks."]
      .filter(Boolean)
      .map((entry) => sentenceCase(entry))
      .join(" ");
  }
  if (hypothesis.dominant) {
    return [symptomPart, contextPart, environmentPart, `Primary action focus: ${driverMap[hypothesis.top.key]}.`]
      .filter(Boolean)
      .map((entry) => sentenceCase(entry))
      .join(" ");
  }
  const secondary = hypothesis.second ? driverMap[hypothesis.second.key] : "other active husbandry factors";
  return [symptomPart, contextPart, environmentPart, `Action targets: ${driverMap[hypothesis.top.key]} and ${secondary}.`]
    .filter(Boolean)
    .map((entry) => sentenceCase(entry))
    .join(" ");
}

export function buildKeyStrategies(messages: CaseStateMessage[]): KeyStrategiesResult {
  const title = "Emerging Strategy";
  const meaningfulPostCount = countMeaningfulPosts(messages);
  const domains = inferDomainsInPlay(messages);

  if (meaningfulPostCount < 4 || domains.length < 2) {
    return {
      ready: false,
      title,
      message:
        "More detail is needed before generating strong strategies. Consider adding feeding behavior, water parameters, system setup, or recent changes.",
    };
  }

  const anchors = extractCaseAnchors(messages);
  const correction = detectCorrectionSignals(messages);
  const hypothesis = analyzeHypothesisEvidence(messages, correction);
  const recap = buildCaseState(messages, messages[0]?.threadId ?? "thread");

  const ranked = buildCurrentStrategy(messages, recap.suggestedNextSteps, correction).map((step) => toDeepAction(step, anchors));
  const uniqueRanked = unique(ranked).slice(0, 6);
  const primary = uniqueRanked[0] ?? "Stabilize immediate husbandry conditions and test one high-signal intervention first.";
  const secondary = uniqueRanked[1] ?? "Track short-interval outcome changes to confirm or reject the working hypothesis.";
  const supporting = uniqueRanked.slice(2, 5);

  return {
    ready: true,
    title,
    primaryIntervention: toFieldNoteText(sentenceCase(primary)),
    secondaryIntervention: toFieldNoteText(sentenceCase(secondary)),
    supportingActions: supporting.map((item) => toFieldNoteText(sentenceCase(item))).filter(Boolean),
    whyThisDirection: toFieldNoteText(buildWhyDirection(hypothesis, anchors, correction)),
  };
}

export function buildInterpretationAudit(messages: CaseStateMessage[]): InterpretationAudit {
  const correction = detectCorrectionSignals(messages);
  const evidence = analyzeHypothesisEvidence(messages, correction);
  const correctionPenalties: Record<string, number> = {};
  for (const key of Object.keys(HYPOTHESIS_PATTERNS) as HypothesisKey[]) {
    correctionPenalties[key] = correction.penalties[key] ?? 0;
  }

  return {
    correctionDetected: correction.hasAnyCorrection,
    highImpactCorrection: correction.hasHighImpactCorrection,
    correctionPenalties,
    dominantFactor: evidence.top.key,
    isDominant: evidence.dominant,
    ranking: evidence.ranked.map((row) => ({
      key: row.key,
      combinedScore: row.combinedScore,
      recentScore: row.recentScore,
      mentionPosts: row.mentionPosts,
      recentMentionPosts: row.recentMentionPosts,
    })),
  };
}

function inferCurrentCaseStatus(
  outcomes: OutcomeSummary,
  resolutionStatus: ResolutionStatus,
  hasActions: boolean
): CurrentCaseStatus {
  if (outcomes.strongResolvedScore >= 2 && outcomes.uncertaintyScore < 0.8) {
    return "improved";
  }
  if (resolutionStatus === "resolved") {
    return "improved";
  }
  if (outcomes.positiveScore >= 1.2 && hasActions) {
    return "monitoring";
  }
  if (hasActions && outcomes.positiveScore < 0.6 && outcomes.uncertaintyScore < 0.5) {
    return "unresolved";
  }
  if (outcomes.positiveScore > 0 && outcomes.uncertaintyScore > 0) {
    return "mixed / still under discussion";
  }
  return "open";
}

function buildConversationalCaseUpdate(params: {
  messages: CaseStateMessage[];
  outcomes: OutcomeSummary;
  domainsInPlay: string[];
}): string {
  const { messages, outcomes, domainsInPlay } = params;
  const sentences: string[] = [];

  const anchors = extractCaseAnchors(messages);
  if (anchors.symptoms.length > 0) {
    sentences.push(`Observed issues: ${joinAsList(anchors.symptoms)}.`);
  } else {
    sentences.push("Observed issues are documented but remain non-specific.");
  }
  if (anchors.context.length > 0 || anchors.environment.length > 0) {
    const contextLine = [
      anchors.context.length > 0 ? `Context: ${joinAsList(anchors.context)}` : "",
      anchors.environment.length > 0 ? `Conditions: ${joinAsList(anchors.environment)}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    if (contextLine) sentences.push(sentenceCase(contextLine));
  }
  if (domainsInPlay.length > 0) {
    sentences.push(`Domains: ${domainsInPlay.join(", ")}.`);
  }
  if (outcomes.topOutcomeSnippets.length > 0) {
    sentences.push(`Recent outcomes: ${clipSentence(outcomes.topOutcomeSnippets[0], 120)}.`);
  }

  const deduped = unique(
    sentences
      .map((sentence) => sentenceCase(sentence))
      .filter(Boolean)
  );
  return toFieldNoteText(deduped.slice(0, 6).join(" "));
}

function inferResolutionStatus(messages: CaseStateMessage[], outcomes: OutcomeSummary): ResolutionStatus {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  if (outcomes.strongResolvedScore >= 1.5 && outcomes.uncertaintyScore < 1.0) {
    return "resolved";
  }
  if (outcomes.positiveScore >= 1.0) {
    return "monitoring";
  }
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
  const intents = scoreAndSelectByIntent(messages);
  const outcomes = detectOutcomeSummary(messages);
  const correction = detectCorrectionSignals(messages);
  const domainsInPlay = inferDomainsInPlay(messages);
  const actionsTried = extractActionsTried(messages, intents.ACTION);
  const missingDetails = buildMissingDetails(knownFacts, intents.CONTEXT);
  const initialObservations = buildInitialObservations(messages, knownFacts, intents.OBSERVATION, outcomes.topOutcomeSnippets);
  const situationSummary = buildSituationSummary(initialObservations, domainsInPlay, missingDetails, intents.CONTEXT, outcomes);
  const resolutionStatus = inferResolutionStatus(messages, outcomes);
  const suggestedNextSteps = buildSuggestedNextSteps(domainsInPlay, missingDetails, intents.PLAN);
  const currentStrategy = buildCurrentStrategy(messages, suggestedNextSteps, correction);
  const currentStatus = inferCurrentCaseStatus(outcomes, resolutionStatus, actionsTried.length > 0);
  const caseUpdate = buildConversationalCaseUpdate({
    messages,
    outcomes,
    domainsInPlay,
  });

  return {
    threadId,
    caseUpdate: toFieldNoteText(caseUpdate),
    currentStrategy,
    currentStatus,
    situationSummary: toFieldNoteText(situationSummary),
    initialObservations: initialObservations.map((entry) => toFieldNoteText(entry)).filter(Boolean),
    missingDetails,
    domainsInPlay,
    actionsTried,
    suggestedNextSteps,
    resolutionStatus,
    sourceMessageIds: messages.map((message) => message.id),
  };
}

