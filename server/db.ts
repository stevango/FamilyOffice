import { and, desc, eq, getTableColumns, inArray, like, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import path from "node:path";
import {
  assets, InsertAsset,
  bankAccounts, InsertBankAccount,
  cards, InsertCard,
  documents, InsertDocument,
  households,
  integrations, InsertIntegration,
  invites, InsertInvite,
  legalCases, InsertLegalCase,
  transactions, InsertTransaction,
  users, type InsertUser, type Role,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: MySql2Database | null = null;
let _pool: mysql.Pool | null = null;

export function getDb(): MySql2Database {
  if (!_db) {
    if (!ENV.databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }
    _pool = mysql.createPool(ENV.databaseUrl);
    _db = drizzle(_pool);
  }
  return _db;
}

/** Apply pending migrations. Call once at server startup. */
export async function migrateDb(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: path.resolve(process.cwd(), "drizzle/migrations") });
}

/** Subquery of the user ids belonging to a household — used to scope all data. */
function memberIds(householdId: number) {
  return getDb().select({ id: users.id }).from(users).where(eq(users.householdId, householdId));
}

// ============ HOUSEHOLDS ============

export async function createHousehold(name: string) {
  const result = await getDb().insert(households).values({ name });
  return result[0].insertId;
}

export async function getHousehold(id: number) {
  const rows = await getDb().select().from(households).where(eq(households.id, id)).limit(1);
  return rows[0];
}

export async function renameHousehold(id: number, name: string) {
  await getDb().update(households).set({ name }).where(eq(households.id, id));
}

// ============ USERS ============

export async function getUserById(id: number) {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getUserByEmail(email: string) {
  const rows = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function countUsers(): Promise<number> {
  const [row] = await getDb().select({ count: sql<number>`COUNT(*)` }).from(users);
  return Number(row?.count ?? 0);
}

export async function createUser(data: InsertUser) {
  const result = await getDb().insert(users).values(data);
  return getUserById(result[0].insertId);
}

export async function getHouseholdMembers(householdId: number) {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.householdId, householdId))
    .orderBy(users.createdAt);
}

export async function countAdmins(householdId: number): Promise<number> {
  const [row] = await getDb().select({ count: sql<number>`COUNT(*)` }).from(users)
    .where(and(eq(users.householdId, householdId), eq(users.role, "admin")));
  return Number(row?.count ?? 0);
}

export async function updateUserRole(id: number, householdId: number, role: Role) {
  await getDb().update(users).set({ role }).where(and(eq(users.id, id), eq(users.householdId, householdId)));
}

export async function removeUser(id: number, householdId: number) {
  await getDb().delete(users).where(and(eq(users.id, id), eq(users.householdId, householdId)));
}

export async function touchLastSignedIn(id: number) {
  await getDb().update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function updateUserPassword(id: number, passwordHash: string) {
  await getDb().update(users).set({ passwordHash }).where(eq(users.id, id));
}

// ============ INVITES ============

export async function createInvite(data: InsertInvite) {
  const result = await getDb().insert(invites).values(data);
  return result[0].insertId;
}

export async function getValidInvite(code: string) {
  const rows = await getDb().select().from(invites).where(eq(invites.code, code)).limit(1);
  const invite = rows[0];
  if (!invite) return undefined;
  if (invite.usedBy) return undefined;
  if (invite.expiresAt.getTime() < Date.now()) return undefined;
  return invite;
}

export async function markInviteUsed(id: number, usedBy: number) {
  await getDb().update(invites).set({ usedBy, usedAt: new Date() }).where(eq(invites.id, id));
}

export async function listInvites(householdId: number) {
  return getDb().select().from(invites)
    .where(and(eq(invites.householdId, householdId), sql`${invites.usedBy} IS NULL`))
    .orderBy(desc(invites.createdAt));
}

export async function deleteInvite(id: number, householdId: number) {
  await getDb().delete(invites).where(and(eq(invites.id, id), eq(invites.householdId, householdId)));
}

// ============ BANK ACCOUNTS ============

export async function getBankAccounts(householdId: number) {
  return getDb().select().from(bankAccounts).where(inArray(bankAccounts.userId, memberIds(householdId))).orderBy(desc(bankAccounts.createdAt));
}

export async function createBankAccount(data: InsertBankAccount) {
  const result = await getDb().insert(bankAccounts).values(data);
  return { id: result[0].insertId };
}

export async function updateBankAccount(id: number, householdId: number, data: Partial<InsertBankAccount>) {
  await getDb().update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), inArray(bankAccounts.userId, memberIds(householdId))));
}

