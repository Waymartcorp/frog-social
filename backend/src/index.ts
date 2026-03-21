// src/index.ts

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import {
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

      if (isLocalhost) {
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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "Frog Social backend running" });
});

// "Describe a problem" → create message + maybe new case
app.post("/api/messages", (req, res) => {
  const now = new Date();

  const message: ForumMessage = {
    id: randomUUID(),
    userId: req.body.userId || "demo-user",
    facilityId: req.body.facilityId,
    threadId: req.body.threadId || randomUUID(), // new thread if none provided
    content: req.body.content,
    createdAt: now,
    role: req.body.role,
    correctionSignal: Boolean(req.body.correctionSignal),
  };

  const frogCase = handleNewMessage(message);
  res.json({ ok: true, threadId: message.threadId, messageId: message.id, frogCase });
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

app.get("/api/threads/:threadId/recap", (req, res) => {
  const recap = buildThreadRecap(req.params.threadId);
  console.log("RECAP DEBUG", Object.keys(recap), recap.suggestedNextSteps);
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
app.post("/api/cases/intake", (req, res) => {
  const narrative = String(req.body.narrative ?? "").trim();
  if (!narrative) {
    return res.status(400).json({ error: "narrative is required" });
  }
  try {
    const frogCase = createCaseFromDirectIntake({
      userId: String(req.body.userId || "demo-user"),
      title: typeof req.body.title === "string" ? req.body.title : undefined,
      narrative,
      threadId: typeof req.body.threadId === "string" ? req.body.threadId : undefined,
    });
    return res.json({
      ok: true,
      caseId: frogCase.caseId || frogCase.id,
      threadId: frogCase.threadId,
      admissionState: frogCase.admissionState,
      frogCase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create direct intake case";
    return res.status(400).json({ error: message });
  }
});

// Submit resolution
app.post("/api/cases/:id/resolution", (req, res) => {
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

  const updated = submitCaseResolution(input);
  if (!updated) return res.status(404).json({ error: "Case not found" });
  res.json(updated);
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

app.post("/api/cases/:id/follow-up", (req, res) => {
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
    const updated = submitCaseFollowUp(input);
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Frog Social backend listening on port ${PORT}`);
});

