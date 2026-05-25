import path from "node:path";

function required(name: string, value: string): string {
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");

export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT ?? "3000", 10),

  // MySQL connection string, e.g. mysql://user:pass@host:3306/dbname
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL ?? ""),

  // Uploaded files live on local disk (mount a persistent volume in prod).
  dataDir: DATA_DIR,
  storageDir: process.env.STORAGE_DIR ?? path.join(DATA_DIR, "uploads"),

  // Auth
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET ?? "dev-insecure-secret-change-me"),

  // Key for encrypting stored integration credentials at rest. Falls back to
  // the JWT secret so it works out of the box; set a dedicated value to make
  // credential storage independent of session-secret rotation.
  encryptionKey: process.env.ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",

  // Uploads
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? String(16 * 1024 * 1024), 10),
};