export async function deleteBankAccount(id: number, householdId: number) {
  await getDb().delete(bankAccounts).where(and(eq(bankAccounts.id, id), inArray(bankAccounts.userId, memberIds(householdId))));
}

// ============ CARDS ============

export async function getCards(householdId: number) {
  return getDb().select().from(cards).where(inArray(cards.userId, memberIds(householdId))).orderBy(desc(cards.createdAt));
}

export async function createCard(data: InsertCard) {
  const result = await getDb().insert(cards).values(data);
  return { id: result[0].insertId };
}

export async function updateCard(id: number, householdId: number, data: Partial<InsertCard>) {
  await getDb().update(cards).set(data).where(and(eq(cards.id, id), inArray(cards.userId, memberIds(householdId))));
}

export async function deleteCard(id: number, householdId: number) {
  await getDb().delete(cards).where(and(eq(cards.id, id), inArray(cards.userId, memberIds(householdId))));
}

// ============ TRANSACTIONS ============

export async function getTransactions(householdId: number, limit = 50, offset = 0) {
  return getDb().select().from(transactions)
    .where(inArray(transactions.userId, memberIds(householdId)))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit)
    .offset(offset);
}

export async function createTransaction(data: InsertTransaction) {
  const result = await getDb().insert(transactions).values(data);
  return { id: result[0].insertId };
}

export async function createTransactions(rows: InsertTransaction[]) {
  if (rows.length === 0) return { count: 0 };
  await getDb().insert(transactions).values(rows);
  return { count: rows.length };
}

export async function updateTransaction(id: number, householdId: number, data: Partial<InsertTransaction>) {
  await getDb().update(transactions).set(data).where(and(eq(transactions.id, id), inArray(transactions.userId, memberIds(householdId))));
}

export async function deleteTransaction(id: number, householdId: number) {
  await getDb().delete(transactions).where(and(eq(transactions.id, id), inArray(transactions.userId, memberIds(householdId))));
}

export async function getTransactionsSummary(householdId: number) {
  const result = await getDb().select({
    type: transactions.type,
    total: sql<string>`SUM(${transactions.amount})`,
  }).from(transactions)
    .where(inArray(transactions.userId, memberIds(householdId)))
    .groupBy(transactions.type);

  let totalIncome = 0;
  let totalExpense = 0;
  for (const row of result) {
    if (row.type === "income") totalIncome = parseFloat(row.total || "0");
    if (row.type === "expense") totalExpense = parseFloat(row.total || "0");
  }
  return { totalIncome, totalExpense };
}

/** Income vs expense totals grouped by month (YYYY-MM), most recent `months`. */
export async function getMonthlyCashFlow(householdId: number, months = 6) {
  const rows = await getDb().select({
    month: sql<string>`DATE_FORMAT(${transactions.transactionDate}, '%Y-%m')`,
    type: transactions.type,
    total: sql<string>`SUM(${transactions.amount})`,
  }).from(transactions)
    .where(inArray(transactions.userId, memberIds(householdId)))
    .groupBy(sql`DATE_FORMAT(${transactions.transactionDate}, '%Y-%m')`, transactions.type);

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    if (!row.month) continue;
    const entry = byMonth.get(row.month) ?? { income: 0, expense: 0 };
    if (row.type === "income") entry.income = parseFloat(row.total || "0");
    if (row.type === "expense") entry.expense = parseFloat(row.total || "0");
    byMonth.set(row.month, entry);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense, net: v.income - v.expense }));
}

