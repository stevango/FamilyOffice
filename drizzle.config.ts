import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "mysql",
  dbCredentials: { url },
});
