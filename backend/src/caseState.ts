type ResolutionStatus = "open" | "monitoring" | "resolved";
type MessageIntent = "ACTION" | "OBSERVATION" | "CONTEXT" | "PLAN";
type CurrentCaseStatus = "open" | "monitoring" | "improved" | "unresolved" | "mixed / still under discussion";
type MessageRole = "expert" | "trusted" | "standard";

export interface CaseKnowledgeContext {
  knownChecks: string[];
  memorySignals: string[];
}

export interface CaseStateMessage {
  id: string;
  threadId: string;
  content: string;
  role?: MessageRole | string;
  correctionSignal?: boolean;
}

/** Strict topic / time-bucket summaries for mixed threads (e.g. feeding vs ammonia). */
export interface TopicTrackSummary {
  topicLabel: string;
  firstPostAt?: string;
  lastPostAt?: string;
  summary: string;
  context?: string;
  openPoints?: string;
  /** Segment that contains the chronologically latest post in the thread */
  isActive?: boolean;
}

export interface CaseState {
  threadId: string;
  caseUpdate: string;
  emergingThreads: string[];
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
  /** Present when LLM recap used strict per-segment summaries */
  topicTracks?: TopicTrackSummary[];
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
    "ammonia",
    "nitrite",
    "buffer",
    "buffering",
    "remineral",
    "conductivity",
    "reverse osmosis",
    "well water",
    "city water",
    "tap water",
    "water chemistry",
    "water quality",
    "water parameters",
  ],
  "flow and vibration": [
    "nozzle",
    "splash",
    "surface agitation",
    "vibration",
    "pump noise",
    "pump vibration",
  ],
  "density and feeding": [
    "population density",
    "stocking density",
    "overcrowded",
    "not eating",
    "off food",
    "food left",
    "uneaten",
    "feeding response",
    "reduced feeding",
    "poor feeding",
    "feeding behavior",
  ],
  "handling and disturbance": [
    "handling stress",
    "rough handling",
    "grabbed",
    "picked up",
    "netting",
    "injection",
    "room disturbance",
    "room traffic",
  ],
  "lesions and shelters": [
    "lesion",
    "redness",
    "ulcer",
    "wound",
    "abrasion",
    "shelter",
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

interface SignalRow {
  key: string;
  label: string;
  observedMentions: number;
  speculativeMentions: number;
  weightedScore: number;
  recentMentions: number;
}

interface SignalLedger {
  observedTop: SignalRow[];
  speculativeTop: SignalRow[];
  mixedTop: SignalRow[];
}

const SPECULATIVE_CUE_REGEX =
  /\b(maybe|might|could|possibly|suspect|guess|hypothesis|unclear|not sure|i think|likely|possible)\b/i;

const OBSERVED_CUE_REGEX =
  /\b(observed|noticed|seeing|saw|reported|present|measured|counted|tracked|trend|worse|improv|stable|not eating|off food|redness|lesion|mortality)\b/i;

const SIGNAL_PATTERNS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "feeding", label: "reduced feeding response", pattern: /\b(not eating|off food|reduced feeding|poor feeding|feeding response)\b/i },
  { key: "skin", label: "skin lesions or redness", pattern: /\b(lesion|redness|ulcer|skin|abrasion|irritation)\b/i },
  { key: "mortality", label: "mortality events", pattern: /\b(mortality|deaths|dying)\b/i },
  { key: "lethargy", label: "lethargy/low activity", pattern: /\b(letharg|weak|inactive|listless)\b/i },
  { key: "flow", label: "flow/nozzle disturbance", pattern: /\b(flow|nozzle|splash|surface agitation)\b/i },
  { key: "vibration", label: "pump vibration/noise load", pattern: /\b(vibration|pump|noise|hum)\b/i },
  { key: "handling", label: "handling/disturbance pressure", pattern: /\b(handling|disturbance|traffic|injection|clamping)\b/i },
  { key: "density", label: "density/competition pressure", pattern: /\b(density|stocking|competition|crowd)\b/i },
  { key: "water", label: "water chemistry instability", pattern: /\b(ammonia|nitrite|ph|conductivity|remineral|buffer|water chemistry)\b/i },
  { key: "maturity", label: "system maturity/biofilter instability", pattern: /\b(system maturity|biofilter|cycling|new system|mature filter)\b/i },
];

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
      .filter((part) => !isSyntheticUpdateLine(part))
      .filter((part) => !isGeneratedSummaryArtifact(part))
      .forEach((part) => {
        units.push({ text: part, messageIndex: index, recencyWeight });
      });
  });
  return units;
}

