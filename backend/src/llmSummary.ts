import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

let openai: OpenAI | null = null;

function stripQuotes(value: string): string {
  let v = value.trim();
  while (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).trim();
  while (v.startsWith("'") && v.endsWith("'") && v.length >= 2) v = v.slice(1, -1).trim();
  return v;
}

function getClient(): OpenAI | null {
  if (openai) return openai;
  const raw = process.env.OPENAI_API_KEY;
  if (!raw) return null;
  const key = stripQuotes(raw);
  if (key.length < 10) return null;
  openai = new OpenAI({ apiKey: key });
  return openai;
}

export function isLLMConfigured(): boolean {
  const raw = process.env.OPENAI_API_KEY;
  if (!raw) return false;
  return stripQuotes(raw).length >= 10;
}

let cachedKnowledge = "";

function loadKnowledgeBase(): string {
  if (cachedKnowledge) return cachedKnowledge;
  const projectRoot = path.resolve(__dirname, "..", "..");
  const files = [
    path.join(projectRoot, "docs", "husbandry", "husbandry_master_key.md"),
    path.join(projectRoot, "docs", "docs", "HUSBANDRY_FRAMEWORK.md"),
  ];
  const chunks: string[] = [];
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        chunks.push(fs.readFileSync(file, "utf-8"));
      }
    } catch { /* skip unreadable files */ }
  }
  cachedKnowledge = chunks.join("\n\n---\n\n");
  return cachedKnowledge;
}

export interface LLMSummaryInput {
  threadId: string;
  messages: Array<{ userId: string; content: string; createdAt: string }>;
  existingCaseSummaries?: string[];
}

export interface LLMWorthinessBlock {
  /** How much this theme appears to recur vs other stored cases (use related-case list only; do not invent counts). */
  priorDiscussion: string;
  /** Whether this looks like a one-off lab nuance vs a pattern many facilities could hit (ground in posts; no invented census). */
  sharedProblemScale: string;
  /** Up to 2 well-known analogous domains (e.g. RAS ammonia in finfish) only if clearly relevant; else []. */
  analogousContexts: string[];
}

export interface TopicTrackLLM {
  segmentIndex: number;
  topicLabel: string;
  firstPostAt: string;
  lastPostAt: string;
  summary: string;
  context: string;
  openPoints: string;
}

export interface LLMSummaryResult {
  currentPicture: string;
  context: string;
  openPoints: string;
  emergingThreads: string[];
  recommendations: string[];
  isQuestion: boolean;
  questionTopic: string;
  caseWorthiness?: LLMWorthinessBlock;
  /** One row per pre-segmented block from the user message; never merge segments. */
  topicTracks?: TopicTrackLLM[];
}

/** More specific domains first — ties in primaryDomainForMessage */
const DOMAIN_PRIORITY = ["nitrogen", "water", "feeding", "system", "health"];

