import fs from "node:fs";
import path from "node:path";
import type { ForumMessage } from "./frogCases";

interface SerializedForumMessage extends Omit<ForumMessage, "createdAt"> {
  createdAt: string;
}

function getMessagesFilePath(): string {
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

export function loadMessagesFromDisk(): ForumMessage[] {
  try {
    const filePath = getMessagesFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SerializedForumMessage[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(deserializeMessage);
  } catch {
    return [];
  }
}

export function saveMessagesToDisk(messages: ForumMessage[]) {
  ensureMessagesDataDir();
  const filePath = getMessagesFilePath();
  const serialized = messages.map(serializeMessage);
  fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
}

