// src/index.ts

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import path from "node:path";
import { isLLMConfigured, generateThreadSummary, segmentThreadByStrictTopic } from "./llmSummary";
import { sanitizeGeneratedText, stripAllSectionPrefixes, deduplicateSentences } from "./caseState";
import { redisGet, redisSet } from "./redisStorage";
import {
  signUp,
  logIn,
  resetPassword,
  verifyToken,
  extractTokenFromHeader,
  getUserById,
  listUsers,
  classifyEmailDomain,
  isAllowlistedEmail,
  isUsernameTaken,
  type AuthTokenPayload,
} from "./auth";
import {
  ensureInitialized,
  rehydrateFromRedis,
  handleNewMessage,
  listCases,
  getCaseById,
  getCaseByNumber,
  getCaseByThreadId,
  submitCaseResolution,
  submitCaseFollowUp,
  getCaseFollowUpPrompt,
  buildThreadRecap,
  buildThreadKeyStrategies,
  buildThreadVerificationReport,
  buildPersistenceReport,
  listMessagesByThreadId,
  listAllMessages,
  createCaseFromDirectIntake,
  recallCases,
  findSimilarCasesForThread,
  findSimilarCasesForFeed,
  buildGlobalFeedRecap,
  buildHeuristicTopicTracksForThread,
  getCasesForChatThread,
  buildTopicTracksFromCases,
  resetAllState,
  type CaseStatus,
  type CaseRecallResult,
  type ForumMessage,
  type FollowUpInput,
  type ResolutionInput,
} from "./frogCases";

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalhost =
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
      const isProductionFrontend =
        origin === "https://frog-social.vercel.app" ||
        origin === "https://www.frogsocial.org";

      if (isLocalhost || isProductionFrontend) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json());
app.use(express.static(path.resolve(__dirname, "..", "..")));

function getActorFromRequest(req: express.Request): AuthTokenPayload | null {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) return null;
  return verifyToken(token);
}

app.use(async (_req, _res, next) => {
  try {
    await ensureInitialized();
    await rehydrateFromRedis();
  } catch (err) {
    console.error("[init] Failed to initialize:", err);
  }
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    status: "Frog Social backend running",
    redis: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    llm: isLLMConfigured(),
    vercel: Boolean(process.env.VERCEL),
  });
});

// ─── Auth routes ───────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, username, displayName, role, institution, avatarBase64, tosAccepted } = req.body;
    const result = await signUp({ email, password, username, displayName, role, institution, avatarBase64, tosAccepted });
    res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signup failed";
    res.status(400).json({ ok: false, error: msg });
  }
});

app.post("/api/auth/check-username", async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== "string") {
    return res.status(400).json({ ok: false, error: "Username is required." });
  }
  const taken = await isUsernameTaken(username);
  return res.json({ ok: true, available: !taken });
});

app.post("/api/auth/check-email", (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ ok: false, error: "Email is required." });
  }
  const status = classifyEmailDomain(email);
  return res.json({ ok: true, verificationStatus: status });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await logIn(email, password);
    res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed";
    res.status(401).json({ ok: false, error: msg });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
  const user = await getUserById(payload.userId);
  if (!user) {
    return res.status(404).json({ ok: false, error: "User not found" });
  }
  return res.json({ ok: true, user });
});

app.get("/api/auth/users", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const users = await listUsers();
  res.json({ ok: true, users });
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, newPassword, adminSecret } = req.body;
    await resetPassword(email, newPassword, adminSecret);
    res.json({ ok: true, message: "Password reset." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Reset failed";
    res.status(400).json({ ok: false, error: msg });
  }
});

