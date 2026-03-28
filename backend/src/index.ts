// src/index.ts

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import path from "node:path";
import { isLLMConfigured, generateThreadSummary, segmentThreadByStrictTopic } from "./llmSummary";
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
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(bodyParser.json());
app.use(express.static(path.resolve(__dirname, "..", "..")));

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

// "Describe a problem" → create message + maybe new case
app.post("/api/messages", async (req, res) => {
  try {
    const now = new Date();
    const message: ForumMessage = {
      id: randomUUID(),
      userId: req.body.userId || "demo-user",
      facilityId: req.body.facilityId,
      threadId: req.body.threadId || randomUUID(),
      content: req.body.content,
      createdAt: now,
      role: req.body.role,
      correctionSignal: Boolean(req.body.correctionSignal),
    };
    const frogCase = await handleNewMessage(message);
    res.json({ ok: true, threadId: message.threadId, messageId: message.id, frogCase });
  } catch (err) {
    console.error("[POST /api/messages] Error:", err);
    const msg = err instanceof Error ? err.message : "Failed to process message";
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/api/messages", (req, res) => {
  const rawLimit = Number(req.query.limit || 200);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 200;
  const rows = listAllMessages(limit);
  res.json(rows);
});

app.get("/api/feed/summary", (req, res) => {
  const recap = buildGlobalFeedRecap(120);
  res.json({
    generatedAt: new Date().toISOString(),
    recap,
  });
});

app.get("/api/feed/similar-cases", (req, res) => {
  const rawLimit = Number(req.query.limit || 8);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.floor(rawLimit))) : 8;
  const payload = findSimilarCasesForFeed(limit);
  res.json(payload);
});

app.get("/api/threads/:threadId/messages", (req, res) => {
  const messages = listMessagesByThreadId(req.params.threadId);
  res.json(messages);
});

app.get("/api/threads/:threadId/case", (req, res) => {
  const frogCase = getCaseByThreadId(req.params.threadId);
  if (!frogCase) {
    return res.json(null);
  }
  return res.json(frogCase);
});

app.get("/api/threads/:threadId/verify", (req, res) => {
  const report = buildThreadVerificationReport(req.params.threadId);
  return res.json(report);
});

app.get("/api/threads/:threadId/similar-cases", (req, res) => {
  const rawLimit = Number(req.query.limit || 6);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.floor(rawLimit))) : 6;
  const payload = findSimilarCasesForThread(req.params.threadId, limit);
  return res.json(payload);
});

app.get("/api/threads/:threadId/recap", async (req, res) => {
  const threadId = req.params.threadId;
  const recap = buildThreadRecap(threadId);
  /** Skip OpenAI for instant regex/heuristic recap (client shows this first, then upgrades). */
  const skipLlm = String(req.query.fast || "") === "1";

  const threadMessages = listMessagesByThreadId(threadId);
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
        recap.caseUpdate = [
          lastTrack.summary ? `Current picture: ${lastTrack.summary}` : "",
          lastTrack.context ? `Knowledge base: ${lastTrack.context}` : "",
          lastTrack.openPoints ? `Open points: ${lastTrack.openPoints}` : "",
        ].filter(Boolean).join("\n") || recap.caseUpdate;
        recap.situationSummary = lastTrack.summary || recap.situationSummary;
      }
    }
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
        recap.caseUpdate = [
          llmResult.currentPicture ? `Current picture: ${llmResult.currentPicture}` : "",
          llmResult.context ? `Knowledge base: ${llmResult.context}` : "",
          llmResult.openPoints ? `Open points: ${llmResult.openPoints}` : "",
        ].filter(Boolean).join("\n") || recap.caseUpdate;

        recap.situationSummary = llmResult.currentPicture || recap.situationSummary;

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

  /** Mixed-topic threads must not show one merged slab if LLM omitted topicTracks. */
  if (multiTopicThread && !hasMultipleTopicCards()) {
    attachHeuristicSplitSummaries();
  }

  /** If this thread has 2+ formal case records, override topicTracks with case-derived tracks. */
  const caseDerivedTracks = buildTopicTracksFromCases(threadId);
  if (caseDerivedTracks.length >= 2) {
    recap.topicTracks = caseDerivedTracks;
  }

  /** When topicTracks exist, rewrite top-level fields from the last track to prevent cross-segment leaking. */
  if (Array.isArray(recap.topicTracks) && recap.topicTracks.length >= 2) {
    const lastTrack = recap.topicTracks[recap.topicTracks.length - 1];
    if (lastTrack) {
      recap.caseUpdate = [
        lastTrack.summary ? `Current picture: ${lastTrack.summary}` : "",
        lastTrack.context ? `Knowledge base: ${lastTrack.context}` : "",
        lastTrack.openPoints ? `Open points: ${lastTrack.openPoints}` : "",
      ].filter(Boolean).join("\n") || recap.caseUpdate;
      recap.situationSummary = lastTrack.summary || recap.situationSummary;
    }
  }

  res.json(recap);
});

