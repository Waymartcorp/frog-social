import fs from "node:fs";
import path from "node:path";

export interface CaseMemorySnapshot {
  threadId: string;
  admissionState?: "candidate" | "admitted" | "hidden";
  caseSummary?: string;
  currentSystemStatus?: string;
  runningObservations?: string[];
  actionsTried?: string[];
  domainsInPlay?: string[];
}

export interface CaseKnowledgeContext {
  knownChecks: string[];
  memorySignals: string[];
}

interface KnowledgePattern {
  key: string;
  label: string;
  check: string;
  regex: RegExp;
}

const KNOWLEDGE_PATTERNS: KnowledgePattern[] = [
  {
    key: "feeding",
    label: "feeding response trends",
    check: "Observed feeding response by subgroup",
    regex: /\b(feeding|off food|not eating|appetite|feeding response|competition)\b/gi,
  },
  {
    key: "skin",
    label: "skin findings and lesion pattern",
    check: "Lesion/skin finding pattern details",
    regex: /\b(lesion|redness|ulcer|skin|abrasion|wound)\b/gi,
  },
  {
    key: "flow",
    label: "flow/nozzle disturbance load",
    check: "Flow/nozzle/splash and disturbance context",
    regex: /\b(flow|nozzle|splash|surface agitation|vibration|pump|noise)\b/gi,
  },
  {
    key: "water",
    label: "water chemistry stability",
    check: "Measured pH and conductivity baseline",
    regex: /\b(ph|conductivity|tds|ec|buffer|remineral|water chemistry|ammonia|nitrite)\b/gi,
  },
  {
    key: "maturity",
    label: "system maturity and biofilter state",
    check: "System maturity / biofilter status",
    regex: /\b(biofilter|system maturity|cycling|new system|mature filter)\b/gi,
  },
  {
    key: "handling",
    label: "handling and disturbance pressure",
    check: "Recent handling/injection/disturbance history",
    regex: /\b(handling|disturbance|traffic|injection|clamping)\b/gi,
  },
];

let cachedMarkdownText = "";

function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMarkdownFiles(target));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(target);
    }
  }
  return out;
}

function readMarkdownCorpus(): string {
  if (cachedMarkdownText) return cachedMarkdownText;
  const projectRoot = path.resolve(__dirname, "..", "..");
  const docsDir = path.join(projectRoot, "docs");
  const readmePath = path.join(projectRoot, "README.md");
  const files = [...listMarkdownFiles(docsDir), ...(fs.existsSync(readmePath) ? [readmePath] : [])];
  const chunks: string[] = [];
  for (const file of files) {
    try {
      chunks.push(fs.readFileSync(file, "utf8"));
    } catch {
      // Keep runtime resilient if a docs file is unreadable.
    }
  }
  cachedMarkdownText = chunks.join("\n");
  return cachedMarkdownText;
}

function countHits(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function scorePatterns(text: string): Array<{ pattern: KnowledgePattern; score: number }> {
  return KNOWLEDGE_PATTERNS.map((pattern) => ({
    pattern,
    score: countHits(text, pattern.regex),
  })).sort((a, b) => b.score - a.score);
}

export function buildKnowledgeContextForThread(
  threadId: string,
  snapshots: CaseMemorySnapshot[]
): CaseKnowledgeContext {
  const docsText = readMarkdownCorpus();
  const docsScored = scorePatterns(docsText).filter((entry) => entry.score > 0);

  const admittedText = snapshots
    .filter((snapshot) => snapshot.admissionState === "admitted" && snapshot.threadId !== threadId)
    .map((snapshot) =>
      [
        snapshot.caseSummary || "",
        snapshot.currentSystemStatus || "",
        ...(snapshot.runningObservations || []),
        ...(snapshot.actionsTried || []),
        ...(snapshot.domainsInPlay || []),
      ]
        .join(" ")
        .trim()
    )
    .filter(Boolean)
    .join(" ");

  const memoryScored = scorePatterns(admittedText).filter((entry) => entry.score >= 2);

  const knownChecks = docsScored.slice(0, 5).map((entry) => entry.pattern.check);
  const memorySignals = memoryScored.slice(0, 3).map((entry) => entry.pattern.label);

  return { knownChecks, memorySignals };
}

