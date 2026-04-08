import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { redisGet, redisSet } from "./redisStorage";

const REDIS_USERS_KEY = "frog-social:users";
const JWT_SECRET = process.env.FROG_JWT_SECRET || "frog-social-beta-secret-2026";
const TOKEN_EXPIRY = "30d";

export type VerificationStatus = "verified" | "pending_review" | "unverified";

export interface FrogUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role?: string;
  institution?: string;
  verificationStatus: VerificationStatus;
  tosAcceptedAt?: string;
  createdAt: string;
}

const ACADEMIC_TLDS: string[] = [
  ".edu",
  ".ac.uk", ".ac.jp", ".ac.kr", ".ac.nz", ".ac.za", ".ac.il", ".ac.in",
  ".ac.at", ".ac.be", ".ac.th", ".ac.id", ".ac.ke", ".ac.tz", ".ac.ug",
  ".ac.rw", ".ac.ir", ".ac.cn", ".ac.bd",
  ".edu.au", ".edu.cn", ".edu.br", ".edu.mx", ".edu.sg", ".edu.hk",
  ".edu.tw", ".edu.pl", ".edu.ar", ".edu.co", ".edu.pe", ".edu.ec",
  ".edu.uy", ".edu.pk", ".edu.my", ".edu.ph", ".edu.vn", ".edu.ng",
  ".edu.gh", ".edu.et", ".edu.eg", ".edu.za", ".edu.tr", ".edu.sa",
  ".edu.qa", ".edu.lb", ".edu.jo",
  ".uni-", ".univ-",
  ".uu.se", ".lu.se", ".gu.se", ".su.se", ".liu.se", ".kth.se",
  ".gov",
];

export function classifyEmailDomain(email: string): VerificationStatus {
  const lower = email.trim().toLowerCase();
  const domain = lower.split("@")[1] || "";
  for (const tld of ACADEMIC_TLDS) {
    if (domain.endsWith(tld) || domain.includes(tld)) return "verified";
  }
  return "pending_review";
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  displayName: string;
}

async function loadUsers(): Promise<FrogUser[]> {
  const data = await redisGet<FrogUser[]>(REDIS_USERS_KEY);
  return Array.isArray(data) ? data : [];
}

async function saveUsers(users: FrogUser[]): Promise<void> {
  await redisSet(REDIS_USERS_KEY, users);
}

function generateId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  role?: string,
  institution?: string,
  tosAccepted?: boolean,
): Promise<{ user: Omit<FrogUser, "passwordHash">; token: string }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password || password.length < 6) {
    throw new Error("Email and password (min 6 chars) are required.");
  }
  if (!displayName.trim()) {
    throw new Error("Display name is required.");
  }
  if (!tosAccepted) {
    throw new Error("You must accept the Terms of Service to create an account.");
  }

  const verificationStatus = classifyEmailDomain(trimmedEmail);
  if (verificationStatus === "pending_review" && !institution?.trim()) {
    throw new Error("Institution name is required for non-academic email addresses.");
  }

  const users = await loadUsers();
  if (users.some((u) => u.email === trimmedEmail)) {
    throw new Error("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser: FrogUser = {
    id: generateId(),
    email: trimmedEmail,
    displayName: displayName.trim(),
    passwordHash,
    role: role?.trim() || undefined,
    institution: institution?.trim() || undefined,
    verificationStatus,
    tosAcceptedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  await saveUsers(users);

  const token = signToken(newUser);
  const { passwordHash: _, ...safeUser } = newUser;
  return { user: safeUser, token };
}

export async function logIn(
  email: string,
  password: string,
): Promise<{ user: Omit<FrogUser, "passwordHash">; token: string }> {
  const trimmedEmail = email.trim().toLowerCase();
  const users = await loadUsers();
  const user = users.find((u) => u.email === trimmedEmail);
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password.");
  }

  const token = signToken(user);
  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser, token };
}

export async function getUserById(userId: string): Promise<Omit<FrogUser, "passwordHash"> | null> {
  const users = await loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

export async function listUsers(): Promise<Array<Omit<FrogUser, "passwordHash">>> {
  const users = await loadUsers();
  return users.map(({ passwordHash: _, ...rest }) => rest);
}

function signToken(user: FrogUser): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}