// ─── Message & case routes ─────────────────────────────────────
app.post("/api/messages", async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
    const anonymous = Boolean(req.body.anonymous);
    const now = new Date();
    const message: ForumMessage = {
      id: randomUUID(),
      userId: actor.username,
      authorDisplayName: anonymous ? "Anonymous" : actor.displayName,
      facilityId: req.body.facilityId,
      threadId: req.body.threadId || randomUUID(),
      content: req.body.content,
      createdAt: now,
      role: req.body.role,
      correctionSignal: Boolean(req.body.correctionSignal),
    };
    (message as any).anonymous = anonymous;
    (message as any).realUserId = actor.username;
    const frogCase = await handleNewMessage(message);

    // Active prior-case surfacing: if a strong related case exists, surface it
    let priorCaseInsight: { caseNumber: number; title: string; outcome: string; summary: string } | null = null;
    if (frogCase && Array.isArray(frogCase.relatedCaseRefs) && frogCase.relatedCaseRefs.length > 0) {
      const top = frogCase.relatedCaseRefs[0];
      priorCaseInsight = {
        caseNumber: top.caseNumber,
        title: top.title,
        outcome: top.outcome,
        summary: `Similar to Case #${top.caseNumber} — ${top.title} (${top.outcome})`,
      };
    } else if (frogCase) {
      // Fallback: run recall against the new message content for cross-case memory
      const matches = recallCases(message.content, 3);
      const strong = matches.find(
        (m) => m.matchScore >= 6 && m.caseId !== frogCase.id && m.caseId !== frogCase.caseId
      );
      if (strong) {
        priorCaseInsight = {
          caseNumber: strong.caseNumber,
          title: strong.title,
          outcome: strong.status,
          summary: `Related prior case: #${strong.caseNumber} — ${strong.title} (${strong.status})`,
        };
      }
    }

    res.json({ ok: true, threadId: message.threadId, messageId: message.id, signals: message.signals, frogCase, priorCaseInsight });
  } catch (err) {
    console.error("[POST /api/messages] Error:", err);
    const msg = err instanceof Error ? err.message : "Failed to process message";
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/api/messages", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const rawLimit = Number(req.query.limit || 200);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 200;
  const rows = listAllMessages(limit);
  res.json(rows);
});

app.get("/api/feed/summary", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const recap = buildGlobalFeedRecap(120);
  res.json({
    generatedAt: new Date().toISOString(),
    recap,
  });
});

app.get("/api/feed/similar-cases", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const rawLimit = Number(req.query.limit || 8);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.floor(rawLimit))) : 8;
  const payload = findSimilarCasesForFeed(limit);
  res.json(payload);
});

app.get("/api/threads/:threadId/messages", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const messages = listMessagesByThreadId(req.params.threadId);
  res.json(messages);
});

app.get("/api/threads/:threadId/case", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const frogCase = getCaseByThreadId(req.params.threadId);
  if (!frogCase) {
    return res.json(null);
  }
  return res.json(frogCase);
});

app.get("/api/threads/:threadId/verify", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const report = buildThreadVerificationReport(req.params.threadId);
  return res.json(report);
});

app.get("/api/threads/:threadId/similar-cases", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const rawLimit = Number(req.query.limit || 6);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.floor(rawLimit))) : 6;
  const payload = findSimilarCasesForThread(req.params.threadId, limit);
  return res.json(payload);
});

// Recap cache: same text for all users within 5-minute window
const recapCache = new Map<string, { data: unknown; messageCount: number; generatedAt: number }>();
const RECAP_TTL_MS = 5 * 60 * 1000;

function buildCaseUpdateBlock(summary: string, context: string, openPoints: string, fallback: string): string {
  const cleanSummary = deduplicateSentences(sanitizeGeneratedText(stripAllSectionPrefixes(summary)));
  const cleanContext = deduplicateSentences(sanitizeGeneratedText(stripAllSectionPrefixes(context)));
  const cleanOpenPoints = deduplicateSentences(sanitizeGeneratedText(stripAllSectionPrefixes(openPoints)));

  const contextOverlapsSummary =
    cleanContext && cleanSummary &&
    cleanSummary.toLowerCase().includes(cleanContext.toLowerCase().slice(0, 40));

  const parts = [
    cleanSummary ? `Current picture: ${cleanSummary}` : "",
    (cleanContext && !contextOverlapsSummary) ? `Knowledge base: ${cleanContext}` : "",
    cleanOpenPoints ? `Open points: ${cleanOpenPoints}` : "",
  ].filter(Boolean);
  return parts.join("\n") || fallback;
}

