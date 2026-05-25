// Local filesystem storage. Files are written under ENV.storageDir, namespaced
// by user id, and served back through an authenticated route (see routers.ts).
// No external object storage is required, which keeps the app portable and free
// to run anywhere with a persistent disk.

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

const ROOT = path.resolve(ENV.storageDir);

/** Resolve a storage key to an absolute path, rejecting traversal attempts. */
function resolveKey(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(ROOT, normalized);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}

export async function storagePut(
  userId: number,
  fileName: string,
  data: Buffer,
): Promise<{ key: string; size: number }> {
  const safeName = sanitizeFileName(fileName);
  const key = `${userId}/${randomUUID()}-${safeName}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { key, size: data.length };
}

export function storageReadStream(key: string) {
  return createReadStream(resolveKey(key));
}

export async function storageReadBuffer(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function storageStat(key: string) {
  return stat(resolveKey(key));
}

export async function storageDelete(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch {
    /* already gone */
  }
}
