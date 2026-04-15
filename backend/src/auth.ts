import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { redisGet, redisSet } from "./redisStorage";

const REDIS_USERS_KEY = "frog-social:users";
const JWT_SECRET = process.env.FROG_JWT_SECRET || "frog-social-beta-secret-2026";
const TOKEN_EXPIRY = "30d";

export type VerificationStatus = "verified" | "pending_review" | "unverified";

export interface FrogUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role?: string;
  institution?: string;
  avatarBase64?: string;
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

const BETA_ALLOWLIST: string[] = (process.env.FROG_BETA_ALLOWLIST || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function classifyEmailDomain(email: string): VerificationStatus {
  const lower = email.trim().toLowerCase();
  if (BETA_ALLOWLIST.includes(lower)) return "verified";
  const domain = lower.split("@")[1] || "";
  for (const tld of ACADEMIC_TLDS) {
    if (domain.endsWith(tld) || domain.includes(tld)) return "verified";
  }
  return "pending_review";
}

export function isAllowlistedEmail(email: string): boolean {
  return BETA_ALLOWLIST.includes(email.trim().toLowerCase());
}

export interface AuthTokenPayload {
  userId: string;
  username: string;
  email: string;
  displayName: string;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const users = await loadUsers();
  return users.some((u) => u.username === username.trim().toLowerCase());
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

const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const MAX_AVATAR_BYTES = 150_000;

export async function signUp(opts: {
  email: string;
  password: string;
  username: string;
  displayName: string;
  role?: string;
  institution?: string;
  avatarBase64?: string;
  tosAccepted?: boolean;
}): Promise<{ user: Omit<FrogUser, "passwordHash">; token: string }> {
  const trimmedEmail = opts.email.trim().toLowerCase();
  const username = opts.username.trim().toLowerCase();

  if (!trimmedEmail || !opts.password || opts.password.length < 6) {
    throw new Error("Email and password (min 6 chars) are required.");
  }
  if (!username || !USERNAME_REGEX.test(username)) {
    throw new Error("Username must be 3–30 characters: lowercase letters, numbers, dots, hyphens, underscores.");
  }
  if (!opts.displayName.trim()) {
    throw new Error("Display name is required.");
  }
  if (!opts.tosAccepted) {
    throw new Error("You must accept the Terms of Service to create an account.");
  }

  if (opts.avatarBase64 && opts.avatarBase64.length > MAX_AVATAR_BYTES * 1.37) {
    throw new Error("Profile photo is too large (max ~150 KB).");
  }

  const verificationStatus = classifyEmailDomain(trimmedEmail);
  const allowlisted = isAllowlistedEmail(trimmedEmail);
  if (verificationStatus === "pending_review" && !allowlisted && !opts.institution?.trim()) {
    throw new Error("Institution or organization name is required for non-academic email addresses.");
  }

  const users = await loadUsers();
  if (users.some((u) => u.email === trimmedEmail)) {
    throw new Error("An account with this email already exists.");
  }
  if (users.some((u) => u.username === username)) {
    throw new Error("This username is already taken.");
  }

  const passwordHash = await bcrypt.hash(opts.password, 10);
  const newUser: FrogUser = {
    id: generateId(),
    username,
    email: trimmedEmail,
    displayName: opts.displayName.trim(),
    passwordHash,
    role: opts.role?.trim() || undefined,
    institution: opts.institution?.trim() || undefined,
    avatarBase64: opts.avatarBase64 || undefined,
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
    username: user.username,
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
