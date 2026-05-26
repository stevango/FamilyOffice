import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "http";
import net from "net";
import { appRouter, registerFileRoutes } from "../routers";
import { migrateDb } from "../db";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

// In production we must bind to exactly the platform-provided PORT. Only in
// local dev do we hunt for a free port if the preferred one is taken.
async function resolvePort(): Promise<number> {
  if (ENV.isProduction) return ENV.port;
  for (let port = ENV.port; port < ENV.port + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return ENV.port;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Apply migrations with retries — a managed DB (e.g. Railway private network)
// may take a few seconds to become reachable after the container starts.
async function runMigrations(): Promise<void> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await migrateDb();
      console.log("[db] migrations applied");
      return;
    } catch (err) {
      console.error(`[db] migration attempt ${attempt}/${maxAttempts} failed:`, err instanceof Error ? err.message : err);
      if (attempt === maxAttempts) {
        console.error("[db] giving up on migrations; the server stays up so logs are visible, but the database is unreachable.");
        return;
      }
      await sleep(Math.min(2000 * attempt, 10_000));
    }
  }
}

function securityHeaders(): express.RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // SAMEORIGIN (not DENY) so the in-app document viewer can iframe our own
    // /api/files resources, while still blocking cross-origin framing.
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    next();
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Liveness endpoint that never touches the database.
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  registerFileRoutes(app);

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Open the port first so the platform health check passes even while the
  // database is still warming up, then run migrations.
  const port = await resolvePort();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    void runMigrations();
  });
}

startServer().catch(err => {
  console.error("[startup] fatal error:", err);
  process.exit(1);
});
