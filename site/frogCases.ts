// src/frogCases.ts

export type CaseStatus = "OPEN" | "PARTIAL" | "RESOLVED" | "UNRESOLVED";

export interface ForumMessage {
  id: string;
  userId: string;
  facilityId?: string;
  threadId: string;
  content: string;
  createdAt: Date;
}

export interface FrogCase {
  id: string;
  facilityId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;

  title: string;
  initialMessageId: string;
  messageIds: string[];
  tags: string[];

  status: CaseStatus;
  resolutionSummaryShort?: string;
  resolutionSummaryFull?: string;
  resolvedAt?: Date;
  resolvedByUserId?: string | null;

  followUpDueAt?: Date | null;
  lastFollowUpSentAt?: Date | null;
  followUpCount: number;
}

export interface ResolutionInput {
  caseId: string;
  userId: string;
  outcome: CaseStatus;   // "RESOLVED" | "PARTIAL" | "UNRESOLVED"
  freeText?: string;
}

// In-memory storage — replace with real DB later
const cases: Map<string, FrogCase> = new Map();
const threadToCaseId: Map<string, string> = new Map();

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

function shouldOpenCaseFromMessage(message: ForumMessage): boolean {
  // New case if this is the first message in a thread
  return !threadToCaseId.has(message.threadId);
}

function deriveTitleFromMessage(message: ForumMessage): string {
  const firstLine = message.content.split("\n")[0].trim();
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

// Very simple summarizer for now
function summarizeCase(
  frogCase: FrogCase,
  freeText?: string
): { shortSummary: string; fullSummary: string } {
  const base =
    freeText && freeText.trim().length > 0
      ? freeText.trim()
      : "Outcome recorded, see case thread for full details.";

  const shortSummary =
    base.length > 140 ? base.slice(0, 137).trimEnd() + "..." : base;

  return { shortSummary, fullSummary: base };
}

// 1) Handle new message (create case or attach to existing)
export function handleNewMessage(message: ForumMessage): FrogCase | null {
  if (!shouldOpenCaseFromMessage(message)) {
    // Existing thread → update existing case
    const existingCaseId = threadToCaseId.get(message.threadId);
    if (!existingCaseId) return null;
    const frogCase = cases.get(existingCaseId);
    if (!frogCase) return null;

    frogCase.messageIds.push(message.id);
    frogCase.tags = refineTagsForCase(frogCase);
    frogCase.updatedAt = new Date();

    cases.set(frogCase.id, frogCase);
    return frogCase;
  }

  // New thread → new case
  const now = new Date();
  const frogCase: FrogCase = {
    id: generateId(),
    facilityId: message.facilityId ?? null,
    createdByUserId: message.userId,
    createdAt: now,
    updatedAt: now,

    title: deriveTitleFromMessage(message),
    initialMessageId: message.id,
    messageIds: [message.id],
    tags: deriveInitialTags(message),

    status: "OPEN",
    resolutionSummaryShort: undefined,
    resolutionSummaryFull: undefined,
    resolvedAt: undefined,
    resolvedByUserId: undefined,

    followUpDueAt: computeInitialFollowUpTime(),
    lastFollowUpSentAt: null,
    followUpCount: 0
  };

  cases.set(frogCase.id, frogCase);
  threadToCaseId.set(message.threadId, frogCase.id);

  return frogCase;
}

// Optional explicit helper if you already know caseId
export function addReplyToCase(message: ForumMessage, caseId: string): FrogCase | null {
  const frogCase = cases.get(caseId);
  if (!frogCase) return null;

  frogCase.messageIds.push(message.id);
  frogCase.tags = refineTagsForCase(frogCase);
  frogCase.updatedAt = new Date();
  cases.set(frogCase.id, frogCase);

  return frogCase;
}

// 2) Find cases needing follow-up
export function getCasesNeedingFollowUp(now: Date): FrogCase[] {
  const out: FrogCase[] = [];
  for (const frogCase of cases.values()) {
    if (
      (frogCase.status === "OPEN" || frogCase.status === "PARTIAL") &&
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
  cases.set(frogCase.id, frogCase);
  return frogCase;
}

// 3) Record case resolution
export function submitCaseResolution(input: ResolutionInput): FrogCase | null {
  const frogCase = cases.get(input.caseId);
  if (!frogCase) return null;

  if (
    input.outcome !== "RESOLVED" &&
    input.outcome !== "PARTIAL" &&
    input.outcome !== "UNRESOLVED"
  ) {
    throw new Error("Invalid resolution outcome");
  }

  frogCase.status = input.outcome;
  frogCase.resolvedAt = new Date();
  frogCase.resolvedByUserId = input.userId;
  frogCase.followUpDueAt = null; // stop nudging
  frogCase.updatedAt = new Date();

  const { shortSummary, fullSummary } = summarizeCase(frogCase, input.freeText);
  frogCase.resolutionSummaryShort = shortSummary;
  frogCase.resolutionSummaryFull = fullSummary;

  cases.set(frogCase.id, frogCase);
  return frogCase;
}

// 4) Query helpers for the UI
export function listCases(): FrogCase[] {
  return Array.from(cases.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
}

export function getCaseById(caseId: string): FrogCase | null {
  return cases.get(caseId) ?? null;
}

export function getCaseByThreadId(threadId: string): FrogCase | null {
  const caseId = threadToCaseId.get(threadId);
  if (!caseId) return null;
  return cases.get(caseId) ?? null;
}