app.get("/api/threads/:threadId/recap", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const threadId = req.params.threadId;
  const threadMessages = listMessagesByThreadId(threadId);
  const skipLlm = String(req.query.fast || "") === "1";

  const cached = recapCache.get(threadId);
  if (cached && cached.messageCount === threadMessages.length && (Date.now() - cached.generatedAt) < RECAP_TTL_MS) {
    return res.json(cached.data);
  }

  const recap = buildThreadRecap(threadId);
  const segments =
    threadMessages.length > 0
      ? segmentThreadByStrictTopic(
          threadMessages.map((m) => ({
            userId: m.userId,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        )
      : [];

  const multiTopicThread = segments.length > 1;
  const attachHeuristicSplitSummaries = () => {
    if (!multiTopicThread) return;
    const tracks = buildHeuristicTopicTracksForThread(threadId);
    if (tracks.length > 1) {
      recap.topicTracks = tracks;
    }
  };

  const hasMultipleTopicCards = () =>
    Array.isArray(recap.topicTracks) && recap.topicTracks.length > 1;

  if (skipLlm) {
    attachHeuristicSplitSummaries();
    const fastCaseTracks = buildTopicTracksFromCases(threadId);
    if (fastCaseTracks.length >= 2) {
      recap.topicTracks = fastCaseTracks;
      const lastTrack = fastCaseTracks[fastCaseTracks.length - 1];
      if (lastTrack) {
        recap.caseUpdate = buildCaseUpdateBlock(lastTrack.summary, lastTrack.context || "", lastTrack.openPoints || "", recap.caseUpdate);
        recap.situationSummary = lastTrack.summary || recap.situationSummary;
      }
    }
    recapCache.set(threadId, { data: recap, messageCount: threadMessages.length, generatedAt: Date.now() });
    return res.json(recap);
  }

  if (isLLMConfigured() && threadMessages.length > 0) {
    try {
      const admittedCases = listCases()
        .filter((c) => c.admissionState === "admitted" && c.threadId !== threadId)
        .slice(0, 5)
        .map((c) => `Case #${c.caseNumber}: ${c.title} — ${(c.caseSummary || "").slice(0, 100)}`);

      const llmResult = await generateThreadSummary({
        threadId,
        messages: threadMessages.map((m) => ({
          userId: m.userId,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        existingCaseSummaries: admittedCases.length > 0 ? admittedCases : undefined,
      });

      if (llmResult) {
        recap.caseUpdate = buildCaseUpdateBlock(llmResult.currentPicture, llmResult.context, llmResult.openPoints, recap.caseUpdate);
        recap.situationSummary = stripAllSectionPrefixes(llmResult.currentPicture || "") || recap.situationSummary;

        if (llmResult.emergingThreads.length > 0) {
          recap.emergingThreads = llmResult.emergingThreads;
        }

        const activeIdx = segments.length;
        if (llmResult.topicTracks && llmResult.topicTracks.length > 0) {
          recap.topicTracks = llmResult.topicTracks.map((t) => ({
            topicLabel: t.topicLabel,
            firstPostAt: t.firstPostAt,
            lastPostAt: t.lastPostAt,
            summary: t.summary,
            context: t.context ? t.context : undefined,
            openPoints: t.openPoints ? t.openPoints : undefined,
            isActive: t.segmentIndex === activeIdx,
          }));
        }
      }
    } catch (err) {
      console.error("[recap] LLM enhancement failed, using regex fallback:", err);
    }
  }

  if (multiTopicThread && !hasMultipleTopicCards()) {
    attachHeuristicSplitSummaries();
  }

  const caseDerivedTracks = buildTopicTracksFromCases(threadId);
  if (caseDerivedTracks.length >= 2) {
    recap.topicTracks = caseDerivedTracks;
  }

  if (Array.isArray(recap.topicTracks) && recap.topicTracks.length >= 2) {
    const lastTrack = recap.topicTracks[recap.topicTracks.length - 1];
    if (lastTrack) {
      recap.caseUpdate = buildCaseUpdateBlock(lastTrack.summary, lastTrack.context || "", lastTrack.openPoints || "", recap.caseUpdate);
      recap.situationSummary = lastTrack.summary || recap.situationSummary;
    }
  }

  recapCache.set(threadId, { data: recap, messageCount: threadMessages.length, generatedAt: Date.now() });
  res.json(recap);
});

app.get("/api/threads/:threadId/emerging-strategy", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const keyStrategies = buildThreadKeyStrategies(req.params.threadId);
  res.json(keyStrategies);
});

// Backward-compatible alias while clients migrate.
app.get("/api/threads/:threadId/key-strategies", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const keyStrategies = buildThreadKeyStrategies(req.params.threadId);
  res.json(keyStrategies);
});

// List cases
app.get("/api/cases", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const cases = listCases();
  res.json(cases);
});

app.get("/api/cases/recall", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const q = String(req.query.q || "");
  const rawLimit = Number(req.query.limit || 12);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 12;
  const matches: CaseRecallResult[] = recallCases(q, limit);
  res.json({ query: q, count: matches.length, matches });
});

app.get("/api/persistence/report", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const report = buildPersistenceReport();
  res.json(report);
});