app.get("/api/threads/:threadId/emerging-strategy", (req, res) => {
  const keyStrategies = buildThreadKeyStrategies(req.params.threadId);
  res.json(keyStrategies);
});

// Backward-compatible alias while clients migrate.
app.get("/api/threads/:threadId/key-strategies", (req, res) => {
  const keyStrategies = buildThreadKeyStrategies(req.params.threadId);
  res.json(keyStrategies);
});

// List cases
app.get("/api/cases", (req, res) => {
  const cases = listCases();
  res.json(cases);
});

app.get("/api/cases/recall", (req, res) => {
  const q = String(req.query.q || "");
  const rawLimit = Number(req.query.limit || 12);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit))) : 12;
  const matches: CaseRecallResult[] = recallCases(q, limit);
  res.json({ query: q, count: matches.length, matches });
});

app.get("/api/persistence/report", (req, res) => {
  const report = buildPersistenceReport();
  res.json(report);
});

// Direct case intake: freeform narrative -> case memory pipeline.
app.post("/api/cases/intake", async (req, res) => {
  const narrative = String(req.body.narrative ?? "").trim();
  if (!narrative) {
    return res.status(400).json({ error: "narrative is required" });
  }
  try {
    const frogCase = await createCaseFromDirectIntake({
      userId: String(req.body.userId || "demo-user"),
      title: typeof req.body.title === "string" ? req.body.title : undefined,
      narrative,
      threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
    });
    return res.json({
      ok: true,
      caseId: frogCase.caseId || frogCase.id,
      caseNumber: frogCase.caseNumber,
      threadId: frogCase.threadId,
      title: frogCase.title,
      admissionState: frogCase.admissionState,
      frogCase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create direct intake case";
    return res.status(400).json({ error: message });
  }
});

// Submit resolution
app.post("/api/cases/:id/resolution", async (req, res) => {
  try {
    const rawOutcome = String(req.body.outcome ?? "").toUpperCase();
    const mappedOutcome: CaseStatus =
      rawOutcome === "RESOLVED"
        ? "RESOLVED"
        : rawOutcome === "PARTIAL" || rawOutcome === "MONITORING"
          ? "MONITORING"
          : "OPEN";

    const input: ResolutionInput = {
      caseId: req.params.id,
      userId: req.body.userId || "demo-user",
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
  const prompt = getCaseFollowUpPrompt(req.params.id);
  if (prompt === null) {
    const frogCase = getCaseById(req.params.id);
    if (!frogCase) return res.status(404).json({ error: "Case not found" });
    return res.json({ prompt: null, status: frogCase.status });
  }
  return res.json({ prompt, status: "active" });
});

app.post("/api/cases/:id/follow-up", async (req, res) => {
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
    userId: req.body.userId || "demo-user",
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
  const caseNumber = Number(req.params.caseNumber);
  const frogCase = getCaseByNumber(caseNumber);
  if (!frogCase) return res.status(404).json({ error: "Case not found" });
  return res.json(frogCase);
});

app.post("/api/admin/reset", async (_req, res) => {
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

