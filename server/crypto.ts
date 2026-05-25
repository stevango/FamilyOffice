import crypto from "node:crypto";
import { ENV } from "./_core/env";

/**
 * Symmetric encryption for secrets stored at rest (e.g. partner API keys).
 * Uses AES-256-GCM with a key derived from ENV.encryptionKey. The serialized
 * form is `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`.
 */

const KEY = crypto.createHash("sha256").update(ENV.encryptionKey).digest();

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** A display hint that never reveals the full secret, e.g. "••••3f9a". */
export function secretHint(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return tail ? `••••${tail}` : "••••";
}
