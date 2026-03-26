// src/frogCases.ts
import {
  buildCaseState,
  buildInterpretationAudit,
  buildKeyStrategies,
  type CaseKnowledgeContext,
  type CaseState,
  type CaseStateMessage,
  type InterpretationAudit,
  type KeyStrategiesResult,
  type TopicTrackSummary,
} from "./caseState";
import { segmentThreadByStrictTopic, slugifyTopicLabel } from "./llmSummary";
import { loadCasesFromDisk, saveCasesToDisk } from "./caseStorage";
import { loadMessagesFromDisk, saveMessagesToDisk } from "./messageStorage";
import { buildKnowledgeContextForThread } from "./knowledgeContext";

export type CaseStatus = "OPEN" | "MONITORING" | "RESOLVED";
export type CaseAdmissionState = "candidate" | "admitted" | "hidden";
export type CaseEntryMode = "social" | "direct" | "seed";

export interface ForumMessage {
  id: string;
  userId: string;
  facilityId?: string;
  threadId: string;
  content: string;
  createdAt: Date;
  role?: "expert" | "trusted" | "standard";
  correctionSignal?: boolean;
}

export interface FrogCase {
  id: string;
  caseId: string;
  caseNumber: number;
  threadId: string;
  isSeedOrTest: boolean;
  title: string;
  caseSummary: string;
  currentStrategy: string[];
  currentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  contributors: string[];
  sourceThreadId: string;
  messageIds: string[];
  tags: string[];
  status: CaseStatus;
  runningObservations: string[];
  missingDetails: string[];
  domainsInPlay: string[];
  actionsTried: string[];
  suggestedNextSteps: string[];
  followUpDueAt?: Date | null;
  lastFollowUpSentAt?: Date | null;
  followUpCount: number;
  currentSystemStatus: string;
  resolutionSummary: string;
  admissionState: CaseAdmissionState;
  emergingThreads: string[];
  entryMode: CaseEntryMode;
  /** LLM + recall-informed signals for “how case-worthy is this?” (not admission on their own). */
  worthinessPriorDiscussion?: string;
  worthinessSharedProblem?: string;
  worthinessAnalogies?: string[];
}

/** Optional signals when inferring admission (recurrence, multi-voice thread). */
export interface CaseAdmissionWorthinessSignals {
  priorAdmittedSimilarCount: number;
  distinctParticipantCount: number;
}

export interface ResolutionInput {
  caseId: string;
  userId: string;
  outcome: CaseStatus;
  freeText?: string;
}

export interface FollowUpInput {
  caseId: string;
  userId: string;
  responseText: string;
  status?: CaseStatus;
}

export interface CaseSeedInput {
  title: string;
  createdByUserId: string;
  sourceThreadId?: string;
  tags?: string[];
  initialNarrative?: string;
  messageIds?: string[];
}

export interface DirectCaseInput {
  userId: string;
  title?: string;
  narrative: string;
  threadId?: string;
}

export interface PersistenceCaseReportRow {
  caseId: string;
  threadId: string;
  title: string;
  messageCountForThread: number;
  caseMessageIdCount: number;
  hasAnyThreadMessages: boolean;
  status: CaseStatus;
  updatedAt: string;
  entryMode: CaseEntryMode;
}

export interface ThreadVerificationReport {
  threadId: string;
  caseFound: boolean;
  caseId: string | null;
  caseTitle: string | null;
  entryMode: CaseEntryMode | null;
  messageCount: number;
  caseSummaryPresent: boolean;
  strategyCount: number;
  status: string | null;
  emergingStrategyReady: boolean;
  interpretationAudit: InterpretationAudit;
}

export interface CaseRecallResult {
  caseId: string;
  caseNumber: number;
  threadId: string;
  title: string;
  summaryPreview: string;
  updatedAt: string;
  status: CaseStatus;
  entryMode: CaseEntryMode;
  matchScore: number;
  matchReasons: string[];
}

export interface ThreadSimilarCasesResult {
  threadId: string;
  query: string;
  matches: CaseRecallResult[];
  currentCases?: CaseRecallResult[];
}

export interface FeedSimilarCasesResult {
  query: string;
  generatedAt: string;
  matches: CaseRecallResult[];
}

const UNIVERSAL_FOLLOW_UP_PROMPT = "Please describe any corrective actions taken and the current status of the system.";

// In-memory active store + JSON persistence for cases.
const cases: Map<string, FrogCase> = new Map();
const threadToCaseId: Map<string, string> = new Map();
const messages: Map<string, ForumMessage> = new Map();

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function computeInitialFollowUpTime(): Date {
  const now = new Date();
  const msInDay = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + 7 * msInDay);
}

function computeNextFollowUpTime(from: Date): Date {
  const msInDay = 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + 7 * msInDay);
}

const EXCLUDED_THREAD_ID_PATTERNS: RegExp[] = [
  /^auto-long-/i,
  /^auto-trigger-/i,
  /^test$/i,
  /^msg[\w-]*$/i,
  /^smoke-test$/i,
  /^smoke[\w-]*$/i,
  /^dev[\w-]*$/i,
  /^tmp[\w-]*$/i,
];

const SYMPTOM_SIGNAL_REGEX =
  /(lesion|redness|ulcer|skin|abrasion|irritation|off food|not eating|reduced feeding|poor feeding|mortality|deaths|dying|letharg|weak|floating)/i;
const ENVIRONMENT_SIGNAL_REGEX =
  /(flow|nozzle|splash|vibration|pump|noise|disturbance|handling|injection|density|stocking|competition|water source|remineral|ph|conductivity|biofilter|system maturity|new system|cycling|maintenance)/i;

