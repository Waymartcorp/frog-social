// src/frogCases.ts
import {
  buildCaseState,
  buildInterpretationAudit,
  buildKeyStrategies,
  type CaseState,
  type InterpretationAudit,
  type KeyStrategiesResult,
} from "./caseState";
import { loadCasesFromDisk, saveCasesToDisk } from "./caseStorage";
import { loadMessagesFromDisk, saveMessagesToDisk } from "./messageStorage";

export type CaseStatus = "OPEN" | "MONITORING" | "RESOLVED";

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

export interface PersistenceCaseReportRow {
  caseId: string;
  threadId: string;
  title: string;
  messageCountForThread: number;
  caseMessageIdCount: number;
  hasAnyThreadMessages: boolean;
  status: CaseStatus;
  updatedAt: string;
}

export interface ThreadVerificationReport {
  threadId: string;
  caseFound: boolean;
  caseId: string | null;
  caseTitle: string | null;
  messageCount: number;
  caseSummaryPresent: boolean;
  strategyCount: number;
  status: string | null;
  emergingStrategyReady: boolean;
  interpretationAudit: InterpretationAudit;
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

function threadHasRequiredSignals(messagesInThread: ForumMessage[]): boolean {
  const combined = messagesInThread.map((message) => message.content).join(" ");
  return SYMPTOM_SIGNAL_REGEX.test(combined) && ENVIRONMENT_SIGNAL_REGEX.test(combined);
}

function shouldCreateCaseFromThread(messagesInThread: ForumMessage[], threadId: string): boolean {
  if (isExcludedThreadId(threadId)) {
    return false;
  }

  const meaningfulPosts = messagesInThread.filter((message) => isMeaningfulPost(message.content));
  const hasLongNarrative = messagesInThread.some((message) => message.content.trim().length > 300);
  const hasLongNarrativeWithReply = hasLongNarrative && meaningfulPosts.length >= 2;
  const hasEnoughMeaningfulPosts = meaningfulPosts.length >= 4;

  if (!(hasEnoughMeaningfulPosts || hasLongNarrativeWithReply)) {
    return false;
  }

  return threadHasRequiredSignals(messagesInThread);
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
  const actions = sentences.filter((sentence) => actionSignals.test(sentence));
  const unique = new Set<string>();
  for (const action of actions) {
    unique.add(action);
  }
  return Array.from(unique).slice(0, 8);
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
  if (trimmed.length > 70) return true;
  if (/^(we|this|post-shipment|msg one|test)\b/i.test(trimmed)) return true;
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
  if (mapped) return mapped;

  for (const frogCase of cases.values()) {
    if (frogCase.threadId === normalized || frogCase.sourceThreadId === normalized) {
      threadToCaseId.set(normalized, frogCase.id);
      return frogCase.id;
    }
  }

  return null;
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
  if (frogCase.isSeedOrTest) return true;
  if (isExcludedThreadId(frogCase.threadId) || isExcludedThreadId(frogCase.sourceThreadId)) {
    return true;
  }
  if (/^(msg one|test)$/i.test(frogCase.title.trim())) {
    return true;
  }
  if (!threadHasRequiredSignals([{ id: "tmp", userId: "system", threadId: frogCase.threadId, content: frogCase.caseSummary, createdAt: new Date() }])) {
    const meaningfulCount = frogCase.runningObservations.filter((entry) => isMeaningfulPost(entry)).length;
    if (meaningfulCount < 2) {
      return true;
    }
  }
  return false;
}

function markExistingSeedOrTestCases(casesToMark: FrogCase[]): { marked: number; result: FrogCase[] } {
  let marked = 0;
  const result = casesToMark.map((frogCase) => {
    if (shouldMarkCaseAsSeedOrTest(frogCase) && !frogCase.isSeedOrTest) {
      marked += 1;
      return { ...frogCase, isSeedOrTest: true };
    }
    return frogCase;
  });
  return { marked, result };
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

function syncCaseLearningFromThread(threadId: string, frogCase: FrogCase): FrogCase {
  const recap = buildThreadRecap(threadId);
  frogCase.title = frogCase.title || deriveTitleFromThread(listThreadMessages(threadId));
  enforceCaseTitleFromThread(frogCase);
  frogCase.caseSummary = recap.caseUpdate;
  frogCase.currentStrategy = recap.currentStrategy;
  frogCase.currentStatus = recap.currentStatus;
  frogCase.runningObservations = recap.initialObservations;
  frogCase.missingDetails = recap.missingDetails;
  frogCase.domainsInPlay = recap.domainsInPlay;
  frogCase.actionsTried = mergeUnique(frogCase.actionsTried, recap.actionsTried);
  frogCase.suggestedNextSteps = recap.suggestedNextSteps;
  frogCase.currentSystemStatus = recap.situationSummary;
  frogCase.status = frogCase.status === "RESOLVED" ? "RESOLVED" : mapRecapStatus(recap.resolutionStatus);
  return frogCase;
}

function persistCases() {
  saveCasesToDisk(Array.from(cases.values()));
}

function persistMessages() {
  saveMessagesToDisk(Array.from(messages.values()));
}

function registerCaseInIndices(frogCase: FrogCase) {
  cases.set(frogCase.id, frogCase);
  const threadKey = getThreadKey(frogCase);
  if (threadKey) {
    threadToCaseId.set(threadKey, frogCase.id);
  }
  if (frogCase.sourceThreadId && frogCase.sourceThreadId !== threadKey) {
    threadToCaseId.set(frogCase.sourceThreadId, frogCase.id);
  }
}

function normalizeLoadedCase(loaded: FrogCase): FrogCase {
  const normalizedStatus: CaseStatus =
    loaded.status === "RESOLVED" ? "RESOLVED" : loaded.status === "MONITORING" ? "MONITORING" : "OPEN";
  return {
    ...loaded,
    caseId: loaded.caseId || loaded.id,
    threadId: loaded.threadId || loaded.sourceThreadId || `legacy-thread-${loaded.id}`,
    isSeedOrTest: loaded.isSeedOrTest ?? false,
    caseSummary: loaded.caseSummary ?? loaded.currentSystemStatus ?? "",
    currentStrategy: Array.isArray(loaded.currentStrategy) ? loaded.currentStrategy : [],
    currentStatus: loaded.currentStatus ?? (normalizedStatus === "RESOLVED" ? "improved" : normalizedStatus.toLowerCase()),
    sourceThreadId: loaded.sourceThreadId || `legacy-${loaded.id}`,
    contributors: Array.isArray(loaded.contributors) && loaded.contributors.length > 0 ? loaded.contributors : [loaded.createdByUserId],
    messageIds: Array.isArray(loaded.messageIds) ? loaded.messageIds : [],
    tags: Array.isArray(loaded.tags) ? loaded.tags : [],
    runningObservations: Array.isArray(loaded.runningObservations) ? loaded.runningObservations : [],
    missingDetails: Array.isArray(loaded.missingDetails) ? loaded.missingDetails : [],
    domainsInPlay: Array.isArray(loaded.domainsInPlay) ? loaded.domainsInPlay : [],
    actionsTried: Array.isArray(loaded.actionsTried) ? loaded.actionsTried : [],
    suggestedNextSteps: Array.isArray(loaded.suggestedNextSteps) ? loaded.suggestedNextSteps : [],
    currentSystemStatus: loaded.currentSystemStatus ?? "",
    resolutionSummary: loaded.resolutionSummary ?? "",
    status: normalizedStatus,
  };
}

function hydrateCasesFromDisk() {
  cases.clear();
  threadToCaseId.clear();

  const persistedCases = loadCasesFromDisk().map(normalizeLoadedCase);
  const dedupedCases = dedupeCasesByThread(persistedCases);
  const marked = markExistingSeedOrTestCases(dedupedCases);
  for (const persisted of marked.result) {
    enforceCaseTitleFromThread(persisted);
    registerCaseInIndices(persisted);
  }
  const backfilledCases = backfillLegacyMessagesForCases(marked.result);

  if (dedupedCases.length !== persistedCases.length) {
    console.warn(
      `[frogCases] Rewriting cases.json after deduplication (${persistedCases.length} -> ${dedupedCases.length}).`
    );
  }
  if (marked.marked > 0) {
    console.warn(`[frogCases] Marked ${marked.marked} existing case(s) as isSeedOrTest.`);
  }
  if (backfilledCases > 0) {
    console.warn(`[frogCases] Backfilled legacy message history for ${backfilledCases} case(s).`);
  }
  // Always rewrite the normalized deduped set so disk state is clean and canonical.
  saveCasesToDisk(marked.result);
  saveMessagesToDisk(Array.from(messages.values()));
}

function hydrateMessagesFromDisk() {
  messages.clear();
  const persistedMessages = loadMessagesFromDisk();
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

export function createCaseFromSeed(input: CaseSeedInput): FrogCase {
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
      persistCases();
      return existing;
    }
  }
  const initialNarrative = (input.initialNarrative ?? "").trim();
  const seededActions = extractActionPhrases(initialNarrative);

  const frogCase: FrogCase = {
    id: caseId,
    caseId,
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
  };
  enforceCaseTitleFromThread(frogCase);

  registerCaseInIndices(frogCase);
  persistCases();
  return frogCase;
}

// 1) Handle new message (create case or attach to existing)
export function handleNewMessage(message: ForumMessage): FrogCase | null {
  messages.set(message.id, message);
  persistMessages();

  const existingCaseId = findCaseIdByThreadId(message.threadId);
  if (existingCaseId) {
    // Existing thread → update existing case
    const frogCase = cases.get(existingCaseId);
    if (!frogCase) return null;

    frogCase.messageIds.push(message.id);
    frogCase.tags = refineTagsForCase(frogCase);
    frogCase.contributors = mergeUnique(frogCase.contributors, [message.userId]);
    frogCase.updatedAt = new Date();
    syncCaseLearningFromThread(message.threadId, frogCase);
    registerCaseInIndices(frogCase);
    persistCases();
    return frogCase;
  }

  const threadMessages = listThreadMessages(message.threadId);
  if (!shouldCreateCaseFromThread(threadMessages, message.threadId)) {
    return null;
  }

  const existingAfterThresholdCheck = findCaseIdByThreadId(message.threadId);
  if (existingAfterThresholdCheck) {
    const existing = cases.get(existingAfterThresholdCheck);
    if (!existing) return null;
    existing.messageIds.push(message.id);
    existing.contributors = mergeUnique(existing.contributors, [message.userId]);
    existing.updatedAt = new Date();
    syncCaseLearningFromThread(message.threadId, existing);
    registerCaseInIndices(existing);
    persistCases();
    return existing;
  }

  // Thread crossed threshold (>=3 msgs or long narrative) -> create case
  const now = new Date();
  const caseId = generateId();
  const recap = buildCaseState(
    threadMessages.map((threadMessage) => ({
      id: threadMessage.id,
      threadId: threadMessage.threadId,
      content: threadMessage.content,
    })),
    message.threadId
  );
  const frogCase: FrogCase = {
    id: caseId,
    caseId,
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
  };
  enforceCaseTitleFromThread(frogCase);

  registerCaseInIndices(frogCase);
  persistCases();
  return frogCase;
}

export function getMessageById(id: string): ForumMessage | null {
  return messages.get(id) ?? null;
}

export function listMessagesByThreadId(threadId: string): ForumMessage[] {
  return listThreadMessages(threadId);
}

export function listMessagesByCaseId(caseId: string): ForumMessage[] {
  const frogCase = cases.get(caseId);
  if (!frogCase) return [];

  return frogCase.messageIds
    .map((messageId) => messages.get(messageId))
    .filter((message): message is ForumMessage => Boolean(message));
}

export function buildThreadRecap(threadId: string): CaseState {
  const threadMessages = listThreadMessages(threadId).map((message) => ({
    id: message.id,
    threadId: message.threadId,
    content: message.content,
    role: message.role,
    correctionSignal: message.correctionSignal,
  }));
  return buildCaseState(threadMessages, threadId);
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
export function addReplyToCase(message: ForumMessage, caseId: string): FrogCase | null {
  messages.set(message.id, message);
  persistMessages();
  const frogCase = cases.get(caseId);
  if (!frogCase) return null;

  frogCase.messageIds.push(message.id);
  frogCase.contributors = mergeUnique(frogCase.contributors, [message.userId]);
  frogCase.tags = refineTagsForCase(frogCase);
  frogCase.updatedAt = new Date();
  syncCaseLearningFromThread(frogCase.sourceThreadId, frogCase);
  registerCaseInIndices(frogCase);
  persistCases();
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
export function markFollowUpSent(frogCase: FrogCase, sentAt: Date): FrogCase {
  frogCase.lastFollowUpSentAt = sentAt;
  frogCase.followUpCount += 1;
  frogCase.followUpDueAt =
    frogCase.followUpCount >= 3 ? null : computeNextFollowUpTime(sentAt);

  frogCase.updatedAt = new Date();
  registerCaseInIndices(frogCase);
  persistCases();
  return frogCase;
}

// 3) Record case resolution
export function submitCaseResolution(input: ResolutionInput): FrogCase | null {
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
  persistCases();
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

export function submitCaseFollowUp(input: FollowUpInput): FrogCase | null {
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
  persistCases();
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
  if (!caseId) return null;
  return cases.get(caseId) ?? null;
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
    messageCount: threadMessages.length,
    caseSummaryPresent: Boolean(linkedCase?.caseSummary || recap.caseUpdate),
    strategyCount: linkedCase?.currentStrategy?.length ?? recap.currentStrategy.length,
    status: linkedCase?.currentStatus ?? recap.currentStatus ?? null,
    emergingStrategyReady: Boolean(emerging.ready),
    interpretationAudit,
  };
}

hydrateMessagesFromDisk();
hydrateCasesFromDisk();