// Direct case intake: freeform narrative -> case memory pipeline.
app.post("/api/cases/intake", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const narrative = String(req.body.narrative ?? "").trim();
  if (!narrative) {
    return res.status(400).json({ error: "narrative is required" });
  }
  const anonymous = Boolean(req.body.anonymous);
  let colonyId = typeof req.body.colonyId === "string" ? req.body.colonyId.trim() : "";
  const colonyCode = typeof req.body.colonyCode === "string" ? req.body.colonyCode.trim().toUpperCase() : "";
  if (!colonyId && colonyCode) {
    const allColonies = await loadAllColonies();
    const found = allColonies.find(c => c.colonyCode === colonyCode);
    if (found) colonyId = found.id;
  }
  try {
    const frogCase = await createCaseFromDirectIntake({
      userId: anonymous ? "anonymous" : actor.username,
      authorDisplayName: anonymous ? "Anonymous" : actor.displayName,
      title: typeof req.body.title === "string" ? req.body.title : undefined,
      narrative,
      threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
    });
    (frogCase as any).anonymous = anonymous;
    (frogCase as any).realUserId = actor.username;
    (frogCase as any).colonyId = colonyId || undefined;

    // Auto-add event to colony when a case is filed about it
    if (colonyId) {
      try {
        const all = await loadAllColonies();
        const colIdx = all.findIndex(c => c.id === colonyId);
        if (colIdx !== -1 && userCanAccessColony(all[colIdx], actor.userId)) {
          const caseEvent: ColonyEvent = {
            id: randomUUID(),
            date: new Date().toISOString().split("T")[0],
            type: "case_opened",
            description: `Case #${frogCase.caseNumber} opened: ${(narrative || "").slice(0, 100)}`,
            addedBy: actor.username,
            linkedCaseId: frogCase.caseId || frogCase.id,
          };
          if (!all[colIdx].events) all[colIdx].events = [];
          all[colIdx].events.unshift(caseEvent);
          all[colIdx].updatedAt = new Date().toISOString();
          await saveAllColonies(all);
        }
      } catch (e) {
        console.warn("[case-intake] Failed to auto-add colony event:", e);
      }
    }

    // Active prior-case surfacing for intake
    let priorCaseInsight: { caseNumber: number; title: string; outcome: string; summary: string } | null = null;
    if (Array.isArray(frogCase.relatedCaseRefs) && frogCase.relatedCaseRefs.length > 0) {
      const top = frogCase.relatedCaseRefs[0];
      priorCaseInsight = {
        caseNumber: top.caseNumber,
        title: top.title,
        outcome: top.outcome,
        summary: `Similar to Case #${top.caseNumber} — ${top.title} (${top.outcome})`,
      };
    } else {
      const matches = recallCases(narrative, 3);
      const strong = matches.find(
        (m) => m.matchScore >= 6 && m.caseId !== (frogCase.caseId || frogCase.id)
      );
      if (strong) {
        priorCaseInsight = {
          caseNumber: strong.caseNumber,
          title: strong.title,
          outcome: strong.status,
          summary: `Related prior case: #${strong.caseNumber} — ${strong.title} (${strong.status})`,
        };
      }
    }

    return res.json({
      ok: true,
      caseId: frogCase.caseId || frogCase.id,
      caseNumber: frogCase.caseNumber,
      threadId: frogCase.threadId,
      title: frogCase.title,
      admissionState: frogCase.admissionState,
      colonyId: colonyId || undefined,
      frogCase,
      priorCaseInsight,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create direct intake case";
    return res.status(400).json({ error: message });
  }
});

// Submit resolution
app.post("/api/cases/:id/resolution", async (req, res) => {
  try {
    const actor = getActorFromRequest(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
    const rawOutcome = String(req.body.outcome ?? "").toUpperCase();
    const mappedOutcome: CaseStatus =
      rawOutcome === "RESOLVED"
        ? "RESOLVED"
        : rawOutcome === "PARTIAL" || rawOutcome === "MONITORING"
          ? "MONITORING"
          : "OPEN";

    const input: ResolutionInput = {
      caseId: req.params.id,
      userId: actor.username,
      outcome: mappedOutcome,
      freeText: req.body.freeText,
    };

    const updated = await submitCaseResolution(input);
    if (!updated) return res.status(404).json({ error: "Case not found" });
    res.json(updated);
  } catch (err) {
    console.error("[POST /api/cases/:id/resolution] Error:", err);
    const msg = err instanceof Error ? err.message : "Resolution failed";
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/api/cases/:id/follow-up-prompt", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const prompt = getCaseFollowUpPrompt(req.params.id);
  if (prompt === null) {
    const frogCase = getCaseById(req.params.id);
    if (!frogCase) return res.status(404).json({ error: "Case not found" });
    return res.json({ prompt: null, status: frogCase.status });
  }
  return res.json({ prompt, status: "active" });
});

app.post("/api/cases/:id/follow-up", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const rawStatus = String(req.body.status ?? "").toUpperCase();
  const mappedStatus: CaseStatus | undefined =
    rawStatus === "RESOLVED"
      ? "RESOLVED"
      : rawStatus === "MONITORING" || rawStatus === "PARTIAL"
        ? "MONITORING"
        : rawStatus === "OPEN"
          ? "OPEN"
          : undefined;

  const input: FollowUpInput = {
    caseId: req.params.id,
    userId: actor.username,
    responseText: String(req.body.responseText ?? ""),
    status: mappedStatus,
  };

  try {
    const updated = await submitCaseFollowUp(input);
    if (!updated) return res.status(404).json({ error: "Case not found" });
    return res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid follow-up payload";
    return res.status(400).json({ error: message });
  }
});

// Single case
app.get("/api/cases/:id", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  if (req.params.id === "recall") {
    const q = String(req.query.q || "");
    const rawLimit = Number(req.query.limit || 12);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 12;
    const matches: CaseRecallResult[] = recallCases(q, limit);
    return res.json({ query: q, count: matches.length, matches });
  }
  const frogCase = getCaseById(req.params.id);
  if (!frogCase) return res.status(404).json({ error: "Case not found" });
  res.json(frogCase);
});

app.get("/api/cases/number/:caseNumber", (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const caseNumber = Number(req.params.caseNumber);
  const frogCase = getCaseByNumber(caseNumber);
  if (!frogCase) return res.status(404).json({ error: "Case not found" });
  return res.json(frogCase);
});

// ─── Colony Register + Management (shared access, gated invitation) ─────────
type ColonyEventType = "import" | "export" | "water_change" | "equipment" | "feeding" | "treatment" | "observation" | "incident" | "procedure" | "system_change" | "case_opened" | "note";
type ColonyStatus = "stable" | "recovering" | "concern" | "active_problem" | "new_setup";

interface ColonyEvent {
  id: string;
  date: string;
  type: ColonyEventType;
  description: string;
  addedBy?: string;
  linkedCaseId?: string;
}

interface ColonyStatusEntry {
  id: string;
  date: string;
  status: ColonyStatus;
  note?: string;
  changedBy?: string;
  linkedCaseId?: string;
}

interface Colony {
  id: string;
  colonyCode: string;
  ownerId: string;
  authorizedUsers: string[];
  pendingInvites: string[];
  name: string;
  systemId?: string;
  species?: string;
  system: string;
  institution?: string;
  waterSource?: string;
  bufferingApproach?: string;
  typicalDensity?: string;
  typicalTemp?: string;
  facilityLocation?: string;
  count: string;
  notes: string;
  currentStatus: ColonyStatus;
  events: ColonyEvent[];
  statusHistory: ColonyStatusEntry[];
  createdAt: string;
  updatedAt: string;
}

function generateColonyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const p1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const p2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${p1}-${p2}`;
}

const COLONIES_REDIS_KEY = "frog-social:colonies-all";

async function loadAllColonies(): Promise<Colony[]> {
  const data = await redisGet<Colony[]>(COLONIES_REDIS_KEY);
  return Array.isArray(data) ? data : [];
}

async function saveAllColonies(colonies: Colony[]): Promise<void> {
  await redisSet(COLONIES_REDIS_KEY, colonies);
}

function userCanAccessColony(colony: Colony, userId: string): boolean {
  return colony.ownerId === userId || colony.authorizedUsers.includes(userId);
}

function userIsOwner(colony: Colony, userId: string): boolean {
  return colony.ownerId === userId;
}

function getAccessibleColonies(all: Colony[], userId: string): Colony[] {
  return all.filter(c => userCanAccessColony(c, userId));
}

function getPendingInvitesForUser(all: Colony[], userId: string): Colony[] {
  return all.filter(c => c.pendingInvites.includes(userId));
}

// List colonies the user owns or is authorized on + pending invitations
app.get("/api/colonies", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const accessible = getAccessibleColonies(all, actor.userId);
  const pending = getPendingInvitesForUser(all, actor.userId);
  return res.json({ ok: true, colonies: accessible, pendingInvites: pending.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })) });
});

// Create colony (caller becomes owner)
app.post("/api/colonies", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const name = String(req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "Colony name is required" });
  const all = await loadAllColonies();
  let code = generateColonyCode();
  while (all.some(c => c.colonyCode === code)) { code = generateColonyCode(); }
  const now = new Date().toISOString();
  const colony: Colony = {
    id: `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    colonyCode: code,
    ownerId: actor.userId,
    authorizedUsers: [],
    pendingInvites: [],
    name,
    systemId: String(req.body.systemId ?? "").trim() || undefined,
    species: String(req.body.species ?? "").trim() || undefined,
    system: String(req.body.system ?? "").trim(),
    institution: String(req.body.institution ?? "").trim() || undefined,
    waterSource: String(req.body.waterSource ?? "").trim() || undefined,
    bufferingApproach: String(req.body.bufferingApproach ?? "").trim() || undefined,
    typicalDensity: String(req.body.typicalDensity ?? "").trim() || undefined,
    typicalTemp: String(req.body.typicalTemp ?? "").trim() || undefined,
    facilityLocation: String(req.body.facilityLocation ?? "").trim() || undefined,
    count: String(req.body.count ?? "").trim(),
    notes: String(req.body.notes ?? "").trim(),
    currentStatus: "stable",
    events: [],
    statusHistory: [{ id: randomUUID(), date: now, status: "stable", note: "Colony registered", changedBy: actor.userId }],
    createdAt: now,
    updatedAt: now,
  };
  all.unshift(colony);
  await saveAllColonies(all);
  return res.json({ ok: true, colony });
});

