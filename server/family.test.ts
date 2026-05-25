import { beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";

// These integration tests need a real MySQL. They run only when DATABASE_URL
// is set (e.g. in CI with a MySQL service), and are skipped otherwise.
const hasDb = Boolean(process.env.DATABASE_URL);

let appRouter: typeof import("./routers").appRouter;
let db: typeof import("./db");

beforeAll(async () => {
  if (!hasDb) return;
  process.env.JWT_SECRET = "test-secret";
  ({ appRouter } = await import("./routers"));
  db = await import("./db");
  await db.migrateDb();
});

function ctxFor(user: any): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {}, socket: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe.skipIf(!hasDb)("shared household", () => {
  it("scopes data to the household and enforces roles", async () => {
    const householdId = await db.createHousehold("Família Teste");
    const admin = await db.createUser({ email: "a@t.com", name: "Admin", passwordHash: "x", role: "admin", householdId });
    const member = await db.createUser({ email: "m@t.com", name: "Member", passwordHash: "x", role: "member", householdId });
    const viewer = await db.createUser({ email: "v@t.com", name: "Viewer", passwordHash: "x", role: "viewer", householdId });

    const adminCaller = appRouter.createCaller(ctxFor(admin));
    const memberCaller = appRouter.createCaller(ctxFor(member));
    const viewerCaller = appRouter.createCaller(ctxFor(viewer));

    // Admin creates an account; member sees it (shared data).
    await adminCaller.bankAccounts.create({ name: "Conta Família", balance: "1000" });
    const seenByMember = await memberCaller.bankAccounts.list();
    expect(seenByMember).toHaveLength(1);
    expect(seenByMember[0]?.name).toBe("Conta Família");

    // Viewer is read-only.
    await expect(viewerCaller.bankAccounts.create({ name: "X", balance: "1" })).rejects.toThrow();
    expect(await viewerCaller.bankAccounts.list()).toHaveLength(1);

    // Only admins manage invites.
    await expect(memberCaller.household.invites.create({ role: "member" })).rejects.toThrow();
    const invite = await adminCaller.household.invites.create({ role: "member" });
    expect(invite.code).toBeTruthy();

    // The last admin cannot be demoted.
    await expect(adminCaller.household.updateMemberRole({ userId: admin!.id, role: "member" })).rejects.toThrow();
  });

  it("isolates data between households", async () => {
    const otherHousehold = await db.createHousehold("Outra Família");
    const outsider = await db.createUser({ email: "o@t.com", name: "Outsider", passwordHash: "x", role: "admin", householdId: otherHousehold });
    const outsiderCaller = appRouter.createCaller(ctxFor(outsider));
    // The account created in the first household must not be visible here.
    expect(await outsiderCaller.bankAccounts.list()).toHaveLength(0);
  });
});
