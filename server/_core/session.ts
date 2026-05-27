import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { PublicUser, User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Hash a plaintext password with a per-password random salt (scrypt). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/** Constant-time verification of a password against a stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

type SessionPayload = { userId: number; email: string };

const secretKey = () => new TextEncoder().encode(ENV.jwtSecret);

export async function signSession(payload: SessionPayload, expiresInMs = ONE_YEAR_MS): Promise<string> {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ userId: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(exp)
    .sign(secretKey());
}

type SharePayload = {
  fileKey: string;
  fileName: string;
  mimeType: string;
  documentId?: number;
  householdId?: number;
};

/** Sign a short-lived public link token for sharing a single file. */
export async function signShareToken(payload: SharePayload, expiresInMs = 7 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({
    kind: "share",
    fileKey: payload.fileKey,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    documentId: payload.documentId,
    householdId: payload.householdId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(exp)
    .sign(secretKey());
}

export async function verifyShareToken(token: string | undefined | null): Promise<SharePayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== "share" || typeof payload.fileKey !== "string") return null;
    return {
      fileKey: payload.fileKey,
      fileName: typeof payload.fileName === "string" ? payload.fileName : "documento",
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "application/octet-stream",
      documentId: typeof payload.documentId === "number" ? payload.documentId : undefined,
      householdId: typeof payload.householdId === "number" ? payload.householdId : undefined,
    };
  } catch {
    return null;
  }
}

type PackagePayload = { householdId: number; docIds: number[] };

/** Sign a public link for a bundle of documents (the accountant package). */
export async function signPackageToken(payload: PackagePayload, expiresInMs = 7 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ kind: "package", householdId: payload.householdId, docIds: payload.docIds })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(exp)
    .sign(secretKey());
}

export async function verifyPackageToken(token: string | undefined | null): Promise<PackagePayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== "package" || typeof payload.householdId !== "number" || !Array.isArray(payload.docIds)) return null;
    return { householdId: payload.householdId, docIds: (payload.docIds as unknown[]).filter((x): x is number => typeof x === "number") };
  } catch {
    return null;
  }
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const userId = payload.userId;
    const email = payload.email;
    if (typeof userId !== "number" || typeof email !== "string") return null;
    return { userId, email };
  } catch {
    return null;
  }
}

function sessionCookie(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return cookies[COOKIE_NAME];
}

/** Resolve the authenticated user for a request, or null if unauthenticated. */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const session = await verifySession(sessionCookie(req));
  if (!session) return null;
  const user = await db.getUserById(session.userId);
  return user ?? null;
}

/** Strip the password hash before sending a user to the client. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