// Join a colony by code (self-serve, no owner approval needed)
app.post("/api/colonies/join", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const code = String(req.body.code ?? "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Colony code is required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.colonyCode === code);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found. Check the code and try again." });
  if (userCanAccessColony(all[idx], actor.userId)) return res.status(400).json({ ok: false, error: "You already have access to this colony" });
  all[idx].authorizedUsers.push(actor.userId);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, colony: all[idx], message: `Joined colony: ${all[idx].name}` });
});

// Regenerate colony code (owner only)
app.post("/api/colonies/:id/regenerate-code", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userIsOwner(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Only the owner can regenerate the colony code" });
  let code = generateColonyCode();
  while (all.some(c => c.colonyCode === code)) { code = generateColonyCode(); }
  all[idx].colonyCode = code;
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, colonyCode: code });
});

// Lookup colony by code (for case-intake linking)
app.get("/api/colonies/lookup/:code", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const code = req.params.code.trim().toUpperCase();
  const all = await loadAllColonies();
  const colony = all.find(c => c.colonyCode === code);
  if (!colony) return res.status(404).json({ ok: false, error: "Colony not found" });
  return res.json({ ok: true, colonyId: colony.id, colonyName: colony.name, hasAccess: userCanAccessColony(colony, actor.userId) });
});

