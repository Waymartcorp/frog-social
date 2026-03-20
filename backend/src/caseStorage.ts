import fs from "node:fs";
import path from "node:path";
import type { FrogCase } from "./frogCases";

interface SerializedFrogCase extends Omit<FrogCase, "createdAt" | "updatedAt" | "followUpDueAt" | "lastFollowUpSentAt"> {
  createdAt: string;
  updatedAt: string;
  followUpDueAt: string | null;
  lastFollowUpSentAt: string | null;
}

function getCasesFilePath(): string {
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

export function loadCasesFromDisk(): FrogCase[] {
  try {
    const filePath = getCasesFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SerializedFrogCase[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(deserializeCase);
  } catch {
    return [];
  }
}

export function saveCasesToDisk(frogCases: FrogCase[]) {
  ensureCasesDataDir();
  const filePath = getCasesFilePath();
  const serialized = frogCases.map(serializeCase);
  fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
}

