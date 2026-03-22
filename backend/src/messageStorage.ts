import fs from "node:fs";
import path from "node:path";
import type { ForumMessage } from "./frogCases";
import { isRedisConfigured, redisGet, redisSet } from "./redisStorage";

const REDIS_KEY = "frog-social:messages";

interface SerializedForumMessage extends Omit<ForumMessage, "createdAt"> {
  createdAt: string;
}

function getMessagesFilePath(): string {
  const customDataDir = String(process.env.FROG_SOCIAL_DATA_DIR || "").trim();
  if (customDataDir) {
    return path.join(customDataDir, "messages.json");
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "frog-social-data", "messages.json");
  }
  const projectRoot = path.resolve(__dirname, "..");
  return path.join(projectRoot, "data", "messages.json");
}

function ensureMessagesDataDir() {
  const messagesFile = getMessagesFilePath();
  const dir = path.dirname(messagesFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function serializeMessage(message: ForumMessage): SerializedForumMessage {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
  };
}

function deserializeMessage(serialized: SerializedForumMessage): ForumMessage {
  return {
    ...serialized,
    createdAt: new Date(serialized.createdAt),
  };
}

function readMessagesFromFile(filePath: string): ForumMessage[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as SerializedForumMessage[];
  if (!Array.isArray(parsed)) return [];
  return parsed.map(deserializeMessage);
}

export async function loadMessagesFromDisk(): Promise<ForumMessage[]> {
  if (isRedisConfigured()) {
    const stored = await redisGet<SerializedForumMessage[]>(REDIS_KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      console.log(`[messageStorage] Loaded ${stored.length} messages from Redis`);
      return stored.map(deserializeMessage);
    }
  }
  try {
    const filePath = getMessagesFilePath();
    const primary = readMessagesFromFile(filePath);
    if (primary.length > 0) return primary;
    return [];
  } catch {
    return [];
  }
}

export async function saveMessagesToDisk(messages: ForumMessage[]): Promise<void> {
  const serialized = messages.map(serializeMessage);
  if (isRedisConfigured()) {
    const ok = await redisSet(REDIS_KEY, serialized);
    if (ok) {
      console.log(`[messageStorage] Saved ${messages.length} messages to Redis`);
    }
  }
  try {
    ensureMessagesDataDir();
    const filePath = getMessagesFilePath();
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
  } catch (err) {
    console.warn("[messageStorage] File write failed (non-fatal if Redis is primary):", err);
  }
}