const DOMAIN_TAGS: Array<{ id: string; label: string; re: RegExp }> = [
  {
    id: "nitrogen",
    label: "biofilter-ammonia-load",
    re: /\b(biofilter|bio-?filter|bypass(?:ing)?\s+(?:the\s+)?(?:bio)?filter|filter\s+bypass|ammonia|ammonium|\bnh3\b|\bnh4\b|nitrit|nitrat|nitrif|denitrif|nitrogen\s+cycle|anammox|bioload|bio-?load|loading\s+(?:rate|calculation)|toxic\s+spike|zero-?old\s+tank|per\s+kg|\bppm\b|μmol|umol\/l)\b/i,
  },
  {
    id: "water",
    label: "water-source-chemistry",
    re: /\bro\b|reverse osmosis|city water|tap water|municipal water|chlorine|chloramin|dechlorinat|buffers?|alkalin|\bph\b|hardness|conductivity|microsiemen|\btds\b|water quality|water source/i,
  },
  {
    id: "feeding",
    label: "feeding-observation",
    re: /\b(feed|feeding|food|eat|eating|ingest|appetite|fasting|not eating|diet|pellet|bloodworm|train(?:ing)? tech|technicians?|prolonged event|toss in)\b/i,
  },
  {
    id: "system",
    label: "system-setup",
    re: /\b(new system|rack\b|vivarium|tank setup|plumb|sump|overflow|drain\s+line)\b/i,
  },
  {
    id: "health",
    label: "health-disease",
    re: /\b(lesion|bloat|red leg|fungus|mortality|sick|disease|morbidity)\b/i,
  },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function countRegexMatches(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const globalRe = new RegExp(re.source, flags);
  return (text.match(globalRe) ?? []).length;
}

/** Strongest operational bucket for a single post (ties → DOMAIN_PRIORITY). */
export function primaryDomainForMessage(content: string): string {
  let bestId = "general";
  let bestScore = 0;
  for (const d of DOMAIN_TAGS) {
    const score = countRegexMatches(d.re, content);
    if (score > bestScore) {
      bestScore = score;
      bestId = d.id;
    } else if (score === bestScore && score > 0) {
      const pri = (id: string) => {
        const i = DOMAIN_PRIORITY.indexOf(id);
        return i === -1 ? 99 : i;
      };
      if (pri(d.id) < pri(bestId)) bestId = d.id;
    }
  }
  return bestScore > 0 ? bestId : "general";
}

type SegmentDraft = {
  domainId: string;
  topicLabel: string;
  messages: Array<{ userId: string; content: string; createdAt: string }>;
};

function splitSegmentsOnWeekGap(segments: SegmentDraft[]): SegmentDraft[] {
  const out: SegmentDraft[] = [];
  for (const seg of segments) {
    if (seg.messages.length <= 1) {
      out.push(seg);
      continue;
    }
    let chunk: SegmentDraft["messages"] = [seg.messages[0]];
    for (let i = 1; i < seg.messages.length; i++) {
      const gap =
        new Date(seg.messages[i].createdAt).getTime() - new Date(seg.messages[i - 1].createdAt).getTime();
      if (gap > WEEK_MS) {
        out.push({ domainId: seg.domainId, topicLabel: seg.topicLabel, messages: [...chunk] });
        chunk = [seg.messages[i]];
      } else {
        chunk.push(seg.messages[i]);
      }
    }
    out.push({ domainId: seg.domainId, topicLabel: seg.topicLabel, messages: chunk });
  }
  return out;
}

export interface ThreadSegment {
  segmentIndex: number;
  domainId: string;
  topicLabel: string;
  messages: Array<{ userId: string; content: string; createdAt: string }>;
}

/**
 * Chronological runs by strict domain tag, then split when the same topic is quiet >7 days
 * (dated “chapters” without mixing feeding vs ammonia, etc.).
 */
export function segmentThreadByStrictTopic(
  messages: Array<{ userId: string; content: string; createdAt: string }>,
): ThreadSegment[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const merged: SegmentDraft[] = [];
  for (const m of sorted) {
    const domainId = primaryDomainForMessage(m.content);
    const topicLabel =
      domainId === "general"
        ? "general-discussion"
        : DOMAIN_TAGS.find((x) => x.id === domainId)?.label ?? domainId;
    const last = merged[merged.length - 1];
    if (last && last.domainId === domainId) {
      last.messages.push(m);
    } else {
      merged.push({ domainId, topicLabel, messages: [m] });
    }
  }
  const split = splitSegmentsOnWeekGap(merged);
  return split.map((seg, idx) => ({
    segmentIndex: idx + 1,
    domainId: seg.domainId,
    topicLabel: seg.topicLabel,
    messages: seg.messages,
  }));
}

function formatSegmentsForPrompt(segments: ThreadSegment[]): string {
  return segments
    .map((seg) => {
      const first = seg.messages[0]?.createdAt ?? "";
      const last = seg.messages[seg.messages.length - 1]?.createdAt ?? "";
      const body = seg.messages
        .map((m) => `[${m.createdAt}] [${m.userId}]: ${m.content}`)
        .join("\n\n");
      return `### Segment ${seg.segmentIndex} — topic label "${seg.topicLabel}"\nTime range (post timestamps): ${first} .. ${last}\nPosts in this segment ONLY:\n${body}`;
    })
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `You are the intelligence engine for Frog Social, a Xenopus husbandry discussion platform.

Your job: read STRICT SEGMENTS of a thread (each segment is one operational topic and time run). You have a husbandry knowledge base below.

SEGMENT RULES (critical — failure to follow these invalidates the output):
- The user message lists segments as "### Segment N — topic label …". Each segment has ONLY the posts that belong to that bucket.
- You MUST produce exactly one object in "topicTracks" for every segment, same segmentIndex (1..N), same topicLabel string as that segment header.
- Each topicTracks[].summary, .context, and .openPoints may ONLY reflect posts inside that segment.
- STRICT TOPIC ISOLATION: Do NOT mention ammonia, biofilter, water quality, or nitrogen in a feeding segment. Do NOT mention feeding, density, or training in an ammonia/biofilter segment. Each segment is a separate case file — treat them as if written by different authors about different systems.
- The JSON key is still "context", but product language is **Knowledge base**: authoritative support for assertions in that segment. Put here what is **deduced or strongly inferred** from (a) posts in that segment, (b) the husbandry knowledge base below, (c) related stored cases if listed in the user message — plus grounded LLM synthesis only when clearly supported by those sources. When a claim is framework- or case-backed, make that legible (e.g. start with "Knowledge base:" or equivalent). NOT a transcript paraphrase; do not invent facts. Do not use Knowledge base to glue unrelated segments together.
- If a segment has little substance, still return a short honest summary (e.g. "Brief note only.").

GLOBAL FIELDS (backward compatibility — these describe the LAST segment ONLY):
- "currentPicture" = copy the summary text of topicTracks[LAST].summary. Do NOT combine multiple segments.
- Top-level "context" = copy topicTracks[LAST].context. Do NOT combine multiple segments.
- Top-level "openPoints" = copy topicTracks[LAST].openPoints. Do NOT include open points from other segments.
- emergingThreads: cross-segment themes are OK here (short labels), but do not contradict segment boundaries.
- recommendations: 1-3 actionable items for the LAST segment only; may reference KB. Empty array if none.
- isQuestion / questionTopic: about the last segment if applicable.
- caseWorthiness: assess the thread as a whole for archiving signals (honest uncertainty is OK):
  - priorDiscussion: RELATED STORED CASES list only; never invent counts.
  - sharedProblemScale: from posts only.
  - analogousContexts: 0-2 strings only when clearly relevant.

STYLE:
- Summarize what people actually said. Never invent facts.
- Field-note style. No filler AI phrasing.

Respond with JSON only (no markdown fences):
{
  "currentPicture": "1-2 sentences: copy from topicTracks[LAST].summary",
  "context": "Knowledge base: copy from topicTracks[LAST].context, or empty",
  "openPoints": "copy from topicTracks[LAST].openPoints, or empty",
  "topicTracks": [
    {
      "segmentIndex": 1,
      "topicLabel": "must match segment header exactly",
      "firstPostAt": "ISO8601 from that segment",
      "lastPostAt": "ISO8601 from that segment",
      "summary": "1-3 sentences for this segment only — NO content from other segments",
      "context": "Knowledge base: this segment only (framework + grounded inference), or empty",
      "openPoints": "open points for this segment only — NO leaking from other segments, or empty"
    }
  ],
  "emergingThreads": ["theme 1", "theme 2"],
  "recommendations": ["..."],
  "isQuestion": true/false,
  "questionTopic": "",
  "caseWorthiness": {
    "priorDiscussion": "one sentence",
    "sharedProblemScale": "one sentence",
    "analogousContexts": []
  }
}`;

function normalizeTopicTracksFromLLM(
  raw: unknown,
  segments: ThreadSegment[],
): TopicTrackLLM[] | undefined {
  if (segments.length === 0) return undefined;
  const rows = Array.isArray(raw) ? raw : [];
  const byIndex = new Map<number, TopicTrackLLM>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const segmentIndex = Number(o.segmentIndex);
    if (!Number.isFinite(segmentIndex) || segmentIndex < 1) continue;
    const seg = segments[segmentIndex - 1];
    if (!seg) continue;
    const labelFromLlm = String(o.topicLabel || "").trim();
    const topicLabel = labelFromLlm || seg.topicLabel;
    const first = String(o.firstPostAt || seg.messages[0]?.createdAt || "").trim();
    const last = String(o.lastPostAt || seg.messages[seg.messages.length - 1]?.createdAt || "").trim();
    byIndex.set(segmentIndex, {
      segmentIndex,
      topicLabel,
      firstPostAt: first,
      lastPostAt: last,
      summary: String(o.summary || "").trim(),
      context: String(o.context || "").trim(),
      openPoints: String(o.openPoints || "").trim(),
    });
  }
  const ordered: TopicTrackLLM[] = [];
  for (let i = 1; i <= segments.length; i++) {
    const got = byIndex.get(i);
    if (got) ordered.push(got);
    else {
      const seg = segments[i - 1];
      ordered.push({
        segmentIndex: i,
        topicLabel: seg.topicLabel,
        firstPostAt: seg.messages[0]?.createdAt ?? "",
        lastPostAt: seg.messages[seg.messages.length - 1]?.createdAt ?? "",
        summary: "(Summary unavailable for this segment.)",
        context: "",
        openPoints: "",
      });
    }
  }
  return ordered;
}

export async function generateThreadSummary(input: LLMSummaryInput): Promise<LLMSummaryResult | null> {
  const client = getClient();
  if (!client) return null;

  const knowledge = loadKnowledgeBase();
  const segments = segmentThreadByStrictTopic(input.messages);
  const segmentBlock = formatSegmentsForPrompt(segments);
  const activeSegment = segments[segments.length - 1];
  const activeHint = activeSegment
    ? `\n\nThe chronologically latest post is in segment ${activeSegment.segmentIndex} ("${activeSegment.topicLabel}"). Top-level currentPicture/context/openPoints must describe ONLY that segment.`
    : "";

  const caseContext = input.existingCaseSummaries?.length
    ? `\n\nRelated stored cases:\n${input.existingCaseSummaries.join("\n")}`
    : "";

  const userMessage = `Thread id: ${input.threadId}\n\nSTRICT SEGMENTS (summarize separately; ${segments.length} segment(s)):\n\n${segmentBlock}${activeHint}${caseContext}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      max_tokens: 1100,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n--- HUSBANDRY KNOWLEDGE BASE ---\n${knowledge}` },
        { role: "user", content: userMessage },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as LLMSummaryResult & { caseWorthiness?: Record<string, unknown> };
    const rawCw = parsed.caseWorthiness;
    let caseWorthiness: LLMWorthinessBlock | undefined;
    if (rawCw && typeof rawCw === "object" && !Array.isArray(rawCw)) {
      const ac = (rawCw as { analogousContexts?: unknown }).analogousContexts;
      caseWorthiness = {
        priorDiscussion: String((rawCw as { priorDiscussion?: unknown }).priorDiscussion || ""),
        sharedProblemScale: String((rawCw as { sharedProblemScale?: unknown }).sharedProblemScale || ""),
        analogousContexts: Array.isArray(ac) ? ac.map(String).slice(0, 3) : [],
      };
    }
    const topicTracks = normalizeTopicTracksFromLLM(
      (parsed as { topicTracks?: unknown }).topicTracks,
      segments,
    );
    return {
      currentPicture: String(parsed.currentPicture || ""),
      context: String(parsed.context || ""),
      openPoints: String(parsed.openPoints || ""),
      emergingThreads: Array.isArray(parsed.emergingThreads) ? parsed.emergingThreads.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      isQuestion: Boolean(parsed.isQuestion),
      questionTopic: String(parsed.questionTopic || ""),
      caseWorthiness,
      topicTracks,
    };
  } catch (err) {
    console.error("[llmSummary] LLM call failed:", err);
    return null;
  }
}