// Update colony baseline (owner or authorized)
app.put("/api/colonies/:id", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const idx = all.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });
  const fields = ["name", "systemId", "species", "system", "institution", "waterSource", "bufferingApproach", "typicalDensity", "typicalTemp", "facilityLocation", "count", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      (all[idx] as any)[f] = String(req.body[f]).trim();
    }
  }
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, colony: all[idx] });
});

// Delete colony (owner only)
app.delete("/api/colonies/:id", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const colony = all.find(c => c.id === req.params.id);
  if (!colony) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userIsOwner(colony, actor.userId)) return res.status(403).json({ ok: false, error: "Only the owner can delete a colony" });
  const filtered = all.filter(c => c.id !== req.params.id);
  await saveAllColonies(filtered);
  return res.json({ ok: true });
});

// Invite a user to a colony (owner only)
app.post("/api/colonies/:id/invite", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const username = String(req.body.username ?? "").trim().toLowerCase();
  if (!username) return res.status(400).json({ ok: false, error: "Username is required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userIsOwner(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Only the owner can invite users" });
  if (all[idx].authorizedUsers.includes(username)) return res.status(400).json({ ok: false, error: "User already has access" });
  if (all[idx].pendingInvites.includes(username)) return res.status(400).json({ ok: false, error: "Invitation already pending" });
  all[idx].pendingInvites.push(username);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, message: `Invitation sent to ${username}` });
});

