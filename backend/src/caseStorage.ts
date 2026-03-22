import fs from "node:fs";
import path from "node:path";
import type { FrogCase } from "./frogCases";
import { isRedisConfigured, redisGet, redisSet } from "./redisStorage";

const REDIS_KEY = "frog-social:cases";

interface SerializedFrogCase extends Omit<FrogCase, "createdAt" | "updatedAt" | "followUpDueAt" | "lastFollowUpSentAt"> {
  createdAt: string;
  updatedAt: string;
  followUpDueAt: string | null;
  lastFollowUpSentAt: string | null;
}

function getCasesFilePath(): string {
  const customDataDir = String(process.env.FROG_SOCIAL_DATA_DIR || "").trim();
  if (customDataDir) {
    return path.join(customDataDir, "cases.json");
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "frog-social-data", "cases.json");
  }
  const projectRoot = path.resolve(__dirname, "..");
  return path.join(projectRoot, "data", "cases.json");
}

function ensureCasesDataDir() {
  const casesFile = getCasesFilePath();
  const dir = path.dirname(casesFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function serializeCase(frogCase: FrogCase): SerializedFrogCase {
  return {
    ...frogCase,
    createdAt: frogCase.createdAt.toISOString(),
    updatedAt: frogCase.updatedAt.toISOString(),
    followUpDueAt: frogCase.followUpDueAt ? frogCase.followUpDueAt.toISOString() : null,
    lastFollowUpSentAt: frogCase.lastFollowUpSentAt ? frogCase.lastFollowUpSentAt.toISOString() : null,
  };
}

function deserializeCase(serialized: SerializedFrogCase): FrogCase {
  return {
    ...serialized,
    createdAt: new Date(serialized.createdAt),
    updatedAt: new Date(serialized.updatedAt),
    followUpDueAt: serialized.followUpDueAt ? new Date(serialized.followUpDueAt) : null,
    lastFollowUpSentAt: serialized.lastFollowUpSentAt ? new Date(serialized.lastFollowUpSentAt) : null,
  };
}

function readCasesFromFile(filePath: string): FrogCase[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as SerializedFrogCase[];
  if (!Array.isArray(parsed)) return [];
  return parsed.map(deserializeCase);
}

function mergeById(local: SerializedFrogCase[], remote: SerializedFrogCase[]): SerializedFrogCase[] {
  const byId = new Map<string, SerializedFrogCase>();
  for (const c of remote) byId.set(c.id, c);
  for (const c of local) {
    const existing = byId.get(c.id);
    if (!existing || new Date(c.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function loadCasesFromDisk(): Promise<FrogCase[]> {
  if (isRedisConfigured()) {
    const stored = await redisGet<SerializedFrogCase[]>(REDIS_KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      console.log(`[caseStorage] Loaded ${stored.length} cases from Redis`);
      return stored.map(deserializeCase);
    }
  }
  try {
    const filePath = getCasesFilePath();
    const primary = readCasesFromFile(filePath);
    if (primary.length > 0) return primary;
    return [];
  } catch {
    return [];
  }
}

export async function saveCasesToDisk(frogCases: FrogCase[]): Promise<void> {
  const localSerialized = frogCases.map(serializeCase);
  if (isRedisConfigured()) {
    try {
      const remote = await redisGet<SerializedFrogCase[]>(REDIS_KEY);
      const merged = mergeById(localSerialized, Array.isArray(remote) ? remote : []);
      const ok = await redisSet(REDIS_KEY, merged);
      if (ok) {
        console.log(`[caseStorage] Saved ${merged.length} cases to Redis (merged)`);
      }
    } catch (err) {
      console.error("[caseStorage] Redis save failed:", err);
    }
  }
  try {
    ensureCasesDataDir();
    const filePath = getCasesFilePath();
    fs.writeFileSync(filePath, JSON.stringify(localSerialized, null, 2));
  } catch (err) {
    console.warn("[caseStorage] File write failed (non-fatal if Redis is primary):", err);
  }
}
