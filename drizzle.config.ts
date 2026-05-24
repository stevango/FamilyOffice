import path from "node:path";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_FILE ?? path.resolve(process.cwd(), ".data/app.db"),
  },
});