// Accept invitation
app.post("/api/colonies/:id/accept-invite", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  const pendingIdx = all[idx].pendingInvites.indexOf(actor.userId);
  if (pendingIdx === -1) return res.status(400).json({ ok: false, error: "No pending invitation" });
  all[idx].pendingInvites.splice(pendingIdx, 1);
  all[idx].authorizedUsers.push(actor.userId);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, colony: all[idx] });
});

// Remove user access (owner only)
app.post("/api/colonies/:id/remove-user", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const username = String(req.body.username ?? "").trim().toLowerCase();
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userIsOwner(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Only the owner can remove users" });
  all[idx].authorizedUsers = all[idx].authorizedUsers.filter(u => u !== username);
  all[idx].pendingInvites = all[idx].pendingInvites.filter(u => u !== username);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true });
});

// Colony events (owner or authorized)
app.post("/api/colonies/:id/events", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });
  const event: ColonyEvent = {
    id: randomUUID(),
    date: String(req.body.date ?? new Date().toISOString().split("T")[0]),
    type: req.body.type || "note",
    description: String(req.body.description ?? "").trim(),
    addedBy: actor.userId,
    linkedCaseId: req.body.linkedCaseId || undefined,
  };
  if (!event.description) return res.status(400).json({ ok: false, error: "Description is required" });
  if (!all[idx].events) all[idx].events = [];
  all[idx].events.unshift(event);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, event });
});

app.get("/api/colonies/:id/events", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const colony = all.find(c => c.id === req.params.id);
  if (!colony) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(colony, actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });
  return res.json({ ok: true, events: colony.events || [] });
});