function isSyntheticUpdateLine(text: string): boolean {
  const lower = normalize(String(text || "").replace(/\s+/g, " ").trim());
  if (!lower) return true;
  const blocked = [
    /^describe update for\b/,
    /^direct intake check\b/,
    /^update pass\b/,
    /^unified update test\b/,
    /^second unified update test\b/,
    /^case note update\b/,
    /\bunify-e2e-\d+\b/,
    /^\d+(\.\d+)?[,;: ]+\s*conductivity\b/,
    /^\d+(\.\d+)?[,;: ]+\s*ph\b/,
    /^conductivity\s+\d{2,5}\s*microsiemens\b/,
  ];
  return blocked.some((pattern) => pattern.test(lower));
}

function buildSignalLedger(messages: CaseStateMessage[]): SignalLedger {
  const rows = new Map<string, SignalRow>();
  const units = toSentenceUnits(messages);
  const recentCutoff = Math.max(0, units.length - 8);

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const sentence = unit.text;
    if (isCorrectionSignalText(sentence)) {
      continue;
    }
    const speculative = SPECULATIVE_CUE_REGEX.test(sentence);
    const observed = OBSERVED_CUE_REGEX.test(sentence) || !speculative;

    for (const signal of SIGNAL_PATTERNS) {
      if (!signal.pattern.test(sentence)) continue;
      const existing =
        rows.get(signal.key) ??
        ({
          key: signal.key,
          label: signal.label,
          observedMentions: 0,
          speculativeMentions: 0,
          weightedScore: 0,
          recentMentions: 0,
        } as SignalRow);
      if (observed) {
        existing.observedMentions += 1;
        existing.weightedScore += unit.recencyWeight * 1.2;
      } else {
        existing.speculativeMentions += 1;
        existing.weightedScore += unit.recencyWeight * 0.5;
      }
      if (i >= recentCutoff) {
        existing.recentMentions += 1;
        existing.weightedScore += 0.3;
      }
      rows.set(signal.key, existing);
    }
  }

  const ranked = Array.from(rows.values()).sort((a, b) => b.weightedScore - a.weightedScore);
  const observedTop = ranked.filter((row) => row.observedMentions >= Math.max(2, row.speculativeMentions + 1)).slice(0, 4);
  const speculativeTop = ranked.filter((row) => row.speculativeMentions > row.observedMentions).slice(0, 3);
  const mixedTop = ranked
    .filter((row) => row.observedMentions > 0 && row.speculativeMentions > 0)
    .slice(0, 3);

  return { observedTop, speculativeTop, mixedTop };
}

function hasSpeculativeDiscussion(messages: CaseStateMessage[]): boolean {
  return messages.some((message) => SPECULATIVE_CUE_REGEX.test(message.content || ""));
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
  const cleaned = sanitizeGeneratedText(text);
  if (!cleaned) return "";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => clipSentence(part, 160))
    .map((part) => sentenceCase(part));

  return unique(sentences).slice(0, 6).join(" ");
}

const LOW_TRUST_PHRASES = [
  /\bcurrent thinking\b/gi,
  /\binterpretation\b/gi,
  /\bunder review\b/gi,
  /\bthis suggests\b/gi,
  /\bthis direction is based on\b/gi,
  /\bit seems? (?:that |like )/gi,
  /\bthis could potentially\b/gi,
  /\bthe ai (?:believes?|thinks?|suggests?)\b/gi,
  /\bpotentially indicate\b/gi,
  /\bimportantly\b/gi,
  /\bit'?s (?:important|worth noting|crucial) (?:to note |that )/gi,
  /\boverall[,.]?\s*/gi,
  /\bin summary[,.]?\s*/gi,
  /\bas mentioned (?:earlier|above|before)\b/gi,
  /\bplease note that\b/gi,
  /\bremember that\b/gi,
  /\bkeep in mind\b/gi,
  /\blet me know if\b/gi,
  /\bhope this helps\b/gi,
  /\bdon't hesitate\b/gi,
];

