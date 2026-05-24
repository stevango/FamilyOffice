import { describe, expect, it } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

type CookieCall = { name: string; options: Record<string, unknown> };

const sampleUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Test User",
  passwordHash: "secret-hash",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: { ...sampleUser },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("auth.me", () => {
  it("returns the public user (without password hash) when authenticated", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.email).toBe("test@example.com");
    expect(result?.name).toBe("Test User");
    expect((result as Record<string, unknown>)?.passwordHash).toBeUndefined();
  });

  it("returns null when unauthenticated", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    expect(await caller.auth.me()).toBeNull();
  });
});

describe("protected procedures require auth", () => {
  const cases = ["dashboard", "bankAccounts", "transactions", "documents", "assets", "legalCases"] as const;
  for (const ns of cases) {
    it(`${ns}.list throws when unauthenticated`, async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      const proc = ns === "dashboard" ? caller.dashboard.summary() : (caller as any)[ns].list();
      await expect(proc).rejects.toThrow();
    });
  }
});