function isExcludedThreadId(threadId: string): boolean {
  const normalized = (threadId || "").trim();
  if (!normalized) return true;
  return EXCLUDED_THREAD_ID_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isMeaningfulPost(content: string): boolean {
  const text = content.trim();
  if (text.length < 35) return false;
  const words = text.split(/\s+/).filter(Boolean).length;
  return words >= 6;
}

function isSystemGeneratedMessage(message: ForumMessage): boolean {
  const user = String(message.userId || "").toLowerCase();
  const content = String(message.content || "").toLowerCase();
  const correctionSignal =
    /\b(this is not accurate|this is incorrect|over[- ]emphasized|should not be|i disagree with the summary|summary is wrong)\b/i.test(
      content
    );
  if (correctionSignal) {
    return false;
  }

  if (user.includes("system-import") || user.includes("system") || user.includes("generated")) {
    return true;
  }
  const summaryMarkers = [
    "system-import",
    "generated summary",
    "discussion summary",
    "case update:",
    "initially, this case started",
    "early discussion considered",
    "later responses suggest",
    "current thinking is shifting toward",
    "at this stage, the working strategy",
    "current status is",
    "domains in play:",
    "missing details still needed:",
  ];
  const markerHits = summaryMarkers.reduce((count, marker) => count + (content.includes(marker) ? 1 : 0), 0);
  return markerHits >= 1;
}

function listThreadMessages(threadId: string, includeGenerated = false): ForumMessage[] {
  return Array.from(messages.values())
    .filter((message) => message.threadId === threadId)
    .filter((message) => includeGenerated || !isSystemGeneratedMessage(message))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function listMessagesByIdsOrdered(ids: string[]): ForumMessage[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return ids.map((id) => messages.get(id)).filter((m): m is ForumMessage => Boolean(m));
}

/** Chat thread id without topic suffix (messages still live under the base thread id). */
function sourceChatThreadIdForCase(frogCase: FrogCase): string {
  const src = (frogCase.sourceThreadId || "").trim();
  if (src) return src.split("#")[0];
  return (frogCase.threadId || "").split("#")[0];
}

/** All case records tied to one live chat thread (legacy single + topic-split siblings). */
export function getCasesForChatThread(chatThreadId: string): FrogCase[] {
  const base = String(chatThreadId || "").trim().split("#")[0];
  if (!base) return [];
  return Array.from(cases.values())
    .filter(
      (c) =>
        String(c.sourceThreadId || "").trim() === base ||
        (String(c.threadId || "").trim() === base && !String(c.threadId).includes("#")),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function humanTitleForSegmentLabel(topicLabel: string): string {
  const map: Record<string, string> = {
    "feeding-observation": "Feeding observation & protocols",
    "biofilter-ammonia-load": "Biofilter / ammonia & water quality",
    "water-source-chemistry": "Water source & chemistry",
    "system-setup": "System setup & hardware",
    "health-disease": "Health & disease signals",
    "general-discussion": "General discussion",
  };
  return map[topicLabel] || topicLabel.replace(/-/g, " ").trim() || "Case topic";
}

function earliestMessageDate(msgs: ForumMessage[]): Date {
  if (!msgs.length) return new Date();
  return new Date(Math.min(...msgs.map((m) => m.createdAt.getTime())));
}

function shouldCreateCaseFromThread(messagesInThread: ForumMessage[], threadId: string): boolean {
  if (isExcludedThreadId(threadId)) {
    return false;
  }

  const meaningfulPosts = messagesInThread.filter((message) => isMeaningfulPost(message.content));
  /** One substantive post opens a case shell (`isMeaningfulPost` already filters very short / low-signal text). */
  return meaningfulPosts.length >= 1;
}

/**
 * Admission: `candidate` = working case memory (can start from 1 meaningful post).
 * `admitted` = shown in Case History archive — always requires ≥2 meaningful posts so the archive does not flood.
 * Additional promotion: strong **prior admitted similar cases** and/or **multiple distinct participants** (see worthiness branch).
 */
function inferAdmissionStateForCase(
  frogCase: FrogCase,
  messagesInThread: ForumMessage[],
  worthiness?: CaseAdmissionWorthinessSignals,
): CaseAdmissionState {
  const baseThread = sourceChatThreadIdForCase(frogCase);
  if (!baseThread || isExcludedThreadId(baseThread)) {
    return "hidden";
  }
  if (!String(frogCase.title || "").trim() || !String(frogCase.caseSummary || "").trim()) {
    return "hidden";
  }

  const participantMessages = messagesInThread.filter((message) => !isSystemGeneratedMessage(message));
  const meaningfulPosts = participantMessages.filter((message) => isMeaningfulPost(message.content)).length;
  const combined = participantMessages.map((message) => message.content).join(" ");
  const hasIssueSignal = SYMPTOM_SIGNAL_REGEX.test(combined);
  const hasContextSignal = ENVIRONMENT_SIGNAL_REGEX.test(combined);
  const hasCredibleSummary = String(frogCase.caseSummary || "").trim().length >= 70;
  const hasDomains = Array.isArray(frogCase.domainsInPlay) && frogCase.domainsInPlay.length >= 2;
  const hasStructuredCaseSignals =
    (Array.isArray(frogCase.runningObservations) && frogCase.runningObservations.length >= 2) ||
    (Array.isArray(frogCase.actionsTried) && frogCase.actionsTried.length >= 1) ||
    (Array.isArray(frogCase.suggestedNextSteps) && frogCase.suggestedNextSteps.length >= 2);
  const hasMeaningfulCaseHistory = Array.isArray(frogCase.messageIds) && frogCase.messageIds.length >= 4;
  const hasNonPlaceholderTitle = !isPlaceholderNarrativeTitle(frogCase.title);
  const summaryLength = String(frogCase.caseSummary || "").trim().length;

  if (meaningfulPosts >= 2 && hasNonPlaceholderTitle && summaryLength >= 20) {
    return "admitted";
  }
  /** Never admit on LLM/structure signals alone with only one substantive user post — avoids archive noise. */
  if (
    meaningfulPosts >= 2 &&
    hasCredibleSummary &&
    ((hasIssueSignal && hasContextSignal && (meaningfulPosts >= 3 || summaryLength >= 180)) ||
      (hasStructuredCaseSignals && (hasDomains || hasMeaningfulCaseHistory) && hasNonPlaceholderTitle))
  ) {
    return "admitted";
  }

  const priorSimilar = worthiness?.priorAdmittedSimilarCount ?? 0;
  const distinctParticipants = worthiness?.distinctParticipantCount ?? 0;
  if (
    meaningfulPosts >= 2 &&
    hasNonPlaceholderTitle &&
    summaryLength >= 18 &&
    (priorSimilar >= 2 || (priorSimilar >= 1 && distinctParticipants >= 2))
  ) {
    return "admitted";
  }

  if (meaningfulPosts >= 1 && summaryLength >= 20) {
    return "candidate";
  }
  return "hidden";
}

function deriveTitleFromThread(messagesInThread: ForumMessage[]): string {
  const combined = messagesInThread.map((message) => message.content).join(" ").toLowerCase();
  const hasShipmentContext = /\b(shipment|received|arrival|arrived|new frogs)\b/.test(combined);
  const hasLesions = /\b(lesion|redness|ulcer|skin|abrasion|irritation)\b/.test(combined);
  const hasFeedingDrop = /\b(reduced feeding|not eating|off food|feed response|feeding response)\b/.test(combined);
  const hasFlowSignal = /\b(nozzle|flow|splash|vibration|pump)\b/.test(combined);
  const hasMortality = /\b(mortality|deaths|dying)\b/.test(combined);

  if (hasShipmentContext && hasLesions && hasFeedingDrop) {
    return "Post-shipment lesions and reduced feeding in males";
  }
  if (hasFlowSignal && hasMortality) {
    return "Flow/nozzle disturbance and mortality pattern review";
  }
  if (hasLesions && hasFeedingDrop) {
    return "Lesions and reduced feeding under system stress";
  }

  const firstLine = messagesInThread[0]?.content.split("\n")[0].trim() ?? "";
  const title = firstLine || "Frog problem";
  return title.length > 120 ? title.slice(0, 117).trimEnd() + "..." : title;
}

function deriveInitialTags(message: ForumMessage): string[] {
  const text = message.content.toLowerCase();
  const tags: string[] = [];

  if (text.includes("slime") || text.includes("slimy")) {
    tags.push("skin:slime_coat");
  }
  if (text.includes("handling") || text.includes("grab") || text.includes("picked up")) {
    tags.push("behavior:handling_response");
  }
  if (text.includes("arrival") || text.includes("new frogs") || text.includes("shipment")) {
    tags.push("context:new_arrivals");
  }

  return tags;
}

// Placeholder: refine tags with more context later
function refineTagsForCase(frogCase: FrogCase): string[] {
  return frogCase.tags;
}

function mapRecapStatus(status: CaseState["resolutionStatus"]): CaseStatus {
  if (status === "resolved") return "RESOLVED";
  if (status === "monitoring") return "MONITORING";
  return "OPEN";
}

function inferStatusFromText(text: string, fallback: CaseStatus): CaseStatus {
  const lower = text.toLowerCase();
  if (/(resolved|fully resolved|stable now|back to normal|recovered)/.test(lower)) {
    return "RESOLVED";
  }
  if (/(improv|monitor|watch|holding|partial)/.test(lower)) {
    return "MONITORING";
  }
  return fallback;
}

function extractActionPhrases(text: string): string[] {
  const sentences = text
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const actionSignals = /(changed|adjusted|reduced|increased|added|removed|moved|cleaned|calibrated|measured|checked|reviewed|monitored|isolated|quarantined)/i;
  const actions = sentences.filter((sentence) => actionSignals.test(sentence) && isReliableActionPhrase(sentence));
  const unique = new Set<string>();
  for (const action of actions) {
    unique.add(action);
  }
  return Array.from(unique).slice(0, 8);
}

function isReliableActionPhrase(text: string): boolean {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  const blocked = [
    /^\d+(\.\d+)?[,;: ]+\s*conductivity\b/,
    /^update pass\b/,
    /^unified update test\b/,
    /^second unified update test\b/,
    /^case note update\b/,
    /^direct intake check\b/,
    /^describe update for\b/,
    /\bunify-e2e-\d+\b/,
  ];
  if (blocked.some((pattern) => pattern.test(lower))) return false;
  if (cleaned.length < 18) return false;
  return true;
}

function sanitizeStrategyLine(text: string): string {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();
  if (lower.includes("split high-density groups") || lower.includes("increase feeding access/frequency to reduce competition")) {
    return "Verify feeding access and appetite trend tank-by-tank without changing baseline population structure unless direct competition is observed.";
  }
  if (lower.includes("split density pressure")) {
    return "Track feeding access and appetite by tank, and only change population structure if direct competition is observed.";
  }
  return cleaned;
}

function mergeUnique(base: string[], incoming: string[]): string[] {
  const normalized = new Set<string>(base.map((entry) => entry.trim().toLowerCase()));
  const next = [...base];
  for (const item of incoming) {
    const key = item.trim().toLowerCase();
    if (!key || normalized.has(key)) {
      continue;
    }
    normalized.add(key);
    next.push(item);
  }
  return next;
}

function getThreadKey(frogCase: Pick<FrogCase, "threadId" | "sourceThreadId">): string {
  return (frogCase.threadId || frogCase.sourceThreadId || "").trim();
}

function isCanonicalThreadLabel(threadId: string): boolean {
  const normalized = (threadId || "").trim();
  if (!normalized) return false;
  return /^[A-Z0-9_-]{3,40}$/.test(normalized);
}

function isPlaceholderNarrativeTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (/^(msg one)$/i.test(trimmed)) return true;
  return false;
}

function selectMostRecentCase(a: FrogCase, b: FrogCase): FrogCase {
  const aUpdated = a.updatedAt.getTime();
  const bUpdated = b.updatedAt.getTime();
  if (aUpdated !== bUpdated) {
    return aUpdated > bUpdated ? a : b;
  }
  return a.createdAt.getTime() >= b.createdAt.getTime() ? a : b;
}

function findCaseIdByThreadId(threadId: string): string | null {
  const normalized = (threadId || "").trim();
  if (!normalized) return null;
  const mapped = threadToCaseId.get(normalized);
  if (mapped && cases.has(mapped)) return mapped;

  if (!normalized.includes("#")) {
    const pool = getCasesForChatThread(normalized);
    if (pool.length === 1) return pool[0].id;
    if (pool.length > 1) return null;
  }

  for (const frogCase of cases.values()) {
    if (frogCase.threadId === normalized || frogCase.sourceThreadId === normalized) {
      threadToCaseId.set(normalized, frogCase.id);
      return frogCase.id;
    }
  }

  return null;
}

/** Route a new post to the topic-scoped case (`base#topic`) when the chat thread has been split. */
function findCaseIdForMessage(message: ForumMessage): string | null {
  const base = (message.threadId || "").trim();
  if (!base) return null;
  if (base.includes("#")) {
    return findCaseIdByThreadId(base);
  }
  const allMsgs = listThreadMessages(base);
  if (allMsgs.length === 0) return null;

  const payload = allMsgs.map((m) => ({
    userId: m.userId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  const segments = segmentThreadByStrictTopic(payload);

  const targetSeg = segments.find((seg) =>
    seg.messages.some((cm) =>
      allMsgs.some(
        (am) =>
          am.id === message.id &&
          am.userId === cm.userId &&
          am.content === cm.content &&
          am.createdAt.toISOString() === cm.createdAt,
      ),
    ),
  );

  const seg = targetSeg ?? segments[segments.length - 1];
  if (!seg) return findCaseIdByThreadId(base);

  const key = `${base}#${slugifyTopicLabel(seg.topicLabel)}`;
  const byKey = findCaseIdByThreadId(key);
  if (byKey) return byKey;

  return findCaseIdByThreadId(base);
}

function enforceCaseTitleFromThread(frogCase: FrogCase): FrogCase {
  const threadKey = getThreadKey(frogCase);
  if (!threadKey) return frogCase;
  if (isCanonicalThreadLabel(threadKey) && isPlaceholderNarrativeTitle(frogCase.title)) {
    frogCase.title = threadKey;
  }
  return frogCase;
}

function shouldMarkCaseAsSeedOrTest(frogCase: FrogCase): boolean {
  if (isExcludedThreadId(sourceChatThreadIdForCase(frogCase))) {
    return true;
  }
  if (/^(msg one)$/i.test(frogCase.title.trim())) {
    return true;
  }
  return false;
}

function applyAdmissionStateToCases(casesToMark: FrogCase[]): { markedHidden: number; result: FrogCase[] } {
  let marked = 0;
  const result: FrogCase[] = casesToMark.map((frogCase) => {
    const scoped = listMessagesByIdsOrdered(frogCase.messageIds);
    const src = sourceChatThreadIdForCase(frogCase);
    const threadMessages =
      scoped.length > 0 ? scoped : listThreadMessages(frogCase.threadId || src, true);
    const admissionState = inferAdmissionStateForCase(frogCase, threadMessages);
    const hiddenByLegacyRules = shouldMarkCaseAsSeedOrTest(frogCase);
    const shouldHide = hiddenByLegacyRules || admissionState === "hidden";
    if (shouldHide && !frogCase.isSeedOrTest) {
      marked += 1;
    }
    return {
      ...frogCase,
      isSeedOrTest: shouldHide ? true : frogCase.isSeedOrTest,
      admissionState: (shouldHide ? "hidden" : admissionState) as CaseAdmissionState,
    };
  });
  return { markedHidden: marked, result };
}

function dedupeCasesByThread(casesToDedupe: FrogCase[]): FrogCase[] {
  const latestByThread = new Map<string, FrogCase>();
  const removedByThread = new Map<string, FrogCase[]>();

  for (const frogCase of casesToDedupe) {
    const threadKey = getThreadKey(frogCase) || `legacy-${frogCase.id}`;
    const existing = latestByThread.get(threadKey);
    if (!existing) {
      latestByThread.set(threadKey, frogCase);
      continue;
    }

    const kept = selectMostRecentCase(existing, frogCase);
    const removed = kept.id === existing.id ? frogCase : existing;
    latestByThread.set(threadKey, kept);
    const removedList = removedByThread.get(threadKey) ?? [];
    removedList.push(removed);
    removedByThread.set(threadKey, removedList);
  }

  if (removedByThread.size > 0) {
    for (const [threadKey, removedCases] of removedByThread.entries()) {
      console.warn(
        `[frogCases] Removed ${removedCases.length} duplicate case(s) for thread "${threadKey}": ${removedCases
          .map((entry) => entry.id)
          .join(", ")}`
      );
    }
  }

  return Array.from(latestByThread.values());
}

function countPriorAdmittedSimilarCasesForThread(threadId: string): number {
  const threadMessages = listThreadMessages(threadId);
  const recap = buildThreadRecap(threadId);
  const parts: string[] = [
    recap.caseUpdate,
    recap.situationSummary,
    ...(Array.isArray(recap.emergingThreads) ? recap.emergingThreads.slice(0, 4) : []),
    ...(Array.isArray(recap.domainsInPlay) ? recap.domainsInPlay.slice(0, 3) : []),
  ].filter((p): p is string => Boolean(p));
  const recentMessageParts = threadMessages
    .slice(-4)
    .map((entry) => String(entry.content || "").trim())
    .filter(Boolean)
    .join(" ");
  const query = `${parts.join(" ")} ${recentMessageParts}`.replace(/\s+/g, " ").trim();
  const rawMatches = recallCases(query, 24);
  const norm = String(threadId || "").trim();
  let n = 0;
  for (const m of rawMatches) {
    if (String(m.threadId || "").trim() === norm) continue;
    const row = cases.get(m.caseId);
    if (row && row.admissionState === "admitted") n += 1;
  }
  return n;
}

function countDistinctThreadParticipants(threadId: string): number {
  return new Set(
    listThreadMessages(threadId, true)
      .filter((m) => !isSystemGeneratedMessage(m))
      .map((m) => String(m.userId || "").trim())
      .filter(Boolean),
  ).size;
}

async function syncCaseLearningFromThread(frogCase: FrogCase): Promise<FrogCase> {
  const sourceThreadId = sourceChatThreadIdForCase(frogCase);
  const scoped = listMessagesByIdsOrdered(frogCase.messageIds);
  const threadMessages =
    scoped.length > 0
      ? scoped
      : listThreadMessages(frogCase.threadId || sourceThreadId, true);

  const caseStateMessages = threadMessages.map((entry) => ({
    id: entry.id,
    threadId: entry.threadId,
    content: entry.content,
    role: entry.role,
    correctionSignal: entry.correctionSignal,
  }));
  const recap = buildCaseState(caseStateMessages, sourceThreadId, buildThreadKnowledgeContext(sourceThreadId));

  frogCase.title = frogCase.title || deriveTitleFromThread(threadMessages);
  enforceCaseTitleFromThread(frogCase);

  const existingCaseSummaries = Array.from(cases.values())
    .filter((c) => c.admissionState === "admitted" && c.id !== frogCase.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 14)
    .map((c) => {
      const n = Number(c.caseNumber || 0);
      const head = n > 0 ? `Case #${n}` : "Case";
      return `${head} ${c.title}: ${(c.caseSummary || c.currentSystemStatus || "").slice(0, 220)}`.trim();
    })
    .filter((line) => line.length > 12);

  let llmResult: import("./llmSummary").LLMSummaryResult | null = null;
  try {
    const { isLLMConfigured, generateThreadSummary } = await import("./llmSummary");
    if (isLLMConfigured() && threadMessages.length > 0) {
      llmResult = await generateThreadSummary({
        threadId: sourceThreadId,
        messages: threadMessages.map((m) => ({
          userId: m.userId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        existingCaseSummaries,
      });
    }
  } catch (err) {
    console.warn("[syncCase] LLM call failed, using regex fallback:", err);
  }

  if (llmResult) {
    frogCase.caseSummary = [
      llmResult.currentPicture ? `Current picture: ${llmResult.currentPicture}` : "",
      llmResult.context ? `Knowledge base: ${llmResult.context}` : "",
      llmResult.openPoints ? `Open points: ${llmResult.openPoints}` : "",
    ].filter(Boolean).join("\n") || recap.caseUpdate;
    frogCase.currentSystemStatus = llmResult.currentPicture || recap.situationSummary;
    frogCase.emergingThreads = llmResult.emergingThreads.length > 0 ? llmResult.emergingThreads : recap.emergingThreads;
    frogCase.currentStrategy = llmResult.recommendations.length > 0 ? llmResult.recommendations : [];
    frogCase.suggestedNextSteps = llmResult.recommendations.length > 0 ? llmResult.recommendations : [];
    frogCase.missingDetails = llmResult.openPoints ? [llmResult.openPoints] : [];
    const cw = llmResult.caseWorthiness;
    if (cw) {
      frogCase.worthinessPriorDiscussion = String(cw.priorDiscussion || "").trim();
      frogCase.worthinessSharedProblem = String(cw.sharedProblemScale || "").trim();
      frogCase.worthinessAnalogies = Array.isArray(cw.analogousContexts)
        ? cw.analogousContexts.map(String).slice(0, 3)
        : [];
    }
  } else {
    const recentPosts = threadMessages
      .slice(-4)
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join(" | ");
    frogCase.caseSummary = recentPosts || recap.caseUpdate;
    frogCase.currentStrategy = [];
    frogCase.suggestedNextSteps = [];
    frogCase.missingDetails = [];
    frogCase.currentSystemStatus = recentPosts || recap.situationSummary;
    frogCase.emergingThreads = recap.emergingThreads;
    frogCase.worthinessPriorDiscussion = "";
    frogCase.worthinessSharedProblem = "";
    frogCase.worthinessAnalogies = [];
  }

  frogCase.currentStatus = recap.currentStatus;
  if (llmResult) {
    const views: string[] = [];
    if (llmResult.context) views.push(llmResult.context);
    if (llmResult.recommendations.length > 0) views.push(...llmResult.recommendations);
    frogCase.runningObservations = views.length > 0 ? views : [];
  } else {
    frogCase.runningObservations = (recap.initialObservations || []).filter(
      (entry) => !entry.trim().endsWith("?") && !/\b(any advice|any suggestion|any recommendation|do you have)\b/i.test(entry)
    );
  }
  frogCase.domainsInPlay = recap.domainsInPlay;
  frogCase.actionsTried = mergeUnique(
    (frogCase.actionsTried || []).filter((entry) => isReliableActionPhrase(entry)),
    (recap.actionsTried || []).filter((entry) => isReliableActionPhrase(entry))
  );
  frogCase.status = frogCase.status === "RESOLVED" ? "RESOLVED" : mapRecapStatus(recap.resolutionStatus);
  const worthinessSignals: CaseAdmissionWorthinessSignals = {
    priorAdmittedSimilarCount: countPriorAdmittedSimilarCasesForThread(sourceThreadId),
    distinctParticipantCount: countDistinctThreadParticipants(sourceThreadId),
  };
  const admissionState = inferAdmissionStateForCase(frogCase, threadMessages, worthinessSignals);
  frogCase.admissionState = admissionState;
  frogCase.isSeedOrTest = admissionState === "hidden";
  enforceFormalCaseArchiveFields(frogCase);
  return frogCase;
}

async function persistCases() {
  await saveCasesToDisk(Array.from(cases.values()));
}

async function persistMessages() {
  await saveMessagesToDisk(Array.from(messages.values()));
}

function registerCaseInIndices(frogCase: FrogCase) {
  cases.set(frogCase.id, frogCase);
  const tid = (frogCase.threadId || "").trim();
  if (tid) {
    threadToCaseId.set(tid, frogCase.id);
  }
  const src = (frogCase.sourceThreadId || "").trim();
  /** Only map bare chat thread id when this is the legacy 1:1 case (avoids clobbering split siblings). */
  if (src && src === tid) {
    threadToCaseId.set(src, frogCase.id);
  }
}

function nextCaseNumber(): number {
  const numbers = Array.from(cases.values())
    .map((entry) => Number(entry.caseNumber || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}

function enforceFormalCaseArchiveFields(frogCase: FrogCase): boolean {
  if (frogCase.admissionState !== "admitted") return false;
  let changed = false;
  const caseNumber = Number(frogCase.caseNumber || 0);
  if (!Number.isFinite(caseNumber) || caseNumber <= 0) {
    frogCase.caseNumber = nextCaseNumber();
    changed = true;
  }
  const createdAtMs = frogCase.createdAt instanceof Date ? frogCase.createdAt.getTime() : Number.NaN;
  if (Number.isNaN(createdAtMs)) {
    const fallbackMs = frogCase.updatedAt instanceof Date ? frogCase.updatedAt.getTime() : Date.now();
    frogCase.createdAt = new Date(fallbackMs);
    changed = true;
  }
  return changed;
}

function buildThreadKnowledgeContext(threadId: string): CaseKnowledgeContext {
  const snapshots = Array.from(cases.values()).map((entry) => ({
    threadId: entry.threadId || entry.sourceThreadId,
    admissionState: entry.admissionState,
    caseSummary: entry.caseSummary,
    currentSystemStatus: entry.currentSystemStatus,
    runningObservations: entry.runningObservations,
    actionsTried: entry.actionsTried,
    domainsInPlay: entry.domainsInPlay,
  }));
  return buildKnowledgeContextForThread(threadId, snapshots);
}

function normalizeLoadedCase(loaded: FrogCase): FrogCase {
  const normalizedStatus: CaseStatus =
    loaded.status === "RESOLVED" ? "RESOLVED" : loaded.status === "MONITORING" ? "MONITORING" : "OPEN";
  return {
    ...loaded,
    caseId: loaded.caseId || loaded.id,
    caseNumber: Number((loaded as FrogCase).caseNumber || 0),
    threadId: loaded.threadId || loaded.sourceThreadId || `legacy-thread-${loaded.id}`,
    isSeedOrTest: loaded.isSeedOrTest ?? false,
    caseSummary: loaded.caseSummary ?? loaded.currentSystemStatus ?? "",
    currentStrategy: Array.isArray(loaded.currentStrategy) ? loaded.currentStrategy.map((entry) => sanitizeStrategyLine(entry)).filter(Boolean) : [],
    currentStatus: loaded.currentStatus ?? (normalizedStatus === "RESOLVED" ? "improved" : normalizedStatus.toLowerCase()),
    sourceThreadId: loaded.sourceThreadId || `legacy-${loaded.id}`,
    contributors: Array.isArray(loaded.contributors) && loaded.contributors.length > 0 ? loaded.contributors : [loaded.createdByUserId],
    messageIds: Array.isArray(loaded.messageIds) ? loaded.messageIds : [],
    tags: Array.isArray(loaded.tags) ? loaded.tags : [],
    runningObservations: Array.isArray(loaded.runningObservations) ? loaded.runningObservations : [],
    missingDetails: Array.isArray(loaded.missingDetails) ? loaded.missingDetails : [],
    domainsInPlay: Array.isArray(loaded.domainsInPlay) ? loaded.domainsInPlay : [],
    actionsTried: Array.isArray(loaded.actionsTried) ? loaded.actionsTried.filter((entry) => isReliableActionPhrase(entry)) : [],
    suggestedNextSteps: Array.isArray(loaded.suggestedNextSteps) ? loaded.suggestedNextSteps.map((entry) => sanitizeStrategyLine(entry)).filter(Boolean) : [],
    currentSystemStatus: loaded.currentSystemStatus ?? "",
    resolutionSummary: loaded.resolutionSummary ?? "",
    status: normalizedStatus,
    admissionState: (loaded as FrogCase).admissionState ?? (loaded.isSeedOrTest ? "hidden" : "admitted"),
    emergingThreads: Array.isArray((loaded as FrogCase).emergingThreads) ? (loaded as FrogCase).emergingThreads : [],
    entryMode: (loaded as FrogCase).entryMode ?? "social",
    worthinessPriorDiscussion:
      typeof (loaded as FrogCase).worthinessPriorDiscussion === "string"
        ? (loaded as FrogCase).worthinessPriorDiscussion
        : "",
    worthinessSharedProblem:
      typeof (loaded as FrogCase).worthinessSharedProblem === "string"
        ? (loaded as FrogCase).worthinessSharedProblem
        : "",
    worthinessAnalogies: Array.isArray((loaded as FrogCase).worthinessAnalogies)
      ? (loaded as FrogCase).worthinessAnalogies!
      : [],
  };
}

function assignCaseNumbers(casesToAssign: FrogCase[]): { assigned: number; result: FrogCase[] } {
  let assigned = 0;
  const used = new Set<number>();
  for (const frogCase of casesToAssign) {
    const value = Number(frogCase.caseNumber || 0);
    if (Number.isFinite(value) && value > 0) used.add(value);
  }
  const ordered = [...casesToAssign].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let cursor = 1;
  for (const frogCase of ordered) {
    const value = Number(frogCase.caseNumber || 0);
    if (Number.isFinite(value) && value > 0) continue;
    while (used.has(cursor)) cursor += 1;
    frogCase.caseNumber = cursor;
    used.add(cursor);
    assigned += 1;
    cursor += 1;
  }
  return { assigned, result: casesToAssign };
}

async function hydrateCasesFromDisk() {
  cases.clear();
  threadToCaseId.clear();

  const persistedCases = (await loadCasesFromDisk()).map(normalizeLoadedCase);
  const dedupedCases = dedupeCasesByThread(persistedCases);
  const numbered = assignCaseNumbers(dedupedCases);
  for (const persisted of dedupedCases) {
    enforceCaseTitleFromThread(persisted);
  }
  const backfilledCases = backfillLegacyMessagesForCases(dedupedCases);
  const admitted = applyAdmissionStateToCases(dedupedCases);
  let backfilledArchiveFieldCount = 0;
  for (const persisted of admitted.result) {
    const chatBase = sourceChatThreadIdForCase(persisted);
    const hasMsgs =
      listMessagesByIdsOrdered(persisted.messageIds).length > 0 || listThreadMessages(chatBase).length > 0;
    if (hasMsgs) {
      await syncCaseLearningFromThread(persisted);
    }
    if (enforceFormalCaseArchiveFields(persisted)) {
      backfilledArchiveFieldCount += 1;
    }
    registerCaseInIndices(persisted);
  }

  if (dedupedCases.length !== persistedCases.length) {
    console.warn(
      `[frogCases] Rewriting cases.json after deduplication (${persistedCases.length} -> ${dedupedCases.length}).`
    );
  }
  if (numbered.assigned > 0) {
    console.warn(`[frogCases] Assigned stable case numbers for ${numbered.assigned} case(s).`);
  }
  if (admitted.markedHidden > 0) {
    console.warn(`[frogCases] Marked ${admitted.markedHidden} existing case(s) as hidden/test.`);
  }
  if (backfilledCases > 0) {
    console.warn(`[frogCases] Backfilled legacy message history for ${backfilledCases} case(s).`);
  }
  if (backfilledArchiveFieldCount > 0) {
    console.warn(`[frogCases] Backfilled archive-required fields for ${backfilledArchiveFieldCount} admitted case(s).`);
  }
  // Rewrite cases to disk/Redis for normalization. Do NOT rewrite messages
  // during init — that can overwrite Redis with a stale in-memory snapshot.
  await saveCasesToDisk(admitted.result);
}

async function hydrateMessagesFromDisk() {
  messages.clear();
  const persistedMessages = await loadMessagesFromDisk();
  for (const message of persistedMessages) {
    messages.set(message.id, message);
  }
}

function buildLegacyBackfillMessages(frogCase: FrogCase): ForumMessage[] {
  const threadId = getThreadKey(frogCase);
  if (!threadId) return [];
  const createdAt = frogCase.createdAt ?? new Date();
  const entries: string[] = [];
  if (frogCase.caseSummary) entries.push(frogCase.caseSummary);
  entries.push(...(frogCase.runningObservations ?? []).slice(0, 4));
  entries.push(...(frogCase.actionsTried ?? []).slice(0, 3));
  if (frogCase.resolutionSummary) entries.push(frogCase.resolutionSummary);

  const uniqueEntries = Array.from(
    new Set(
      entries
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 8);

  return uniqueEntries.map((content, index) => ({
    id: `legacy-${frogCase.caseId || frogCase.id}-${index + 1}`,
    userId: "system-import",
    threadId,
    content,
    createdAt: new Date(createdAt.getTime() + index * 1000),
  }));
}

function backfillLegacyMessagesForCases(casesToBackfill: FrogCase[]): number {
  let backfilledCases = 0;
  for (const frogCase of casesToBackfill) {
    const threadId = getThreadKey(frogCase);
    if (!threadId) continue;
    const existingThreadMessages = listThreadMessages(threadId, true);
    if (existingThreadMessages.length > 0) {
      continue;
    }
    const generated = buildLegacyBackfillMessages(frogCase);
    if (generated.length === 0) {
      continue;
    }
    for (const message of generated) {
      messages.set(message.id, message);
    }
    frogCase.messageIds = mergeUnique(frogCase.messageIds, generated.map((message) => message.id));
    frogCase.updatedAt = new Date();
    backfilledCases += 1;
    console.warn(
      `[frogCases] Backfilled ${generated.length} legacy message(s) for thread "${threadId}" (case ${frogCase.caseId || frogCase.id}).`
    );
  }
  return backfilledCases;
}

export async function createCaseFromSeed(input: CaseSeedInput): Promise<FrogCase> {
  const now = new Date();
  const caseId = generateId();
  const sourceThreadId = input.sourceThreadId ?? `seed-${generateId()}`;
  const existingCaseId = findCaseIdByThreadId(sourceThreadId);
  if (existingCaseId) {
    const existing = cases.get(existingCaseId);
    if (existing) {
      existing.updatedAt = now;
      existing.contributors = mergeUnique(existing.contributors, [input.createdByUserId]);
      existing.tags = mergeUnique(existing.tags, input.tags ?? []);
      registerCaseInIndices(existing);
      await persistCases();
      return existing;
    }
  }
  const initialNarrative = (input.initialNarrative ?? "").trim();
  const seededActions = extractActionPhrases(initialNarrative);

  const frogCase: FrogCase = {
    id: caseId,
    caseId,
    caseNumber: nextCaseNumber(),
    threadId: sourceThreadId,
    isSeedOrTest: isExcludedThreadId(sourceThreadId),
    title: input.title.trim() || "Frog case",
    caseSummary: initialNarrative,
    currentStrategy: [],
    currentStatus: "open",
    createdAt: now,
    updatedAt: now,
    createdByUserId: input.createdByUserId,
    contributors: [input.createdByUserId],
    sourceThreadId,
    messageIds: input.messageIds ?? [],
    tags: input.tags ?? [],
    status: inferStatusFromText(initialNarrative, "OPEN"),
    runningObservations: initialNarrative ? [initialNarrative] : [],
    missingDetails: [],
    domainsInPlay: [],
    actionsTried: seededActions,
    suggestedNextSteps: [],
    followUpDueAt: computeInitialFollowUpTime(),
    lastFollowUpSentAt: null,
    followUpCount: 0,
    currentSystemStatus: initialNarrative,
    resolutionSummary: "",
    admissionState: "candidate",
    emergingThreads: [],
    entryMode: "seed",
  };
  enforceCaseTitleFromThread(frogCase);
  frogCase.admissionState = inferAdmissionStateForCase(frogCase, listThreadMessages(sourceThreadId, true));
  frogCase.isSeedOrTest = frogCase.admissionState === "hidden";
  enforceFormalCaseArchiveFields(frogCase);

  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

export async function createCaseFromDirectIntake(input: DirectCaseInput): Promise<FrogCase> {
  await rehydrateFromRedis();
  const now = new Date();
  const narrative = String(input.narrative || "").trim();
  if (!narrative) {
    throw new Error("Direct intake narrative is required");
  }

  const requestedThreadId = String(input.threadId || "").trim();
  const normalizedTitle = String(input.title || "").trim();
  const canonicalThreadLabel = /^[A-Z0-9_-]{3,40}$/.test(normalizedTitle) ? normalizedTitle : "";
  let matchedThreadId = requestedThreadId || canonicalThreadLabel;
  if (!matchedThreadId && normalizedTitle) {
    const exactThreadCaseId = findCaseIdByThreadId(normalizedTitle);
    if (exactThreadCaseId) {
      const existing = cases.get(exactThreadCaseId);
      matchedThreadId = existing?.threadId || normalizedTitle;
    } else {
      const titleLower = normalizedTitle.toLowerCase();
      const matched = Array.from(cases.values()).find((entry) => {
        const threadKey = (entry.threadId || entry.sourceThreadId || "").toLowerCase();
        const caseTitle = String(entry.title || "").toLowerCase();
        return threadKey === titleLower || caseTitle === titleLower;
      });
      if (matched) {
        matchedThreadId = matched.threadId || matched.sourceThreadId;
      }
    }
  }
  const threadId = matchedThreadId || `intake-${generateId()}`;
  const intakeMessage: ForumMessage = {
    id: `intake-${generateId()}`,
    userId: input.userId || "direct-intake-user",
    threadId,
    content: narrative,
    createdAt: now,
  };

  messages.set(intakeMessage.id, intakeMessage);
  await persistMessages();

  const threadMessages = listThreadMessages(threadId);
  const recap = buildCaseState(
    threadMessages.map((entry) => ({
      id: entry.id,
      threadId: entry.threadId,
      content: entry.content,
      role: entry.role,
      correctionSignal: entry.correctionSignal,
    })),
    threadId,
    buildThreadKnowledgeContext(threadId)
  );

  const existingCaseId = findCaseIdByThreadId(threadId);
  if (existingCaseId) {
    const existing = cases.get(existingCaseId);
    if (!existing) {
      throw new Error("Case index inconsistency for direct intake");
    }
    existing.messageIds = mergeUnique(existing.messageIds, [intakeMessage.id]);
    existing.contributors = mergeUnique(existing.contributors, [input.userId]);
    existing.updatedAt = now;
    await syncCaseLearningFromThread(existing);
    registerCaseInIndices(existing);
    await persistCases();
    return existing;
  }

  const caseId = generateId();
  const frogCase: FrogCase = {
    id: caseId,
    caseId,
    caseNumber: nextCaseNumber(),
    threadId,
    isSeedOrTest: false,
    title: String(input.title || "").trim() || deriveTitleFromThread(threadMessages),
    caseSummary: recap.caseUpdate,
    currentStrategy: recap.currentStrategy,
    currentStatus: recap.currentStatus,
    createdAt: now,
    updatedAt: now,
    createdByUserId: input.userId || "direct-intake-user",
    contributors: [input.userId || "direct-intake-user"],
    sourceThreadId: threadId,
    messageIds: threadMessages.map((entry) => entry.id),
    tags: deriveInitialTags(intakeMessage),
    status: mapRecapStatus(recap.resolutionStatus),
    runningObservations: recap.initialObservations,
    missingDetails: recap.missingDetails,
    domainsInPlay: recap.domainsInPlay,
    actionsTried: recap.actionsTried,
    suggestedNextSteps: recap.suggestedNextSteps,
    followUpDueAt: computeInitialFollowUpTime(),
    lastFollowUpSentAt: null,
    followUpCount: 0,
    currentSystemStatus: recap.situationSummary,
    resolutionSummary: "",
    admissionState: "candidate",
    emergingThreads: recap.emergingThreads,
    entryMode: "direct",
  };

  enforceCaseTitleFromThread(frogCase);
  frogCase.admissionState = inferAdmissionStateForCase(frogCase, threadMessages);
  frogCase.isSeedOrTest = frogCase.admissionState === "hidden";
  enforceFormalCaseArchiveFields(frogCase);
  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

/**
 * Maturity scoring for a single topic segment.
 * A segment is mature enough for case promotion when it has:
 * - specific domain coherence (not "general")
 * - sufficient post depth (even 1 substantive post, given other signals)
 * - support from knowledge base / MD guidelines
 * - related prior admitted cases
 */
function evaluateSegmentMaturity(
  segment: { domainId: string; topicLabel: string; messages: Array<{ userId: string; content: string; createdAt: string }> },
  chatThreadId: string,
): { mature: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const isSpecificDomain = segment.domainId !== "general";
  if (isSpecificDomain) {
    score += 2;
    reasons.push(`specific domain: ${segment.domainId}`);
  }

  const meaningfulPosts = segment.messages.filter((m) => {
    const text = m.content.trim();
    return text.length >= 35 && text.split(/\s+/).filter(Boolean).length >= 6;
  });
  if (meaningfulPosts.length >= 3) {
    score += 3;
    reasons.push(`${meaningfulPosts.length} meaningful posts`);
  } else if (meaningfulPosts.length >= 2) {
    score += 2;
    reasons.push(`${meaningfulPosts.length} meaningful posts`);
  } else if (meaningfulPosts.length >= 1) {
    score += 1;
    reasons.push("1 meaningful post");
  }

  const distinctUsers = new Set(segment.messages.map((m) => m.userId));
  if (distinctUsers.size >= 2) {
    score += 1;
    reasons.push(`${distinctUsers.size} participants`);
  }

  const kbContext = buildThreadKnowledgeContext(chatThreadId);
  const kbText = (kbContext.knownChecks || []).join(" ") + " " + (kbContext.memorySignals || []).join(" ");
  const segText = segment.messages.map((m) => m.content).join(" ").toLowerCase();
  const domainTerms: Record<string, string[]> = {
    nitrogen: ["ammonia", "biofilter", "nitrite", "nitrate", "nitrogen", "bypass"],
    water: ["ro", "reverse osmosis", "ph", "conductivity", "chlorine", "water source"],
    feeding: ["feeding", "appetite", "food", "eat", "density", "training"],
    system: ["rack", "plumbing", "sump", "tank setup"],
    health: ["lesion", "mortality", "disease", "fungus"],
  };
  const terms = domainTerms[segment.domainId] || [];
  const kbLower = kbText.toLowerCase();
  const kbHits = terms.filter((t) => kbLower.includes(t)).length;
  if (kbHits >= 2) {
    score += 2;
    reasons.push("strong KB/guideline support");
  } else if (kbHits >= 1) {
    score += 1;
    reasons.push("some KB/guideline support");
  }
  if ((kbContext.memorySignals || []).length >= 2) {
    score += 1;
    reasons.push("prior cases cover related domains");
  }

  const segQuery = segText.slice(0, 300);
  if (segQuery.length >= 30) {
    const pool = Array.from(cases.values()).filter((c) => c.admissionState === "admitted");
    const segLower = segQuery.toLowerCase();
    const related = pool.filter((c) => {
      const hay = `${c.title} ${c.caseSummary} ${c.domainsInPlay.join(" ")}`.toLowerCase();
      return terms.some((t) => hay.includes(t) && segLower.includes(t));
    });
    if (related.length >= 3) {
      score += 2;
      reasons.push(`${related.length} related prior cases`);
    } else if (related.length >= 1) {
      score += 1;
      reasons.push(`${related.length} related prior case(s)`);
    }
  }

  const MATURITY_THRESHOLD = 4;
  return {
    mature: score >= MATURITY_THRESHOLD,
    score,
    reasons,
  };
}

const CASE_FOLLOWUP_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

function findOpenCaseForSegment(
  chatThreadId: string,
  topicSlug: string,
): FrogCase | null {
  const base = String(chatThreadId || "").trim().split("#")[0];
  const targetThreadId = `${base}#${topicSlug}`;
  for (const c of cases.values()) {
    if (String(c.threadId || "").trim() === targetThreadId) {
      const age = Date.now() - c.createdAt.getTime();
      if (age <= CASE_FOLLOWUP_WINDOW_MS && c.status !== "RESOLVED") {
        return c;
      }
    }
  }
  for (const c of cases.values()) {
    if (
      String(c.sourceThreadId || "").trim() === base &&
      String(c.threadId || "").includes(topicSlug)
    ) {
      const age = Date.now() - c.createdAt.getTime();
      if (age <= CASE_FOLLOWUP_WINDOW_MS && c.status !== "RESOLVED") {
        return c;
      }
    }
  }
  return null;
}

/**
 * Evaluate all topic segments in a chat thread and promote mature ones to formal cases.
 * This runs on every message and during hydration. It does NOT require an existing legacy case.
 * Cases created within the follow-up window (10 days) receive new messages rather than spawning duplicates.
 */
export async function promoteEmergingThreadsToCases(chatThreadId: string): Promise<FrogCase[]> {
  const base = String(chatThreadId || "").trim().split("#")[0];
  if (!base || base.startsWith("topic-") || isExcludedThreadId(base)) {
    return getCasesForChatThread(base);
  }

  const allMsgs = listThreadMessages(base);
  if (allMsgs.length === 0) return [];

  const payload = allMsgs.map((m) => ({
    userId: m.userId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  const segments = segmentThreadByStrictTopic(payload);
  if (segments.length === 0) return getCasesForChatThread(base);

  const now = new Date();
  let created = 0;

  for (const seg of segments) {
    const topicSlug = slugifyTopicLabel(seg.topicLabel);
    const candidateThreadId = `${base}#${topicSlug}`;

    const existingCase = findOpenCaseForSegment(base, topicSlug);
    if (existingCase) {
      const segMsgIds = seg.messages
        .map((cm) =>
          allMsgs.find(
            (am) => am.userId === cm.userId && am.content === cm.content && am.createdAt.toISOString() === cm.createdAt,
          ),
        )
        .filter((m): m is ForumMessage => Boolean(m))
        .map((m) => m.id);
      const newIds = segMsgIds.filter((id) => !existingCase.messageIds.includes(id));
      if (newIds.length > 0) {
        existingCase.messageIds.push(...newIds);
        existingCase.updatedAt = now;
        registerCaseInIndices(existingCase);
      }
      continue;
    }

    const alreadyHasCase = Array.from(cases.values()).some(
      (c) => String(c.threadId || "").trim() === candidateThreadId,
    );
    if (alreadyHasCase) continue;

    const maturity = evaluateSegmentMaturity(seg, base);
    if (!maturity.mature) {
      continue;
    }

    const forumMessages = seg.messages
      .map((cm) =>
        allMsgs.find(
          (am) => am.userId === cm.userId && am.content === cm.content && am.createdAt.toISOString() === cm.createdAt,
        ),
      )
      .filter((m): m is ForumMessage => Boolean(m));
    if (forumMessages.length === 0) continue;

    const recap = buildCaseState(
      forumMessages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        content: m.content,
        role: m.role,
        correctionSignal: m.correctionSignal,
      })),
      base,
      buildThreadKnowledgeContext(base),
    );

    const caseId = generateId();
    const num = nextCaseNumber();
    const newCase: FrogCase = {
      id: caseId,
      caseId,
      caseNumber: num,
      threadId: candidateThreadId,
      isSeedOrTest: false,
      title: humanTitleForSegmentLabel(seg.topicLabel),
      caseSummary: recap.caseUpdate,
      currentStrategy: recap.currentStrategy,
      currentStatus: recap.currentStatus,
      createdAt: earliestMessageDate(forumMessages),
      updatedAt: now,
      createdByUserId: forumMessages[0]?.userId || "system",
      contributors: mergeUnique([], forumMessages.map((m) => m.userId)),
      sourceThreadId: base,
      messageIds: forumMessages.map((m) => m.id),
      tags: [],
      runningObservations: recap.initialObservations,
      missingDetails: recap.missingDetails,
      domainsInPlay: recap.domainsInPlay,
      actionsTried: recap.actionsTried,
      suggestedNextSteps: recap.suggestedNextSteps,
      followUpDueAt: computeInitialFollowUpTime(),
      lastFollowUpSentAt: null,
      followUpCount: 0,
      currentSystemStatus: recap.situationSummary,
      resolutionSummary: "",
      status: mapRecapStatus(recap.resolutionStatus),
      admissionState: "candidate",
      emergingThreads: recap.emergingThreads,
      entryMode: "social",
    };
    enforceCaseTitleFromThread(newCase);
    const threadMessages = forumMessages;
    newCase.admissionState = inferAdmissionStateForCase(newCase, threadMessages);
    newCase.isSeedOrTest = newCase.admissionState === "hidden";
    enforceFormalCaseArchiveFields(newCase);
    cases.set(caseId, newCase);
    registerCaseInIndices(newCase);
    console.log(`[promoteEmergingThreads] Promoted segment "${seg.topicLabel}" to Case #${num} (score=${maturity.score}, reasons: ${maturity.reasons.join(", ")})`);
    created++;
  }

  if (created > 0) {
    await persistCases();
  }
  return getCasesForChatThread(base);
}

/**
 * When strict topic segmentation yields 2+ operational tracks in one chat thread, split one legacy case
 * into multiple `FrogCase` rows (same `FrogCase` shape): `threadId = "{base}#{topicSlug}"`, `sourceThreadId = base`.
 * Uses LLM `evaluateCaseSplitFromSegments` when configured; otherwise segments alone gate the split.
 */
export async function ensureTopicSplitCasesForThread(chatThreadId: string): Promise<FrogCase[]> {
  const base = String(chatThreadId || "").trim().split("#")[0];
  if (!base || base.startsWith("topic-") || isExcludedThreadId(base)) {
    return getCasesForChatThread(base);
  }

  const splitSiblings = Array.from(cases.values()).filter(
    (c) =>
      String(c.sourceThreadId || "").trim() === base &&
      String(c.threadId || "").includes("#") &&
      String(c.threadId || "").startsWith(`${base}#`),
  );
  if (splitSiblings.length >= 2) {
    return getCasesForChatThread(base);
  }

  const legacy = Array.from(cases.values()).find(
    (c) => String(c.threadId || "").trim() === base && String(c.sourceThreadId || "").trim() === base,
  );
  if (!legacy) {
    return getCasesForChatThread(base);
  }

  const allMsgs = listThreadMessages(base);
  if (allMsgs.length < 2) {
    return [legacy];
  }

  const payload = allMsgs.map((m) => ({
    userId: m.userId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  const segs = segmentThreadByStrictTopic(payload);
  if (segs.length < 2) {
    return [legacy];
  }

  let allowSplit = true;
  try {
    const { isLLMConfigured, evaluateCaseSplitFromSegments } = await import("./llmSummary");
    if (isLLMConfigured()) {
      const ev = await evaluateCaseSplitFromSegments({
        threadId: base,
        segments: segs.map((s) => ({
          topicLabel: s.topicLabel,
          excerpt: s.messages.map((x) => x.content).join(" | "),
        })),
      });
      if (ev && ev.shouldSplit === false) {
        allowSplit = false;
      }
    }
  } catch {
    /* heuristic-only */
  }
  if (!allowSplit) {
    return [legacy];
  }

  type Resolved = { seg: (typeof segs)[0]; forumMessages: ForumMessage[] };
  const resolved: Resolved[] = segs.map((seg) => ({
    seg,
    forumMessages: seg.messages
      .map((cm) =>
        allMsgs.find(
          (am) =>
            am.userId === cm.userId &&
            am.content === cm.content &&
            am.createdAt.toISOString() === cm.createdAt,
        ),
      )
      .filter((m): m is ForumMessage => Boolean(m)),
  }));

  if (resolved.some((r) => r.forumMessages.length === 0)) {
    return [legacy];
  }

  const now = new Date();
  const first = resolved[0];
  legacy.messageIds = first.forumMessages.map((m) => m.id);
  legacy.threadId = `${base}#${slugifyTopicLabel(first.seg.topicLabel)}`;
  legacy.sourceThreadId = base;
  legacy.title = humanTitleForSegmentLabel(first.seg.topicLabel);
  legacy.createdAt = earliestMessageDate(first.forumMessages);
  legacy.updatedAt = now;
  threadToCaseId.delete(base);
  registerCaseInIndices(legacy);
  await syncCaseLearningFromThread(legacy);

  for (let i = 1; i < resolved.length; i++) {
    const { seg, forumMessages } = resolved[i];
    const caseId = generateId();
    const recap = buildCaseState(
      forumMessages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        content: m.content,
        role: m.role,
        correctionSignal: m.correctionSignal,
      })),
      base,
      buildThreadKnowledgeContext(base),
    );
    const num = nextCaseNumber();
    const sibling: FrogCase = {
      id: caseId,
      caseId,
      caseNumber: num,
      threadId: `${base}#${slugifyTopicLabel(seg.topicLabel)}`,
      isSeedOrTest: false,
      title: humanTitleForSegmentLabel(seg.topicLabel),
      caseSummary: recap.caseUpdate,
      currentStrategy: recap.currentStrategy,
      currentStatus: recap.currentStatus,
      createdAt: earliestMessageDate(forumMessages),
      updatedAt: now,
      createdByUserId: forumMessages[0]?.userId || legacy.createdByUserId,
      contributors: mergeUnique(
        [],
        forumMessages.map((m) => m.userId),
      ),
      sourceThreadId: base,
      messageIds: forumMessages.map((m) => m.id),
      tags: legacy.tags.length ? [...legacy.tags] : [],
      runningObservations: recap.initialObservations,
      missingDetails: recap.missingDetails,
      domainsInPlay: recap.domainsInPlay,
      actionsTried: recap.actionsTried,
      suggestedNextSteps: recap.suggestedNextSteps,
      followUpDueAt: computeInitialFollowUpTime(),
      lastFollowUpSentAt: null,
      followUpCount: 0,
      currentSystemStatus: recap.situationSummary,
      resolutionSummary: "",
      status: mapRecapStatus(recap.resolutionStatus),
      admissionState: "candidate",
      emergingThreads: recap.emergingThreads,
      entryMode: "social",
    };
    enforceCaseTitleFromThread(sibling);
    cases.set(caseId, sibling);
    registerCaseInIndices(sibling);
    await syncCaseLearningFromThread(sibling);
  }

  await persistCases();
  return getCasesForChatThread(base);
}

async function refreshCaseAfterSplit(
  surfaceBase: string,
  message: ForumMessage,
  fallback: FrogCase | null,
): Promise<FrogCase | null> {
  if (!surfaceBase || surfaceBase.startsWith("topic-")) {
    return fallback;
  }
  try {
    await ensureTopicSplitCasesForThread(surfaceBase);
    await promoteEmergingThreadsToCases(surfaceBase);
  } catch (err) {
    console.warn("[handleNewMessage] ensureTopicSplitCasesForThread failed:", err);
  }
  const raw = (message.threadId || "").trim();
  if (raw.startsWith("topic-") || raw.includes("#")) {
    const id = findCaseIdByThreadId(raw);
    return id ? cases.get(id) ?? fallback : fallback;
  }
  const id = findCaseIdForMessage(message);
  return id ? cases.get(id) ?? fallback : fallback;
}

// 1) Handle new message (create case or attach to existing)
export async function handleNewMessage(message: ForumMessage): Promise<FrogCase | null> {
  await rehydrateFromRedis();
  const surfaceThreadBeforeTopicRedirect = (message.threadId || "").trim().split("#")[0];

  const existingThreadMessages = listThreadMessages(message.threadId);
  const recentForTopic = existingThreadMessages.slice(-5).map((m) => ({ userId: m.userId, content: m.content }));

  // Split threads when the post is clearly a new case topic (second post onward).
  if (existingThreadMessages.length >= 1) {
    const {
      isLLMConfigured,
      checkIfNewTopic,
      heuristicTopicDivergence,
      slugifyTopicLabel,
    } = await import("./llmSummary");

    let splitLabel: string | null = null;
    let splitReason = "";

    if (isLLMConfigured()) {
      try {
        const topicCheck = await checkIfNewTopic(message.content, recentForTopic);
        if (topicCheck?.isNewTopic) {
          splitReason = topicCheck.reason || "LLM: new topic";
          splitLabel =
            topicCheck.suggestedThreadLabel ||
            slugifyTopicLabel(message.content.slice(0, 120));
        }
      } catch (err) {
        console.warn("[handleNewMessage] LLM topic check failed:", err);
      }
    }

    if (!splitLabel) {
      try {
        const heuristic = heuristicTopicDivergence(
          existingThreadMessages.slice(-5).map((m) => ({ content: m.content })),
          message.content,
        );
        if (heuristic) {
          splitLabel = heuristic.label;
          splitReason = heuristic.reason;
        }
      } catch (err) {
        console.warn("[handleNewMessage] Heuristic topic check failed:", err);
      }
    }

    if (splitLabel) {
      const slug = slugifyTopicLabel(splitLabel);
      const newThreadId = `topic-${slug}-${Date.now().toString(36)}`;
      console.log(`[handleNewMessage] New topic — ${splitReason}. Redirecting to thread ${newThreadId}`);
      message.threadId = newThreadId;
    }
  }

  messages.set(message.id, message);
  await persistMessages();

  // Check if a case within the follow-up window matches this message's topic
  const surfaceBase = (message.threadId || "").trim().split("#")[0];
  if (surfaceBase && !surfaceBase.startsWith("topic-") && !isExcludedThreadId(surfaceBase)) {
    const allThreadMsgs = listThreadMessages(surfaceBase);
    const forSeg = allThreadMsgs.map((m) => ({
      userId: m.userId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
    const segs = segmentThreadByStrictTopic(forSeg);
    const thisMsgSeg = segs.find((seg) =>
      seg.messages.some((cm) =>
        cm.userId === message.userId && cm.content === message.content,
      ),
    );
    if (thisMsgSeg) {
      const topicSlug = slugifyTopicLabel(thisMsgSeg.topicLabel);
      const openCase = findOpenCaseForSegment(surfaceBase, topicSlug);
      if (openCase && !openCase.messageIds.includes(message.id)) {
        openCase.messageIds.push(message.id);
        openCase.contributors = mergeUnique(openCase.contributors, [message.userId]);
        openCase.updatedAt = new Date();
        await syncCaseLearningFromThread(openCase);
        registerCaseInIndices(openCase);
        await persistCases();
        return openCase;
      }
    }
  }

  const rawTid = (message.threadId || "").trim();
  const existingCaseId =
    rawTid.startsWith("topic-") || rawTid.includes("#")
      ? findCaseIdByThreadId(rawTid)
      : findCaseIdForMessage(message);
  if (existingCaseId) {
    // Existing thread → update existing case
    const frogCase = cases.get(existingCaseId);
    if (!frogCase) return null;

    frogCase.messageIds.push(message.id);
    frogCase.tags = refineTagsForCase(frogCase);
    frogCase.contributors = mergeUnique(frogCase.contributors, [message.userId]);
    frogCase.updatedAt = new Date();
    await syncCaseLearningFromThread(frogCase);
    registerCaseInIndices(frogCase);
    await persistCases();
    return refreshCaseAfterSplit(surfaceThreadBeforeTopicRedirect, message, frogCase);
  }

  const threadMessages = listThreadMessages(message.threadId);
  if (!shouldCreateCaseFromThread(threadMessages, message.threadId)) {
    return null;
  }

  const existingAfterThresholdCheck =
    rawTid.startsWith("topic-") || rawTid.includes("#")
      ? findCaseIdByThreadId(rawTid)
      : findCaseIdForMessage(message);
  if (existingAfterThresholdCheck) {
    const existing = cases.get(existingAfterThresholdCheck);
    if (!existing) return null;
    existing.messageIds.push(message.id);
    existing.contributors = mergeUnique(existing.contributors, [message.userId]);
    existing.updatedAt = new Date();
    await syncCaseLearningFromThread(existing);
    registerCaseInIndices(existing);
    await persistCases();
    return refreshCaseAfterSplit(surfaceThreadBeforeTopicRedirect, message, existing);
  }

  // Try segment-based case creation first (correct path: cases come from topic segments, not whole chat blob)
  const baseForPromotion = (message.threadId || "").trim().split("#")[0];
  if (baseForPromotion && !baseForPromotion.startsWith("topic-") && !isExcludedThreadId(baseForPromotion)) {
    const promoted = await promoteEmergingThreadsToCases(baseForPromotion);
    if (promoted.length > 0) {
      const segsForRouting = segmentThreadByStrictTopic(
        threadMessages.map((m) => ({ userId: m.userId, content: m.content, createdAt: m.createdAt.toISOString() })),
      );
      const msgSeg = segsForRouting.find((seg) =>
        seg.messages.some((cm) => cm.userId === message.userId && cm.content === message.content),
      );
      if (msgSeg) {
        const slug = slugifyTopicLabel(msgSeg.topicLabel);
        const routed = findOpenCaseForSegment(baseForPromotion, slug);
        if (routed) {
          if (!routed.messageIds.includes(message.id)) {
            routed.messageIds.push(message.id);
            routed.contributors = mergeUnique(routed.contributors, [message.userId]);
            routed.updatedAt = new Date();
            registerCaseInIndices(routed);
            await persistCases();
          }
          return routed;
        }
      }
      return promoted[promoted.length - 1];
    }
  }

  // Fallback: single-topic thread or segment promotion didn't create anything
  const now = new Date();
  const caseId = generateId();
  const recap = buildCaseState(
    threadMessages.map((threadMessage) => ({
      id: threadMessage.id,
      threadId: threadMessage.threadId,
      content: threadMessage.content,
    })),
    message.threadId,
    buildThreadKnowledgeContext(message.threadId)
  );
  const frogCase: FrogCase = {
    id: caseId,
    caseId,
    caseNumber: nextCaseNumber(),
    threadId: message.threadId,
    isSeedOrTest: false,
    title: deriveTitleFromThread(threadMessages),
    caseSummary: recap.caseUpdate,
    currentStrategy: recap.currentStrategy,
    currentStatus: recap.currentStatus,
    createdAt: now,
    updatedAt: now,
    createdByUserId: message.userId,
    contributors: [message.userId],
    sourceThreadId: message.threadId,
    messageIds: threadMessages.map((entry) => entry.id),
    tags: deriveInitialTags(message),
    runningObservations: recap.initialObservations,
    missingDetails: recap.missingDetails,
    domainsInPlay: recap.domainsInPlay,
    actionsTried: recap.actionsTried,
    suggestedNextSteps: recap.suggestedNextSteps,
    followUpDueAt: computeInitialFollowUpTime(),
    lastFollowUpSentAt: null,
    followUpCount: 0,
    currentSystemStatus: recap.situationSummary,
    resolutionSummary: "",
    status: mapRecapStatus(recap.resolutionStatus),
    admissionState: "candidate",
    emergingThreads: recap.emergingThreads,
    entryMode: "social",
  };
  enforceCaseTitleFromThread(frogCase);
  frogCase.admissionState = inferAdmissionStateForCase(frogCase, threadMessages);
  frogCase.isSeedOrTest = frogCase.admissionState === "hidden";
  enforceFormalCaseArchiveFields(frogCase);

  registerCaseInIndices(frogCase);
  await persistCases();
  return refreshCaseAfterSplit(surfaceThreadBeforeTopicRedirect, message, frogCase);
}

export function getMessageById(id: string): ForumMessage | null {
  return messages.get(id) ?? null;
}

export function listMessagesByThreadId(threadId: string): ForumMessage[] {
  return listThreadMessages(threadId);
}

export function listAllMessages(limit = 200): ForumMessage[] {
  const normalizedLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200)));
  const all = Array.from(messages.values())
    .filter((message) => !isSystemGeneratedMessage(message))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return all.slice(-normalizedLimit);
}

export function listMessagesByCaseId(caseId: string): ForumMessage[] {
  const frogCase = cases.get(caseId);
  if (!frogCase) return [];

  return frogCase.messageIds
    .map((messageId) => messages.get(messageId))
    .filter((message): message is ForumMessage => Boolean(message));
}

/** Split heuristic recap `caseUpdate` into sections (supports legacy prefixes). */
function parseCaseUpdateSections(caseUpdate: string): {
  current: string;
  knowledgeBase: string;
  open: string;
} {
  const text = String(caseUpdate || "");
  const currentMatch = text.match(
    /Current picture:\s*([\s\S]*?)(?=(?:\n|^)\s*(?:GENERAL KNOWLEDGE|Knowledge base|Reported context|Open points):|$)/im,
  );
  const kbMatch = text.match(
    /(?:GENERAL KNOWLEDGE|Knowledge base|Reported context):\s*([\s\S]*?)(?=(?:\n|^)\s*Open points:|$)/im,
  );
  const openMatch = text.match(/Open points:\s*([\s\S]*?)$/im);
  return {
    current: currentMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "",
    knowledgeBase: kbMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "",
    open: openMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "",
  };
}

/**
 * When strict topic segmentation yields 2+ segments, build one live summary card per segment
 * (regex/heuristic engine). Used for fast recap and LLM fallback so mixed threads never show
 * as a single merged CURRENT/CONTEXT/OPEN slab.
 */
export function buildHeuristicTopicTracksForThread(threadId: string): TopicTrackSummary[] {
  const threadMessages = listThreadMessages(threadId);
  if (threadMessages.length === 0) return [];

  const forSeg = threadMessages.map((m) => ({
    userId: m.userId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  const segments = segmentThreadByStrictTopic(forSeg);
  if (segments.length <= 1) return [];

  const kc = buildThreadKnowledgeContext(threadId);
  const activeIdx = segments.length;

  return segments.map((seg) => {
    const caseMsgs: CaseStateMessage[] = seg.messages.map((m, i) => {
      const full = threadMessages.find(
        (tm) =>
          tm.userId === m.userId &&
          tm.content === m.content &&
          tm.createdAt.toISOString() === m.createdAt,
      );
      return {
        id: full?.id ?? `heuristic-${threadId}-${seg.segmentIndex}-${i}`,
        threadId,
        content: m.content,
        role: full?.role,
        correctionSignal: full?.correctionSignal,
      };
    });
    const mini = buildCaseState(caseMsgs, threadId, kc);
    const parts = parseCaseUpdateSections(mini.caseUpdate);
    const summary =
      parts.current ||
      String(mini.situationSummary || "").trim() ||
      seg.messages
        .slice(-2)
        .map((x) => x.content.trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 280) ||
      "(Segment summary unavailable.)";
    return {
      topicLabel: seg.topicLabel,
      firstPostAt: seg.messages[0]?.createdAt,
      lastPostAt: seg.messages[seg.messages.length - 1]?.createdAt,
      summary,
      context: parts.knowledgeBase || undefined,
      openPoints:
        parts.open ||
        (mini.missingDetails.length > 0 ? mini.missingDetails.slice(0, 3).join("; ") : undefined),
      isActive: seg.segmentIndex === activeIdx,
    };
  });
}

export function buildTopicTracksFromCases(chatThreadId: string): TopicTrackSummary[] {
  const splitCases = getCasesForChatThread(chatThreadId);
  if (splitCases.length < 2) return [];
  const latestCaseUpdate = splitCases.reduce(
    (latest, c) => (c.updatedAt.getTime() > latest.getTime() ? c.updatedAt : latest),
    new Date(0),
  );
  return splitCases.map((c) => {
    const caseMessages = listMessagesByIdsOrdered(c.messageIds || []);
    const firstPost = caseMessages[0]?.createdAt?.toISOString() ?? c.createdAt.toISOString();
    const lastPost = caseMessages.length
      ? caseMessages[caseMessages.length - 1].createdAt.toISOString()
      : c.updatedAt.toISOString();
    const topicSlug = String(c.threadId || "").includes("#")
      ? String(c.threadId).split("#")[1]
      : String(c.threadId || c.title || "").slice(0, 40);
    const openParts = [
      ...(c.missingDetails || []),
      ...(c.runningObservations || []).filter((o) =>
        /open questions?|unknown|uncertain|no existing data|still needed|not yet established|impact of bypass/i.test(o)),
    ];
    const summaryText = c.caseSummary || "";
    const openSentences = summaryText.split(/(?<=[.!?])\s+/).filter((s) =>
      /open questions?|unknown|uncertain|no existing data|still needed|impact of bypass/i.test(s));
    if (!openParts.length && openSentences.length) {
      openParts.push(...openSentences);
    }
    return {
      topicLabel: topicSlug,
      firstPostAt: firstPost,
      lastPostAt: lastPost,
      summary: c.caseSummary || c.title || "",
      context: (c.runningObservations || []).join(" ") || undefined,
      openPoints: openParts.length ? openParts.join(". ") : undefined,
      isActive: c.updatedAt.getTime() === latestCaseUpdate.getTime(),
    } satisfies TopicTrackSummary;
  });
}

export function buildThreadRecap(threadId: string): CaseState {
  const threadMessages = listThreadMessages(threadId).map((message) => ({
    id: message.id,
    threadId: message.threadId,
    content: message.content,
    role: message.role,
    correctionSignal: message.correctionSignal,
  }));
  const recap = buildCaseState(threadMessages, threadId, buildThreadKnowledgeContext(threadId));
  const caseTracks = buildTopicTracksFromCases(threadId);
  if (caseTracks.length >= 2) {
    recap.topicTracks = caseTracks;
  }
  return recap;
}

export function buildGlobalFeedRecap(limit = 120): CaseState {
  const feedMessages = listAllMessages(limit).map((message) => ({
    id: message.id,
    threadId: message.threadId,
    content: message.content,
    role: message.role,
    correctionSignal: message.correctionSignal,
  }));
  return buildCaseState(feedMessages, "global-feed", buildThreadKnowledgeContext("global-feed"));
}

export function buildThreadKeyStrategies(threadId: string): KeyStrategiesResult {
  const threadMessages = listThreadMessages(threadId).map((message) => ({
    id: message.id,
    threadId: message.threadId,
    content: message.content,
    role: message.role,
    correctionSignal: message.correctionSignal,
  }));
  return buildKeyStrategies(threadMessages);
}

// Optional explicit helper if you already know caseId
export async function addReplyToCase(message: ForumMessage, caseId: string): Promise<FrogCase | null> {
  messages.set(message.id, message);
  await persistMessages();
  const frogCase = cases.get(caseId);
  if (!frogCase) return null;

  frogCase.messageIds.push(message.id);
  frogCase.contributors = mergeUnique(frogCase.contributors, [message.userId]);
  frogCase.tags = refineTagsForCase(frogCase);
  frogCase.updatedAt = new Date();
  await syncCaseLearningFromThread(frogCase);
  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

// 2) Find cases needing follow-up
export function getCasesNeedingFollowUp(now: Date): FrogCase[] {
  const out: FrogCase[] = [];
  for (const frogCase of cases.values()) {
    if (
      (frogCase.status === "OPEN" || frogCase.status === "MONITORING") &&
      frogCase.followUpDueAt &&
      frogCase.followUpDueAt <= now &&
      frogCase.followUpCount < 3
    ) {
      out.push(frogCase);
    }
  }
  return out;
}

// Mark that you've sent a follow-up ping
export async function markFollowUpSent(frogCase: FrogCase, sentAt: Date): Promise<FrogCase> {
  frogCase.lastFollowUpSentAt = sentAt;
  frogCase.followUpCount += 1;
  frogCase.followUpDueAt =
    frogCase.followUpCount >= 3 ? null : computeNextFollowUpTime(sentAt);

  frogCase.updatedAt = new Date();
  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

// 3) Record case resolution
export async function submitCaseResolution(input: ResolutionInput): Promise<FrogCase | null> {
  const frogCase = cases.get(input.caseId);
  if (!frogCase) return null;

  frogCase.status = input.outcome;
  frogCase.followUpDueAt = input.outcome === "RESOLVED" ? null : computeNextFollowUpTime(new Date());
  frogCase.updatedAt = new Date();
  frogCase.contributors = mergeUnique(frogCase.contributors, [input.userId]);

  const freeText = (input.freeText ?? "").trim();
  if (freeText) {
    frogCase.resolutionSummary = freeText;
    frogCase.caseSummary = freeText;
    frogCase.currentStrategy = frogCase.currentStrategy.length > 0 ? frogCase.currentStrategy : frogCase.suggestedNextSteps.slice(0, 4);
    frogCase.currentStatus = input.outcome === "RESOLVED" ? "improved" : input.outcome.toLowerCase();
    frogCase.actionsTried = mergeUnique(frogCase.actionsTried, extractActionPhrases(freeText));
    frogCase.currentSystemStatus = freeText;
  }

  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

export function getCaseFollowUpPrompt(caseId: string): string | null {
  const frogCase = cases.get(caseId);
  if (!frogCase) return null;
  if (frogCase.status === "OPEN" || frogCase.status === "MONITORING") {
    return UNIVERSAL_FOLLOW_UP_PROMPT;
  }
  return null;
}

export async function submitCaseFollowUp(input: FollowUpInput): Promise<FrogCase | null> {
  const frogCase = cases.get(input.caseId);
  if (!frogCase) return null;

  const responseText = input.responseText.trim();
  if (!responseText) {
    throw new Error("Follow-up responseText is required");
  }

  const inferredStatus = input.status ?? inferStatusFromText(responseText, frogCase.status);
  frogCase.status = inferredStatus;
  frogCase.currentStatus = inferredStatus === "RESOLVED" ? "improved" : inferredStatus.toLowerCase();
  frogCase.currentStrategy = frogCase.currentStrategy.length > 0 ? frogCase.currentStrategy : frogCase.suggestedNextSteps.slice(0, 4);
  frogCase.actionsTried = mergeUnique(frogCase.actionsTried, extractActionPhrases(responseText));
  frogCase.currentSystemStatus = responseText;
  frogCase.caseSummary = responseText;
  if (inferredStatus === "RESOLVED" || /improv|resolved|stable|recover/i.test(responseText)) {
    frogCase.resolutionSummary = responseText;
  }
  frogCase.followUpCount += 1;
  frogCase.updatedAt = new Date();
  frogCase.followUpDueAt = inferredStatus === "RESOLVED" ? null : computeNextFollowUpTime(new Date());
  frogCase.contributors = mergeUnique(frogCase.contributors, [input.userId]);

  registerCaseInIndices(frogCase);
  await persistCases();
  return frogCase;
}

// 4) Query helpers for the UI
export function listCases(): FrogCase[] {
  const deduped = dedupeCasesByThread(Array.from(cases.values()));
  return deduped.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getCaseById(caseId: string): FrogCase | null {
  return cases.get(caseId) ?? null;
}

export function getCaseByThreadId(threadId: string): FrogCase | null {
  const caseId = findCaseIdByThreadId(threadId);
  if (caseId) return cases.get(caseId) ?? null;
  const splitCases = getCasesForChatThread(threadId);
  if (splitCases.length === 0) return null;
  return splitCases.reduce((latest, c) =>
    c.updatedAt.getTime() > latest.updatedAt.getTime() ? c : latest,
  );
}

export function getCaseByNumber(caseNumber: number): FrogCase | null {
  const target = Number(caseNumber);
  if (!Number.isFinite(target) || target <= 0) return null;
  for (const frogCase of cases.values()) {
    if (Number(frogCase.caseNumber || 0) === target) {
      return frogCase;
    }
  }
  return null;
}

function formatCaseDateTokens(date: Date): string[] {
  const iso = date.toISOString();
  const month = date.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const monthShort = date.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const year = String(date.getFullYear());
  const day = String(date.getDate());
  return [iso, `${month} ${day}`, `${monthShort} ${day}`, month, monthShort, year];
}

function buildCaseRecallHaystack(frogCase: FrogCase): string {
  const threadMessages = listThreadMessages(frogCase.threadId || frogCase.sourceThreadId)
    .map((message) => message.content)
    .join(" ");
  const fields = [
    `case ${frogCase.caseNumber}`,
    `case #${frogCase.caseNumber}`,
    frogCase.title,
    frogCase.threadId,
    frogCase.caseSummary,
    frogCase.currentSystemStatus,
    frogCase.currentStatus,
    frogCase.runningObservations.join(" "),
    frogCase.actionsTried.join(" "),
    frogCase.domainsInPlay.join(" "),
    frogCase.tags.join(" "),
    threadMessages,
    ...formatCaseDateTokens(frogCase.updatedAt),
    ...formatCaseDateTokens(frogCase.createdAt),
  ];
  return fields.join(" ").toLowerCase();
}

function toSummaryPreview(text: string, maxLen = 220): string {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "No summary yet.";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3).trimEnd()}...`;
}

export function recallCases(query: string, limit = 12): CaseRecallResult[] {
  const trimmed = String(query || "").trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const pool = listCases().filter((frogCase) => frogCase.admissionState === "admitted");

  const scored = pool
    .map((frogCase) => {
      const haystack = buildCaseRecallHaystack(frogCase);
      const reasons: string[] = [];
      let score = 0;

      if (!trimmed) {
        score = 1;
      } else {
        for (const token of tokens) {
          if (token.length < 2) continue;
          if (frogCase.title.toLowerCase().includes(token)) {
            score += 5;
            reasons.push(`title:${token}`);
          }
          if (frogCase.threadId.toLowerCase().includes(token)) {
            score += 4;
            reasons.push(`thread:${token}`);
          }
          if (frogCase.caseSummary.toLowerCase().includes(token)) {
            score += 3;
            reasons.push(`summary:${token}`);
          }
          if (frogCase.currentSystemStatus.toLowerCase().includes(token)) {
            score += 2;
            reasons.push(`status:${token}`);
          }
          if (haystack.includes(token)) {
            score += 1;
          }
        }
      }

      const ageMs = Date.now() - frogCase.updatedAt.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays > 7) {
        score = Math.max(1, Math.round(score * 0.25));
      } else if (ageDays > 3) {
        score = Math.max(1, Math.round(score * 0.5));
      }

      if (!score) {
        return null;
      }

      return {
        caseId: frogCase.caseId || frogCase.id,
        caseNumber: Number(frogCase.caseNumber || 0),
        threadId: frogCase.threadId,
        title: frogCase.title,
        summaryPreview: toSummaryPreview(frogCase.caseSummary || frogCase.currentSystemStatus),
        updatedAt: frogCase.updatedAt.toISOString(),
        status: frogCase.status,
        entryMode: frogCase.entryMode,
        matchScore: score,
        matchReasons: Array.from(new Set(reasons)).slice(0, 4),
      } satisfies CaseRecallResult;
    })
    .filter((row): row is CaseRecallResult => Boolean(row));

  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return scored.slice(0, Math.max(1, Math.min(limit, 50)));
}

export function findSimilarCasesForThread(threadId: string, limit = 6): ThreadSimilarCasesResult {
  const threadMessages = listThreadMessages(threadId);
  const recap = buildThreadRecap(threadId);
  const recapParts = [
    recap.caseUpdate,
    recap.situationSummary,
    ...(Array.isArray(recap.emergingThreads) ? recap.emergingThreads.slice(0, 4) : []),
    ...(Array.isArray(recap.domainsInPlay) ? recap.domainsInPlay.slice(0, 3) : []),
  ]
    .filter(Boolean)
    .join(" ");
  const recentMessageParts = threadMessages
    .slice(-4)
    .map((entry) => String(entry.content || "").trim())
    .filter(Boolean)
    .join(" ");
  const query = `${recapParts} ${recentMessageParts}`.replace(/\s+/g, " ").trim();
  const rawMatches = recallCases(query, Math.max(1, Math.min(limit + 5, 25)));
  const threadCases = getCasesForChatThread(threadId);
  const currentCaseIds = new Set(threadCases.map((c) => c.caseId || c.id));

  const currentCases: CaseRecallResult[] = threadCases.slice(0, 2).map((tc) => ({
    caseId: tc.caseId || tc.id,
    caseNumber: tc.caseNumber,
    threadId: tc.threadId,
    title: tc.title,
    summaryPreview: (tc.caseSummary || "").slice(0, 220),
    updatedAt: tc.updatedAt.toISOString(),
    status: tc.status,
    entryMode: tc.entryMode,
    matchScore: 100,
    matchReasons: ["current session case"],
  }));

  const relatedCases: CaseRecallResult[] = rawMatches
    .filter((entry) => !currentCaseIds.has(String(entry.caseId || "")) &&
      String(entry.threadId || "").trim() !== String(threadId || "").trim())
    .slice(0, 2);

  return { threadId, query, matches: relatedCases, currentCases };
}

export function findSimilarCasesForFeed(limit = 8): FeedSimilarCasesResult {
  const recap = buildGlobalFeedRecap(120);
  const recentMessageParts = listAllMessages(80)
    .slice(-12)
    .map((entry) => String(entry.content || "").trim())
    .filter(Boolean)
    .join(" ");
  const query = [
    recap.caseUpdate,
    recap.situationSummary,
    ...(Array.isArray(recap.emergingThreads) ? recap.emergingThreads.slice(0, 5) : []),
    recentMessageParts,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = recallCases(query, Math.max(1, Math.min(limit, 20)));
  const ranked = [...matches].sort((a, b) => {
    const aResolved = a.status === "RESOLVED" ? 1 : 0;
    const bResolved = b.status === "RESOLVED" ? 1 : 0;
    if (bResolved !== aResolved) return bResolved - aResolved;
    return b.matchScore - a.matchScore;
  });
  return {
    query,
    generatedAt: new Date().toISOString(),
    matches: ranked.slice(0, Math.max(1, Math.min(limit, 20))),
  };
}

export function buildPersistenceReport(): {
  totalCases: number;
  totalThreadsWithMessages: number;
  missingThreadLinks: number;
  rows: PersistenceCaseReportRow[];
} {
  const currentCases = listCases();
  const rows = currentCases.map((frogCase) => {
    const threadId = frogCase.threadId || frogCase.sourceThreadId;
      const messagesForThread = listThreadMessages(threadId, true);
    return {
      caseId: frogCase.caseId || frogCase.id,
      threadId,
      title: frogCase.title,
      messageCountForThread: messagesForThread.length,
      caseMessageIdCount: Array.isArray(frogCase.messageIds) ? frogCase.messageIds.length : 0,
      hasAnyThreadMessages: messagesForThread.length > 0,
      status: frogCase.status,
      updatedAt: frogCase.updatedAt.toISOString(),
      entryMode: frogCase.entryMode ?? "social",
    };
  });

  return {
    totalCases: currentCases.length,
    totalThreadsWithMessages: new Set(Array.from(messages.values()).map((message) => message.threadId)).size,
    missingThreadLinks: rows.filter((row) => !row.hasAnyThreadMessages).length,
    rows,
  };
}

export function buildThreadVerificationReport(threadId: string): ThreadVerificationReport {
  const threadMessages = listThreadMessages(threadId);
  const linkedCase = getCaseByThreadId(threadId);
  const recap = buildThreadRecap(threadId);
  const emerging = buildThreadKeyStrategies(threadId);
  const interpretationAudit = buildInterpretationAudit(
    threadMessages.map((message) => ({
      id: message.id,
      threadId: message.threadId,
      content: message.content,
      role: message.role,
      correctionSignal: message.correctionSignal,
    }))
  );
  return {
    threadId,
    caseFound: Boolean(linkedCase),
    caseId: linkedCase ? linkedCase.caseId || linkedCase.id : null,
    caseTitle: linkedCase ? linkedCase.title : null,
    entryMode: linkedCase ? linkedCase.entryMode ?? "social" : null,
    messageCount: threadMessages.length,
    caseSummaryPresent: Boolean(linkedCase?.caseSummary || recap.caseUpdate),
    strategyCount: linkedCase?.currentStrategy?.length ?? recap.currentStrategy.length,
    status: linkedCase?.currentStatus ?? recap.currentStatus ?? null,
    emergingStrategyReady: Boolean(emerging.ready),
    interpretationAudit,
  };
}

let _initialized = false;
let _initPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await hydrateMessagesFromDisk();
    await hydrateCasesFromDisk();

    const baseThreadIds = new Set<string>();
    for (const msg of messages.values()) {
      const base = (msg.threadId || "").trim().split("#")[0];
      if (base && !base.startsWith("topic-") && !isExcludedThreadId(base)) {
        baseThreadIds.add(base);
      }
    }
    let promoted = 0;
    for (const tid of baseThreadIds) {
      try {
        const before = cases.size;
        await promoteEmergingThreadsToCases(tid);
        promoted += cases.size - before;
      } catch (err) {
        console.warn(`[init] Promotion failed for thread ${tid}:`, err);
      }
    }
    if (promoted > 0) {
      console.log(`[frogCases] Promoted ${promoted} emerging thread(s) to cases during init`);
    }

    _initialized = true;
    console.log("[frogCases] Initialization complete");
  })();
  return _initPromise;
}

export async function rehydrateFromRedis(): Promise<void> {
  const freshMessages = await loadMessagesFromDisk();
  for (const msg of freshMessages) {
    if (!messages.has(msg.id)) {
      messages.set(msg.id, msg);
    }
  }
  const freshCases = await loadCasesFromDisk();
  for (const fc of freshCases) {
    const existing = cases.get(fc.id);
    if (!existing || fc.updatedAt.getTime() > existing.updatedAt.getTime()) {
      registerCaseInIndices(fc);
    }
  }
}