const SPELLING_FIXES: Array<[RegExp, string]> = [
  [/\bamonia\b/gi, "ammonia"],
  [/\bammona\b/gi, "ammonia"],
  [/\bbiofiliter\b/gi, "biofilter"],
  [/\bnitirte\b/gi, "nitrite"],
  [/\bntirate\b/gi, "nitrate"],
  [/\bXenpous\b/g, "Xenopus"],
  [/\bXenoupus\b/g, "Xenopus"],
  [/\bXenopous\b/g, "Xenopus"],
  [/\brecircualting\b/gi, "recirculating"],
  [/\brecircualtion\b/gi, "recirculation"],
  [/\bhusbandary\b/gi, "husbandry"],
  [/\bmortaliy\b/gi, "mortality"],
  [/\btemperture\b/gi, "temperature"],
  [/\bconductivty\b/gi, "conductivity"],
  [/\bfeedig\b/gi, "feeding"],
];

export function sanitizeGeneratedText(text: string): string {
  let out = String(text || "");
  for (const pattern of LOW_TRUST_PHRASES) {
    out = out.replace(pattern, "");
  }
  for (const [pattern, fix] of SPELLING_FIXES) {
    out = out.replace(pattern, fix);
  }
  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])\1+/g, "$1")
    .replace(/^\s*[.,;:!?]\s*/, "")
    .trim();
  return out;
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
    if (isCorrectionSignalText(sentence.text)) {
      continue;
    }
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
    waterSource: /(\bro water\b|\bdi water\b|\breverse osmosis\b|\bwell water\b|\bcity water\b|\btap water\b|\bro system\b|\bro unit\b)/i.test(all),
    ph: /\bph\b/.test(all),
    phCalibration: /\bcalibrat/.test(all),
    conductivity: /\b(conductivity|tds|ppm)\b|ms\/cm|us\/cm|µs\/cm|\bec\b/.test(all),
    buffering: /\b(buffer|buffering|bicarbonate|remineral)\b|\bgh\b|\bkh\b/.test(all),
    flow: /\b(flow|nozzle|splash|surface agitation)\b/.test(all),
    vibration: /\b(vibration|hum|pump)\b|\bnoise\b/.test(all),
    density: /\b(population density|stocking density|overcrowded|too many frogs)\b/.test(all),
    feeding: /\b(not eating|off food|uneaten|food left|feeding response|reduced feeding|poor feeding|feeding behavior)\b/.test(all),
    handling: /\b(handling stress|rough handling|grabbed|picked up|netting)\b/.test(all),
    injection: /\b(inject|injection)\b/.test(all),
    lesions: /\b(lesion|redness|ulcer|wound|abrasion)\b/.test(all),
    light: /\b(dark cycle|photoperiod|light cycle)\b/.test(all),
    disturbance: /\b(room disturbance|room traffic|room entries)\b/.test(all),
    systemMaturity,
    biofilterStatus,
    systemNewOrCycling: /(new system|newly set up|cycling|recently modified)/.test(all),
  };
}

function inferDomainsInPlay(messages: CaseStateMessage[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const matchesKeyword = (keyword: string): boolean => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    return pattern.test(all);
  };
  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(keyword)))
    .map(([domain]) => domain);
}

