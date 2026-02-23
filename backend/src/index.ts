// src/index.ts

import express from "express";
import bodyParser from "body-parser";
import { randomUUID } from "crypto";
import {
  handleNewMessage,
  listCases,
  getCaseById,
  submitCaseResolution,
  type ForumMessage,
  type ResolutionInput,
} from "./frogCases";

const app = express();
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
  };

  const frogCase = handleNewMessage(message);
  res.json({ ok: true, frogCase });
});

// List cases
app.get("/api/cases", (req, res) => {
  const cases = listCases();
  res.json(cases);
});

// Single case
app.get("/api/cases/:id", (req, res) => {
  const frogCase = getCaseById(req.params.id);
  if (!frogCase) return res.status(404).json({ error: "Case not found" });
  res.json(frogCase);
});

// Submit resolution
app.post("/api/cases/:id/resolution", (req, res) => {
  const input: ResolutionInput = {
    caseId: req.params.id,
    userId: req.body.userId || "demo-user",
    outcome: req.body.outcome,
    freeText: req.body.freeText,
  };

  const updated = submitCaseResolution(input);
  if (!updated) return res.status(404).json({ error: "Case not found" });
  res.json(updated);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Frog Social backend listening on port ${PORT}`);
});

