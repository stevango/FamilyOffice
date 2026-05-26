// Document-vault file storage backed by the database, so uploads survive
// deploys/restarts (the container filesystem is ephemeral on most hosts).
// Files are namespaced by user id in the key and served back through an
// authenticated route (see routers.ts).

import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { fileBlobs } from "../drizzle/schema";
import { getDb } from "./db";

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}

export async function storagePut(
  userId: number,
  fileName: string,
  data: Buffer,
): Promise<{ key: string; size: number }> {
  const key = `${userId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  await getDb().insert(fileBlobs).values({ fileKey: key, data, size: data.length });
  return { key, size: data.length };
}

export async function storageReadBuffer(key: string): Promise<Buffer> {
  const rows = await getDb()
    .select({ data: fileBlobs.data })
    .from(fileBlobs)
    .where(eq(fileBlobs.fileKey, key))
    .limit(1);
  if (!rows[0]) throw new Error("File not found");
  return rows[0].data;
}

export async function storageDelete(key: string): Promise<void> {
  await getDb().delete(fileBlobs).where(eq(fileBlobs.fileKey, key));
}