function extractActionsTried(messages: CaseStateMessage[], actionSnippets: string[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const patternHits = ACTION_PATTERNS.filter((pattern) => all.includes(pattern));
  return unique([...actionSnippets, ...patternHits]).slice(0, 10);
}

function buildMissingDetails(facts: KnownFacts, contextSnippets: string[], messages: CaseStateMessage[]): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const hasWaterSignals = /\b(ph|conductivity|ammonia|nitrite|water source|remineral|buffer|biofilter|filtration|water chemistry)\b/.test(all);
  const hasFlowSignals = /\b(nozzle|splash|surface agitation)\b/.test(all) || /\b(vibration|pump)\b/.test(all);
  const hasFeedingSignals = /\b(not eating|off food|reduced feeding|poor feeding|feeding response|feeding behavior|uneaten|food left)\b/.test(all);
  const hasHandlingSignals = /\b(handling stress|rough handling|injection|inject|room disturbance|room traffic)\b/.test(all);
  const hasSkinSignals = /\b(lesion|redness|ulcer|wound|abrasion)\b/.test(all);
  const hasSystemSignals = /\b(system maturity|biofilter|cycling|new system|newly set up|recently modified)\b/.test(all);
  const missing: string[] = [];
  if (hasSystemSignals && (!facts.systemMaturity || !facts.biofilterStatus)) {
    missing.push("System maturity / biofilter status");
  }
  if (hasWaterSignals) {
    if (!facts.waterSource) missing.push("Water source (RO, city, well, mixed)");
    if (!facts.ph) missing.push("Measured pH");
    if (!facts.phCalibration) missing.push("pH meter calibration status");
    if (!facts.conductivity) missing.push("Conductivity/TDS readings");
    if (!facts.buffering) missing.push("Buffering / remineralization context (GH/KH)");
  }
  if (hasFlowSignals) {
    if (!facts.flow) missing.push("Flow/nozzle/splash context");
    if (!facts.vibration) missing.push("Vibration/pump-noise context");
  }
  if (hasFeedingSignals) {
    if (!facts.density) missing.push("Tank density / stocking context");
    if (!facts.feeding) missing.push("Observed feeding response");
  }
  if (hasHandlingSignals) {
    if (!facts.handling && !facts.injection) missing.push("Recent handling/injection history");
    if (!facts.light && !facts.disturbance) missing.push("Light and disturbance context");
  }
  if (hasSkinSignals && !facts.lesions) {
    missing.push("Lesion/skin finding details");
  }
  return missing;
}

function mergeKnowledgeChecks(
  missingDetails: string[],
  knownChecks: string[],
  messages: CaseStateMessage[]
): string[] {
  if (!knownChecks.length) return missingDetails;
  if (missingDetails.length === 0) return missingDetails;
  const all = normalize(messages.map((message) => message.content).join(" "));
  const existing = new Set(missingDetails.map((entry) => normalize(entry)));
  const merged = [...missingDetails];
  for (const check of knownChecks) {
    const key = normalize(check);
    if (existing.has(key)) continue;
    const tokens = key.split(/\s+/).filter((token) => token.length >= 4);
    const covered = tokens.some((token) => all.includes(token));
    if (!covered) {
      merged.push(check);
      existing.add(key);
    }
  }
  return merged;
}