export interface TopicCheckResult {
  isNewTopic: boolean;
  reason: string;
  suggestedThreadLabel: string;
}

/** Slug for thread ids — safe ASCII */
export function slugifyTopicLabel(text: string, maxLen = 44): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return base || "topic";
}

function domainsInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const d of DOMAIN_TAGS) {
    if (d.re.test(text)) found.add(d.id);
  }
  return found;
}

function sortDomainsByPriority(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ia = DOMAIN_PRIORITY.indexOf(a);
    const ib = DOMAIN_PRIORITY.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * Rule-based split when LLM is off or unavailable: recent thread and new post
 * land in clearly different operational buckets (feeding vs water chemistry, etc.).
 */
export function heuristicTopicDivergence(
  recentPosts: Array<{ content: string }>,
  newPostContent: string,
): { label: string; reason: string } | null {
  if (!recentPosts.length || !newPostContent.trim()) return null;
  const recentText = recentPosts.map((p) => p.content).join("\n");
  const recentDomains = domainsInText(recentText);
  const newDomains = domainsInText(newPostContent);
  if (newDomains.size === 0) return null;

  const novelInNew = sortDomainsByPriority([...newDomains].filter((id) => !recentDomains.has(id)));
  if (novelInNew.length === 0) return null;

  // Require recent thread to have *some* signal so we don't split cold starts oddly
  if (recentDomains.size === 0) return null;

  const firstNovel = novelInNew[0];
  const meta = DOMAIN_TAGS.find((d) => d.id === firstNovel);
  const label = meta?.label ?? firstNovel;
  return {
    label,
    reason: `Heuristic: new post introduces "${label}" not present in recent discussion`,
  };
}

export interface CaseSplitSegmentInput {
  topicLabel: string;
  excerpt: string;
}

/**
 * LLM gate: one chat thread with multiple strict topic segments should become multiple formal cases
 * (e.g. feeding vs ammonia) when segments are operationally distinct, not a single mixed case.
 */
export async function evaluateCaseSplitFromSegments(input: {
  threadId: string;
  segments: CaseSplitSegmentInput[];
}): Promise<{ shouldSplit: boolean; reason: string } | null> {
  const client = getClient();
  if (!client) return null;
  if (input.segments.length < 2) return null;

  const block = input.segments
    .map((s, i) => `Segment ${i + 1} [${s.topicLabel}]:\n${s.excerpt.slice(0, 600)}`)
    .join("\n\n---\n\n");

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You decide if a SINGLE chat thread should be tracked as MULTIPLE separate husbandry cases in case memory.

shouldSplit = true when segments are clearly different operational problems or investigation tracks (e.g. feeding observation/training vs biofilter bypass/ammonia loading vs water source chemistry). They should get separate case numbers and histories.

shouldSplit = false when segments are the same incident, direct follow-ups, or minor clarifications.

Respond with JSON only (no markdown fences):
{"shouldSplit": true/false, "reason": "one sentence"}`,
        },
        { role: "user", content: `Thread: ${input.threadId}\n\n${block}` },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      shouldSplit: Boolean(parsed.shouldSplit),
      reason: String(parsed.reason || "").trim(),
    };
  } catch (err) {
    console.error("[llmSummary] Case split evaluation failed:", err);
    return null;
  }
}

export async function checkIfNewTopic(
  newPostContent: string,
  recentPosts: Array<{ userId: string; content: string }>,
): Promise<TopicCheckResult | null> {
  const client = getClient();
  if (!client) return null;
  if (recentPosts.length === 0) return null;

  const recentBlock = recentPosts
    .slice(-5)
    .map((m) => `[${m.userId}]: ${m.content}`)
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: `You decide if a NEW post starts a different discussion thread than the RECENT posts.

Treat these as different topics when the operational focus shifts (not minor follow-ups):
- Feeding behavior, training staff on feeding, appetite, food types vs water source choice (RO vs city), dechlorination, buffers, pH/hardness/conductivity
- Biofilter bypass, ammonia / NH3-NH4, nitrite/nitrate, nitrogen cycle, bioload or loading-rate calculations vs feeding or water-source threads
- Disease/mortality vs rack layout / plumbing hardware vs filtration biology
- A new broad engineering or water-quality question vs the current thread's main question

Same topic: clarifications, answers, "also", same problem deeper detail.

When isNewTopic is true, suggestedThreadLabel MUST be a short kebab-style label (e.g. "ro-vs-city-water", "feeding-observation-training"). Never leave it empty if isNewTopic is true.

Respond with JSON only (no markdown fences):
{"isNewTopic": true/false, "reason": "brief explanation", "suggestedThreadLabel": "short label or empty if not new"}`,
        },
        {
          role: "user",
          content: `Recent discussion:\n${recentBlock}\n\nNew post:\n${newPostContent}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      isNewTopic: Boolean(parsed.isNewTopic),
      reason: String(parsed.reason || ""),
      suggestedThreadLabel: String(parsed.suggestedThreadLabel || "").trim(),
    };
  } catch (err) {
    console.error("[llmSummary] Topic check failed:", err);
    return null;
  }
}