// Colony status (owner or authorized)
app.post("/api/colonies/:id/status", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const idx = all.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(all[idx], actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });
  const validStatuses: ColonyStatus[] = ["stable", "recovering", "concern", "active_problem", "new_setup"];
  const status = req.body.status as ColonyStatus;
  if (!validStatuses.includes(status)) return res.status(400).json({ ok: false, error: "Invalid status" });
  const entry: ColonyStatusEntry = {
    id: randomUUID(),
    date: new Date().toISOString(),
    status,
    note: String(req.body.note ?? "").trim() || undefined,
    changedBy: actor.userId,
    linkedCaseId: req.body.linkedCaseId || undefined,
  };
  all[idx].currentStatus = status;
  if (!all[idx].statusHistory) all[idx].statusHistory = [];
  all[idx].statusHistory.unshift(entry);
  all[idx].updatedAt = new Date().toISOString();
  await saveAllColonies(all);
  return res.json({ ok: true, status: entry, colony: all[idx] });
});

// Cases linked to a colony (accessible by owner or authorized)
app.get("/api/colonies/:id/cases", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const colony = all.find(c => c.id === req.params.id);
  if (!colony) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(colony, actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });
  const allCases = listCases();
  const linked = allCases.filter((c: any) => c.colonyId === req.params.id);
  return res.json({ ok: true, cases: linked });
});

// Colony CSV export (owner or authorized; supports token via query param)
app.get("/api/colonies/:id/export", async (req, res) => {
  let actor = getActorFromRequest(req);
  if (!actor && typeof req.query.token === "string") {
    const payload = verifyToken(req.query.token);
    if (payload) actor = payload;
  }
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  const all = await loadAllColonies();
  const colony = all.find(c => c.id === req.params.id);
  if (!colony) return res.status(404).json({ ok: false, error: "Colony not found" });
  if (!userCanAccessColony(colony, actor.userId)) return res.status(403).json({ ok: false, error: "Access denied" });

  const lines: string[] = [];
  lines.push("Section,Field,Value");
  lines.push(`Baseline,Name,"${colony.name}"`);
  lines.push(`Baseline,System ID,"${colony.systemId || ""}"`);
  lines.push(`Baseline,Species,"${colony.species || ""}"`);
  lines.push(`Baseline,System Type,"${colony.system || ""}"`);
  lines.push(`Baseline,Water Source,"${colony.waterSource || ""}"`);
  lines.push(`Baseline,Buffering,"${colony.bufferingApproach || ""}"`);
  lines.push(`Baseline,Typical Density,"${colony.typicalDensity || ""}"`);
  lines.push(`Baseline,Typical Temp,"${colony.typicalTemp || ""}"`);
  lines.push(`Baseline,Location,"${colony.facilityLocation || ""}"`);
  lines.push(`Baseline,Approx Count,"${colony.count || ""}"`);
  lines.push(`Baseline,Current Status,"${colony.currentStatus || ""}"`);
  lines.push(`Baseline,Notes,"${(colony.notes || "").replace(/"/g, '""')}"`);
  lines.push(`Baseline,Owner,"${colony.ownerId}"`);
  lines.push(`Baseline,Authorized Users,"${colony.authorizedUsers.join(", ")}"`);
  lines.push("");
  lines.push("Date,Event Type,Description,Added By,Linked Case");
  for (const ev of (colony.events || [])) {
    lines.push(`${ev.date},"${ev.type}","${(ev.description || "").replace(/"/g, '""')}","${ev.addedBy || ""}","${ev.linkedCaseId || ""}"`);
  }
  lines.push("");
  lines.push("Date,Status,Note,Changed By,Linked Case");
  for (const st of (colony.statusHistory || [])) {
    lines.push(`${st.date},"${st.status}","${(st.note || "").replace(/"/g, '""')}","${st.changedBy || ""}","${st.linkedCaseId || ""}"`);
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${colony.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.csv"`);
  return res.send(lines.join("\n"));
});

app.post("/api/admin/reset", async (req, res) => {
  const actor = getActorFromRequest(req);
  if (!actor) return res.status(401).json({ ok: false, error: "Authentication required" });
  try {
    const result = await resetAllState();
    console.log("[admin/reset] State cleared:", result.cleared);
    res.json({ ok: true, cleared: result.cleared });
  } catch (err) {
    console.error("[admin/reset] Failed:", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default app;

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Frog Social backend listening on port ${PORT}`);
  });
}