// ============ DOCUMENTS ============

export async function getDocuments(householdId: number, search?: string, category?: string) {
  const conditions = [eq(users.householdId, householdId)];
  if (category) {
    conditions.push(eq(documents.category, category as any));
  }
  if (search) {
    conditions.push(
      or(
        like(documents.title, `%${search}%`),
        like(documents.tags, `%${search}%`)
      )!
    );
  }
  return getDb()
    .select({ ...getTableColumns(documents), ownerName: users.name, ownerEmail: users.email })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.userId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}

export async function getDocumentByKey(householdId: number, fileKey: string) {
  const rows = await getDb().select().from(documents)
    .where(and(inArray(documents.userId, memberIds(householdId)), eq(documents.fileKey, fileKey)))
    .limit(1);
  return rows[0];
}

export async function createDocument(data: InsertDocument) {
  const result = await getDb().insert(documents).values(data);
  return { id: result[0].insertId };
}

export async function updateDocument(id: number, householdId: number, data: Partial<InsertDocument>) {
  await getDb().update(documents).set(data).where(and(eq(documents.id, id), inArray(documents.userId, memberIds(householdId))));
}

export async function deleteDocument(id: number, householdId: number) {
  const rows = await getDb().select({ fileKey: documents.fileKey }).from(documents)
    .where(and(eq(documents.id, id), inArray(documents.userId, memberIds(householdId))))
    .limit(1);
  await getDb().delete(documents).where(and(eq(documents.id, id), inArray(documents.userId, memberIds(householdId))));
  return rows[0]?.fileKey;
}

// ============ ASSETS ============

export async function getAssets(householdId: number, assetType?: string) {
  const conditions = [inArray(assets.userId, memberIds(householdId))];
  if (assetType) {
    conditions.push(eq(assets.assetType, assetType as any));
  }
  return getDb().select().from(assets).where(and(...conditions)).orderBy(desc(assets.createdAt));
}

export async function createAsset(data: InsertAsset) {
  const result = await getDb().insert(assets).values(data);
  return { id: result[0].insertId };
}

export async function updateAsset(id: number, householdId: number, data: Partial<InsertAsset>) {
  await getDb().update(assets).set(data).where(and(eq(assets.id, id), inArray(assets.userId, memberIds(householdId))));
}

export async function deleteAsset(id: number, householdId: number) {
  await getDb().delete(assets).where(and(eq(assets.id, id), inArray(assets.userId, memberIds(householdId))));
}

export async function getAssetsSummary(householdId: number) {
  const [result] = await getDb().select({
    totalValue: sql<string>`SUM(${assets.estimatedValue})`,
    count: sql<number>`COUNT(*)`,
  }).from(assets)
    .where(and(inArray(assets.userId, memberIds(householdId)), eq(assets.status, "active")));

  return {
    totalValue: parseFloat(result?.totalValue || "0"),
    count: Number(result?.count ?? 0),
  };
}

// ============ LEGAL CASES ============

export async function getLegalCases(householdId: number) {
  return getDb().select().from(legalCases).where(inArray(legalCases.userId, memberIds(householdId))).orderBy(desc(legalCases.createdAt));
}

export async function createLegalCase(data: InsertLegalCase) {
  const result = await getDb().insert(legalCases).values(data);
  return { id: result[0].insertId };
}

export async function updateLegalCase(id: number, householdId: number, data: Partial<InsertLegalCase>) {
  await getDb().update(legalCases).set(data).where(and(eq(legalCases.id, id), inArray(legalCases.userId, memberIds(householdId))));
}

export async function deleteLegalCase(id: number, householdId: number) {
  await getDb().delete(legalCases).where(and(eq(legalCases.id, id), inArray(legalCases.userId, memberIds(householdId))));
}

// ============ INTEGRATIONS ============

export async function getIntegrations(householdId: number) {
  return getDb().select().from(integrations).where(eq(integrations.householdId, householdId));
}