function buildInitialObservations(
  messages: CaseStateMessage[],
  facts: KnownFacts,
  observationSnippets: string[],
  outcomeSnippets: string[]
): string[] {
  const all = normalize(messages.map((message) => message.content).join("\n"));
  const fieldSignalPattern =
    /(lesion|redness|ulcer|skin|mortality|deaths|dying|feeding|off food|not eating|appetite|flow|nozzle|vibration|pump|noise|water|ph|conductivity|biofilter|system maturity|handling|disturbance|density|competition|improv|stabil)/i;
  const complaintPattern =
    /(not accurate|incorrect|over[- ]emphasized|disagree|revise|no actions logged|summary|key strategies|please|should not be)/i;
  const observations: string[] = [...outcomeSnippets, ...observationSnippets].filter(
    (entry) =>
      !isCorrectionSignalText(entry) &&
      !complaintPattern.test(entry) &&
      fieldSignalPattern.test(entry) &&
      isReliableObservationSnippet(entry)
  );

  if (facts.systemMaturity || facts.biofilterStatus) {
    if (facts.systemNewOrCycling) {
      observations.push("System maturity is likely an active factor (new/cycling context present).");
    } else {
      observations.push("System maturity and biofilter context are being discussed as case factors.");
    }
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
  if (/(\bro water\b|\bdi water\b|\breverse osmosis\b|\bwell water\b|\bcity water\b|\btap water\b|\bro system\b|\bro unit\b)/i.test(all)) {
    observations.push("Water-source details are present in the discussion.");
  }

  return unique(observations.map((entry) => toFieldNoteText(entry)).filter(Boolean)).slice(0, 12);
}

function isReliableObservationSnippet(text: string): boolean {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();

  // Drop templated/dev-style recap lines that read like synthetic imports.
  const syntheticPatterns = [
    /^describe update for\b/,
    /^direct intake check\b/,
    /^update pass\b/,
    /^unified update test\b/,
    /^case note update\b/,
    /^second unified update test\b/,
    /\bunify-e2e-\d+\b/,
    /^\d+(\.\d+)?[,;: ]+\s*conductivity\b/,
  ];
  if (syntheticPatterns.some((pattern) => pattern.test(lower))) {
    return false;
  }

  // Guardrail: avoid confident named-attribution lines unless they are simple direct reports.
  if (/^lab\s+[a-z0-9 _-]{2,60}\s+observed\b/i.test(cleaned)) {
    return false;
  }

  return true;
}

function buildSituationSummary(
  observations: string[],
  signalLedger: SignalLedger,
  hasSpeculation: boolean,
  contextSnippets: string[],
  outcomeSummary: OutcomeSummary
): string {
  const signalFacts = unique(
    signalLedger.observedTop.map((row) => sentenceCase(row.label)).concat(observations.map((entry) => clipSentence(entry, 120)))
  ).slice(0, 3);
  const contextFacts = unique(contextSnippets.map((entry) => clipSentence(entry, 110))).slice(0, 2);
  const parts: string[] = [];
  if (signalFacts.length > 0) {
    parts.push(`Observed signals: ${signalFacts.join(" ")}`);
  }
  if (signalLedger.speculativeTop.length > 0) {
    parts.push(`Still uncertain: ${signalLedger.speculativeTop.map((row) => row.label).join(", ")}.`);
  } else if (hasSpeculation) {
    parts.push("Still uncertain: causal driver remains unconfirmed.");
  }
  if (contextFacts.length > 0) {
    parts.push(`Reported conditions: ${contextFacts.join(" ")}`);
  }
  if (outcomeSummary.topOutcomeSnippets.length > 0) {
    const outcomeSnippet = clipSentence(outcomeSummary.topOutcomeSnippets[0], 120);
    const alreadyPresent = parts.some((p) => p.toLowerCase().includes(outcomeSnippet.toLowerCase().slice(0, 30)));
    if (!alreadyPresent) {
      parts.push(`Recent outcomes: ${outcomeSnippet}`);
    }
  }
  if (parts.length === 0) {
    return "";
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
  if (domains.length === 0 && missingDetails.length === 0 && planSnippets.length === 0) return [];
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

function buildEmergingThreads(
  messages: CaseStateMessage[],
  signalLedger: SignalLedger,
  knowledge: CaseKnowledgeContext,
  knownFacts: KnownFacts,
  domains: string[],
  missingDetails: string[]
): string[] {
  const postCount = messages.length;

  if (postCount <= 1) {
    if (postCount === 0) return [];
    const text = normalize(messages[0].content);
    const signals: string[] = [];
    if (/(feeding|off food|not eating|appetite)/.test(text)) signals.push("feeding behavior");
    if (/(ammonia|nitrite|nitrate|biofilter|nitrogen)/.test(text)) signals.push("nitrogen / biofilter");
    if (/(lesion|redness|ulcer|skin|abrasion)/.test(text)) signals.push("skin findings");
    if (/((?:^|\s)ph(?:\s|$)|conductivity|water source|\bro\b|reverse osmosis|water chemistry)/.test(text)) signals.push("water parameters");
    if (/(density|competition|stocking)/.test(text)) signals.push("stocking density");
    if (/(mortality|death|died)/.test(text)) signals.push("mortality");
    if (signals.length === 0) return [];
    if (signals.length === 1) return [`Initial observation: ${signals[0]}.`];
    return [`Initial observation: ${signals.slice(0, 2).join(" and ")}.`];
  }

  const correction = detectCorrectionSignals(messages);
  const hypothesis = analyzeHypothesisEvidence(messages, correction);
  const recentUnits = toSentenceUnits(messages).slice(-10);
  const recentText = normalize(recentUnits.map((unit) => unit.text).join(" "));
  const all = normalize(messages.map((message) => message.content).join(" "));
  const threads: string[] = [];
  const focalMap: Record<HypothesisKey, string> = {
    "flow-disturbance": "flow/nozzle disturbance",
    "water-chemistry": "water parameters and filtration stability",
    "density-feeding": "feeding pressure and density load",
    "system-maturity": "system maturity and biofilter stability",
    "handling-disturbance": "handling and disturbance load",
    infection: "possible infectious contribution under stress",
  };

  if (signalLedger.observedTop.length >= 2 || hypothesis.top.mentionPosts >= 2) {
    threads.push("Shared system stressor across repeated posts.");
  }

  if (hypothesis.dominant && hypothesis.top.combinedScore > 0) {
    threads.push(`Posts converging on ${focalMap[hypothesis.top.key]}.`);
  } else if (hypothesis.top.combinedScore > 0 && hypothesis.second && hypothesis.second.combinedScore > 0) {
    threads.push(
      `Focal points: ${focalMap[hypothesis.top.key]} and ${focalMap[hypothesis.second.key]}.`
    );
  }

  if (/(feeding|off food|not eating|appetite)/.test(all) && /(ph|conductivity|ammonia|biofilter|filtration|water chemistry)/.test(all)) {
    threads.push("Feeding pressure and water parameters discussed across posts.");
  }
  if (/(tropicalis)/.test(all) && /(died first|died|mortality|deaths)/.test(all)) {
    threads.push("Species pattern (tropicalis losses first) suggests environmental load.");
  }
  if (/(vet|veterinary|veterinarian)/.test(all)) {
    threads.push("Veterinary input present.");
  }

  for (const row of signalLedger.observedTop.slice(0, 3)) {
    if (row.recentMentions >= 1 && row.observedMentions >= 2) {
      threads.push(`${row.label} repeated across posts.`);
    }
  }
  for (const row of signalLedger.mixedTop.slice(0, 1)) {
    if (postCount >= 3) {
      threads.push(`${row.label} discussed with mixed confidence.`);
    }
  }

  if (postCount >= 3 && /(feeding|off food|not eating|appetite)/.test(recentText)) {
    threads.push("Feeding trend active across multiple posts.");
  }
  if (postCount >= 3 && /(lesion|redness|ulcer|skin|abrasion)/.test(recentText)) {
    threads.push("Skin findings under active review.");
  }
  if (postCount >= 3 && /(density|competition|handling|disturbance|traffic)/.test(all)) {
    threads.push("Density and disturbance load noted.");
  }
  return unique(threads.map((entry) => toFieldNoteText(entry)).filter(Boolean));
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
  const explicitDensityConcern = hasExplicitDensityConcern(messages);

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
      `Verify feeding access and appetite trend tank-by-tank without changing baseline population structure unless direct competition is observed.`,
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
    { pattern: /(competition|density|stocking|crowd|outcompeted|uneven feeding|off food)/i, key: "feeding_density" },
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

  const filteredRankedKeys = rankedKeys.filter((key) => {
    if (key !== "feeding_density") return true;
    return explicitDensityConcern;
  });

  const prioritized = unique(
    filteredRankedKeys
      .map((key) => baseSteps[key])
      .filter(Boolean)
  );

  const minStrategyItems = 3;
  const fallbackOrdered = hypothesisToKeys[leadingHypothesis]
    .filter((key) => (key === "feeding_density" ? explicitDensityConcern : true))
    .map((key) => baseSteps[key]);
  const merged = unique([...prioritized, ...fallbackOrdered]).slice(0, 6);
  if (merged.length >= minStrategyItems) {
    return merged;
  }
  const fallbackAll = Object.entries(baseSteps)
    .filter(([key]) => (key === "feeding_density" ? explicitDensityConcern : true))
    .map(([, value]) => value);
  return unique([...merged, ...fallbackAll]).slice(0, minStrategyItems);
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
  "density-feeding": [/\bdensity\b/, /\bstocking\b/, /\bcompetition\b/, /\bcrowd(ing)?\b/, /\boff food\b/, /\boutcompeted\b/],
  "system-maturity": [/\bbiofilter\b/, /\bcycling\b/, /\bnew system\b/, /\bsystem maturity\b/],
  "handling-disturbance": [/\bhandling\b/, /\bdisturbance\b/, /\btraffic\b/, /\binjection\b/, /\bclamping\b/],
};

function hasExplicitDensityConcern(messages: CaseStateMessage[]): boolean {
  const joined = normalize(messages.map((message) => message.content || "").join(" "));
  const explicitConcernPatterns = [
    /\bdensity\b/,
    /\bstocking\b/,
    /\bcompetition\b/,
    /\bcrowd(ing|ed)?\b/,
    /\boutcompeted\b/,
    /\bnot getting food\b/,
    /\buneven feeding\b/,
    /\bfeeding access\b/,
    /\boff food\b/,
  ];
  const explicitNoConcernPatterns = [
    /\bswarm(?:ing)? on food\b/,
    /\bstrong feeding response\b/,
    /\bremarkably healthy\b/,
    /\bhealthy colony\b/,
  ];
  if (explicitNoConcernPatterns.some((pattern) => pattern.test(joined)) && !explicitConcernPatterns.some((pattern) => pattern.test(joined))) {
    return false;
  }
  return explicitConcernPatterns.some((pattern) => pattern.test(joined));
}

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
  if (/(density|competition|outcompeted|uneven feeding|feeding access)/.test(normalized)) {
    return "Track feeding access and appetite by tank, and only change population structure if direct competition is observed.";
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
  const title = "Emerging Threads";
  const meaningfulPostCount = countMeaningfulPosts(messages);
  const domains = inferDomainsInPlay(messages);

  if (meaningfulPostCount < 4 || domains.length < 2) {
    return {
      ready: false,
      title,
      message:
        "More repeated case detail is needed before focal threads can be verified.",
    };
  }

  const anchors = extractCaseAnchors(messages);
  const correction = detectCorrectionSignals(messages);
  const hypothesis = analyzeHypothesisEvidence(messages, correction);
  const signalLedger = buildSignalLedger(messages);
  const all = normalize(messages.map((message) => message.content).join(" "));
  const focalMap: Record<HypothesisKey, string> = {
    "flow-disturbance": "flow/nozzle disturbance",
    "water-chemistry": "water parameters and filtration stability",
    "density-feeding": "feeding pressure and density load",
    "system-maturity": "system maturity and biofilter stability",
    "handling-disturbance": "handling and disturbance load",
    infection: "possible infectious contribution under stress",
  };

  const topLabel = focalMap[hypothesis.top.key];
  const secondLabel = hypothesis.second ? focalMap[hypothesis.second.key] : "";
  const primary = hypothesis.dominant
    ? `Likely shared system stressor: ${topLabel}.`
    : secondLabel
      ? `Likely shared stressor remains mixed: ${topLabel} and ${secondLabel}.`
      : `Likely shared stressor remains mixed: ${topLabel}.`;

  const repeatedSignals = signalLedger.observedTop
    .filter((row) => row.observedMentions >= 2)
    .map((row) => `${row.label} (${row.observedMentions} posts)`)
    .slice(0, 3);
  const supporting = repeatedSignals.length > 0
    ? repeatedSignals
    : ["Repeated case signals are still limited; continue collecting direct field observations."];

  const focalLineParts: string[] = [];
  if (/(feeding|off food|not eating|appetite)/.test(all)) {
    focalLineParts.push("feeding");
  }
  if (/(ph|conductivity|ammonia|biofilter|filtration|water chemistry)/.test(all)) {
    focalLineParts.push("water parameters/filtration");
  }
  if (/(disturbance|handling|traffic|vibration|flow|nozzle)/.test(all)) {
    focalLineParts.push("environmental disturbance load");
  }
  const secondary = focalLineParts.length > 0
    ? `Current focal points: ${joinAsList(unique(focalLineParts))}.`
    : "Current focal points are still forming from repeated posts.";

  const whyParts: string[] = [];
  if (anchors.symptoms.length > 0) {
    whyParts.push(`Repeated symptoms: ${joinAsList(anchors.symptoms)}.`);
  }
  if (anchors.environment.length > 0) {
    whyParts.push(`Repeated context: ${joinAsList(anchors.environment)}.`);
  }
  if (/(tropicalis)/.test(all) && /(died first|died|mortality|deaths)/.test(all)) {
    whyParts.push("Species pattern (tropicalis losses first) supports an environmental stress interpretation.");
  }
  if (/(vet|veterinary|veterinarian)/.test(all)) {
    whyParts.push("Veterinary comments align with these focal points.");
  }
  if (correction.hasAnyCorrection) {
    whyParts.push("Correction signals are present, so dominant-cause confidence remains intentionally limited.");
  }
  const why = whyParts.join(" ");

  return {
    ready: true,
    title,
    primaryIntervention: toFieldNoteText(sentenceCase(primary)),
    secondaryIntervention: toFieldNoteText(sentenceCase(secondary)),
    supportingActions: supporting.map((item) => toFieldNoteText(sentenceCase(item))).filter(Boolean),
    whyThisDirection: toFieldNoteText(why || buildWhyDirection(hypothesis, anchors, correction)),
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
  signalLedger: SignalLedger;
  hasSpeculation: boolean;
  outcomes: OutcomeSummary;
  domainsInPlay: string[];
  missingDetails: string[];
}): string {
  const { messages, signalLedger, hasSpeculation, outcomes, domainsInPlay, missingDetails } = params;

  const anchors = extractCaseAnchors(messages);
  const observedSignals = signalLedger.observedTop.map((row) => row.label).slice(0, 2);
  const currentPicture =
    observedSignals.length > 0
      ? `Current picture: ${joinAsList(observedSignals)}.`
      : anchors.symptoms.length > 0
        ? `Current picture: ${joinAsList(anchors.symptoms)}.`
        : "";
  const reportedContextParts: string[] = [];
  if (anchors.context.length > 0) reportedContextParts.push(joinAsList(anchors.context.slice(0, 1)));
  if (anchors.environment.length > 0) reportedContextParts.push(joinAsList(anchors.environment.slice(0, 2)));
  if (domainsInPlay.length > 0) reportedContextParts.push(domainsInPlay.slice(0, 1).join(" + "));
  const reportedContext =
    reportedContextParts.length > 0
      ? `Knowledge base: ${reportedContextParts.join("; ")}.`
      : "";
  const openPoints =
    missingDetails.length > 0
      ? `Open points: ${missingDetails.slice(0, 2).join(", ")}.`
      : "";
  const uncertaintyLine =
    signalLedger.speculativeTop.length > 0
      ? `Uncertain factors: ${signalLedger.speculativeTop.map((row) => row.label).slice(0, 1).join(", ")}.`
      : hasSpeculation
        ? "Uncertain factors: causal driver remains unconfirmed."
        : "";
  const currentPictureLower = currentPicture.toLowerCase();
  const outcomeLine = outcomes.topOutcomeSnippets.length > 0
    ? (() => {
        const snippet = clipSentence(outcomes.topOutcomeSnippets[0], 90);
        if (currentPictureLower.includes(snippet.toLowerCase().slice(0, 30))) return "";
        return `Recent outcomes: ${snippet}.`;
      })()
    : "";

  const lines = [currentPicture, reportedContext, openPoints, uncertaintyLine, outcomeLine].filter(Boolean);
  if (lines.length === 0) {
    const recentContent = messages
      .slice(-3)
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join(" | ");
    if (recentContent) {
      return toFieldNoteText(recentContent);
    }
    return "No posts yet.";
  }
  return toFieldNoteText(lines.join("\n"));
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

export function buildCaseState(messages: CaseStateMessage[], threadId: string, knowledge: CaseKnowledgeContext = { knownChecks: [], memorySignals: [] }): CaseState {
  const knownFacts = extractKnownFacts(messages);
  const intents = scoreAndSelectByIntent(messages);
  const signalLedger = buildSignalLedger(messages);
  const hasSpeculation = hasSpeculativeDiscussion(messages);
  const outcomes = detectOutcomeSummary(messages);
  const correction = detectCorrectionSignals(messages);
  const domainsInPlay = inferDomainsInPlay(messages);
  const actionsTried = extractActionsTried(messages, intents.ACTION);
  const missingDetails = mergeKnowledgeChecks(
    buildMissingDetails(knownFacts, intents.CONTEXT, messages),
    knowledge.knownChecks,
    messages
  );
  const initialObservations = buildInitialObservations(messages, knownFacts, intents.OBSERVATION, outcomes.topOutcomeSnippets);
  const situationSummary = buildSituationSummary(initialObservations, signalLedger, hasSpeculation, intents.CONTEXT, outcomes);
  const resolutionStatus = inferResolutionStatus(messages, outcomes);
  const suggestedNextSteps = buildSuggestedNextSteps(domainsInPlay, missingDetails, intents.PLAN);
  const emergingThreads = buildEmergingThreads(messages, signalLedger, knowledge, knownFacts, domainsInPlay, missingDetails);
  const currentStrategy = buildCurrentStrategy(messages, suggestedNextSteps, correction);
  const currentStatus = inferCurrentCaseStatus(outcomes, resolutionStatus, actionsTried.length > 0);
  const caseUpdate = buildConversationalCaseUpdate({
    messages,
    signalLedger,
    hasSpeculation,
    outcomes,
    domainsInPlay,
    missingDetails,
  });

  return {
    threadId,
    caseUpdate: toFieldNoteText(caseUpdate),
    emergingThreads,
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

