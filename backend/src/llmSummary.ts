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
  if (!key.startsWith("sk-")) return null;
  openai = new OpenAI({ apiKey: key });
  return openai;
}

export function isLLMConfigured(): boolean {
  const raw = process.env.OPENAI_API_KEY;
  if (!raw) return false;
  return stripQuotes(raw).startsWith("sk-");
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

export interface LLMSummaryResult {
  currentPicture: string;
  context: string;
  openPoints: string;
  emergingThreads: string[];
  isQuestion: boolean;
  questionTopic: string;
}

const SYSTEM_PROMPT = `You are the intelligence engine for Frog Social, a Xenopus husbandry discussion platform.

Your job: read the conversation posts and produce a concise, accurate summary. You have access to a husbandry knowledge base below.

RULES:
- Summarize ONLY what people actually said. Never invent information.
- If a post is a question (not a problem report), identify it as a question and state the topic.
- If a post describes a real husbandry problem, identify the symptoms, context, and what's still unknown.
- Use the knowledge base to add relevant context ONLY when it directly applies to what was discussed.
- Do NOT inject unrelated husbandry topics. If someone asks about feeding training, do not mention water chemistry or flow/nozzle.
- Be concise. Field-note style. No AI phrasing like "it appears that" or "this suggests."
- If there is not enough information for a meaningful summary, say so plainly.

Respond with JSON only (no markdown fences):
{
  "currentPicture": "1-2 sentence summary of what is being discussed",
  "context": "relevant background from the discussion or knowledge base, or empty string",
  "openPoints": "what is still unknown or unanswered, or empty string",
  "emergingThreads": ["theme 1", "theme 2"],
  "isQuestion": true/false,
  "questionTopic": "the topic of the question, or empty string"
}`;

export async function generateThreadSummary(input: LLMSummaryInput): Promise<LLMSummaryResult | null> {
  const client = getClient();
  if (!client) return null;

  const knowledge = loadKnowledgeBase();
  const postBlock = input.messages
    .map((m) => `[${m.userId}]: ${m.content}`)
    .join("\n\n");

  const caseContext = input.existingCaseSummaries?.length
    ? `\n\nRelated stored cases:\n${input.existingCaseSummaries.join("\n")}`
    : "";

  const userMessage = `Thread: ${input.threadId}\n\nPosts:\n${postBlock}${caseContext}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n--- HUSBANDRY KNOWLEDGE BASE ---\n${knowledge}` },
        { role: "user", content: userMessage },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as LLMSummaryResult;
    return {
      currentPicture: String(parsed.currentPicture || ""),
      context: String(parsed.context || ""),
      openPoints: String(parsed.openPoints || ""),
      emergingThreads: Array.isArray(parsed.emergingThreads) ? parsed.emergingThreads.map(String) : [],
      isQuestion: Boolean(parsed.isQuestion),
      questionTopic: String(parsed.questionTopic || ""),
    };
  } catch (err) {
    console.error("[llmSummary] LLM call failed:", err);
    return null;
  }
}