export async function getIntegration(householdId: number, provider: InsertIntegration["provider"]) {
  const rows = await getDb().select().from(integrations)
    .where(and(eq(integrations.householdId, householdId), eq(integrations.provider, provider)))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert or update the integration row for (household, provider). */
export async function upsertIntegration(
  householdId: number,
  provider: InsertIntegration["provider"],
  data: Partial<InsertIntegration>,
) {
  const existing = await getIntegration(householdId, provider);
  if (existing) {
    await getDb().update(integrations).set(data)
      .where(and(eq(integrations.householdId, householdId), eq(integrations.provider, provider)));
  } else {
    await getDb().insert(integrations).values({ householdId, provider, ...data });
  }
}

// ============ ALERTS ============

export type AlertItem = {
  kind: "document" | "legal";
  id: number;
  title: string;
  date: string;
  daysUntil: number;
  overdue: boolean;
};

/** Documents expiring and legal deadlines within `horizonDays` (plus overdue). */
export async function getAlerts(householdId: number, horizonDays = 30): Promise<AlertItem[]> {
  const db = getDb();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + horizonDays * 86_400_000).toISOString().slice(0, 10);

  const daysBetween = (date: string) =>
    Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000);

  const docs = await db.select({ id: documents.id, title: documents.title, date: documents.expiresAt })
    .from(documents)
    .where(and(
      inArray(documents.userId, memberIds(householdId)),
      sql`${documents.expiresAt} IS NOT NULL AND ${documents.expiresAt} <= ${horizon}`
    ))
    .orderBy(documents.expiresAt)
    .limit(25);

  const cases = await db.select({ id: legalCases.id, title: legalCases.title, date: legalCases.nextDeadline })
    .from(legalCases)
    .where(and(
      inArray(legalCases.userId, memberIds(householdId)),
      eq(legalCases.status, "active"),
      sql`${legalCases.nextDeadline} IS NOT NULL AND ${legalCases.nextDeadline} <= ${horizon}`
    ))
    .orderBy(legalCases.nextDeadline)
    .limit(25);

  const items: AlertItem[] = [
    ...docs.map((d) => ({ kind: "document" as const, id: d.id, title: d.title, date: d.date!, daysUntil: daysBetween(d.date!), overdue: d.date! < todayStr })),
    ...cases.map((c) => ({ kind: "legal" as const, id: c.id, title: c.title, date: c.date!, daysUntil: daysBetween(c.date!), overdue: c.date! < todayStr })),
  ];

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ============ DASHBOARD SUMMARY ============

export async function getDashboardSummary(householdId: number) {
  const db = getDb();
  const scope = memberIds(householdId);

  const [balanceResult] = await db.select({
    total: sql<string>`SUM(${bankAccounts.balance})`,
  }).from(bankAccounts).where(and(inArray(bankAccounts.userId, scope), eq(bankAccounts.isActive, 1)));

  const [assetsResult] = await db.select({
    total: sql<string>`SUM(${assets.estimatedValue})`,
  }).from(assets).where(and(inArray(assets.userId, scope), eq(assets.status, "active")));

  const recentDocuments = await db.select().from(documents)
    .where(inArray(documents.userId, scope))
    .orderBy(desc(documents.createdAt))
    .limit(5);

  const [casesResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(legalCases).where(and(inArray(legalCases.userId, scope), eq(legalCases.status, "active")));

  const upcomingDeadlines = await db.select().from(legalCases)
    .where(and(
      inArray(legalCases.userId, scope),
      eq(legalCases.status, "active"),
      sql`${legalCases.nextDeadline} IS NOT NULL`
    ))
    .orderBy(legalCases.nextDeadline)
    .limit(5);

  return {
    totalBalance: parseFloat(balanceResult?.total || "0"),
    totalAssets: parseFloat(assetsResult?.total || "0"),
    recentDocuments,
    activeCases: Number(casesResult?.count ?? 0),
    upcomingDeadlines,
  };
}
