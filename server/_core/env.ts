import path from "node:path";

function required(name: string, value: string): string {
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    console.warn(`[env] ${name} is not set; using an insecure development default.`);
  }
  return value;
}

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");

export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "3000", 10),

  // Persistence
  dataDir: DATA_DIR,
  databaseFile: process.env.DATABASE_FILE ?? path.join(DATA_DIR, "app.db"),
  storageDir: process.env.STORAGE_DIR ?? path.join(DATA_DIR, "uploads"),

  // Auth
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET ?? "dev-insecure-secret-change-me"),
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  allowRegistration: (process.env.ALLOW_REGISTRATION ?? "true").toLowerCase() !== "false",

  // Uploads
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? String(16 * 1024 * 1024), 10),
};
