// src/index.ts

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { randomUUID } from "crypto";
import {
  handleNewMessage,
  listCases,
  getCaseById,
  getCaseByThreadId,
  submitCaseResolution,
  submitCaseFollowUp,
  getCaseFollowUpPrompt,
  buildThreadRecap,
  buildThreadKeyStrategies,
  buildThreadVerificationReport,
  buildPersistenceReport,
  listMessagesByThreadId,
  type CaseStatus,
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

app.get("/api/persistence/report", (req, res) => {
  const report = buildPersistenceReport();
  res.json(report);
});

// Single case
app.get("/api/cases/:id", (req, res) => {
  const frogCase = getCaseById(req.params.id);
  if (!frogCase) return res.status(404).json({ error: "Case not found" });
  res.json(frogCase);
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Frog Social backend listening on port ${PORT}`);
});

