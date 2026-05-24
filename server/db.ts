import Database from "better-sqlite3";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  assets, InsertAsset,
  bankAccounts, InsertBankAccount,
  cards, InsertCard,
  documents, InsertDocument,
  legalCases, InsertLegalCase,
  transactions, InsertTransaction,
  users, type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    mkdirSync(path.dirname(ENV.databaseFile), { recursive: true });
    const sqlite = new Database(ENV.databaseFile);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    _db = drizzle(sqlite);
    migrate(_db, { migrationsFolder: path.resolve(process.cwd(), "drizzle/migrations") });
  }
  return _db;
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
  return row?.count ?? 0;
}

export async function createUser(data: InsertUser) {
  const [row] = await getDb().insert(users).values(data).returning({ id: users.id });
  return getUserById(row.id);
}

export async function touchLastSignedIn(id: number) {
  await getDb().update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function updateUserPassword(id: number, passwordHash: string) {
  await getDb().update(users).set({ passwordHash }).where(eq(users.id, id));
}

// ============ BANK ACCOUNTS ============

export async function getBankAccounts(userId: number) {
  return getDb().select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).orderBy(desc(bankAccounts.createdAt));
}

export async function createBankAccount(data: InsertBankAccount) {
  const [row] = await getDb().insert(bankAccounts).values(data).returning({ id: bankAccounts.id });
  return { id: row.id };
}

export async function updateBankAccount(id: number, userId: number, data: Partial<InsertBankAccount>) {
  await getDb().update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
}

export async function deleteBankAccount(id: number, userId: number) {
  await getDb().delete(bankAccounts).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
}

// ============ CARDS ============

export async function getCards(userId: number) {
  return getDb().select().from(cards).where(eq(cards.userId, userId)).orderBy(desc(cards.createdAt));
}

export async function createCard(data: InsertCard) {
  const [row] = await getDb().insert(cards).values(data).returning({ id: cards.id });
  return { id: row.id };
}

export async function updateCard(id: number, userId: number, data: Partial<InsertCard>) {
  await getDb().update(cards).set(data).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

export async function deleteCard(id: number, userId: number) {
  await getDb().delete(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

// ============ TRANSACTIONS ============

export async function getTransactions(userId: number, limit = 50, offset = 0) {
  return getDb().select().from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit)
    .offset(offset);
}

export async function createTransaction(data: InsertTransaction) {
  const [row] = await getDb().insert(transactions).values(data).returning({ id: transactions.id });
  return { id: row.id };
}

export async function updateTransaction(id: number, userId: number, data: Partial<InsertTransaction>) {
  await getDb().update(transactions).set(data).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(id: number, userId: number) {
  await getDb().delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getTransactionsSummary(userId: number) {
  const result = await getDb().select({
    type: transactions.type,
    total: sql<number>`SUM(CAST(${transactions.amount} AS REAL))`,
  }).from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(transactions.type);

  let totalIncome = 0;
  let totalExpense = 0;
  for (const row of result) {
    if (row.type === "income") totalIncome = Number(row.total ?? 0);
    if (row.type === "expense") totalExpense = Number(row.total ?? 0);
  }
  return { totalIncome, totalExpense };
}

// ============ DOCUMENTS ============

export async function getDocuments(userId: number, search?: string, category?: string) {
  const conditions = [eq(documents.userId, userId)];
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
  return getDb().select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
}

export async function getDocumentByKey(userId: number, fileKey: string) {
  const rows = await getDb().select().from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.fileKey, fileKey)))
    .limit(1);
  return rows[0];
}

export async function createDocument(data: InsertDocument) {
  const [row] = await getDb().insert(documents).values(data).returning({ id: documents.id });
  return { id: row.id };
}

export async function updateDocument(id: number, userId: number, data: Partial<InsertDocument>) {
  await getDb().update(documents).set(data).where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

export async function deleteDocument(id: number, userId: number) {
  const rows = await getDb().select({ fileKey: documents.fileKey }).from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .limit(1);
  await getDb().delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return rows[0]?.fileKey;
}

// ============ ASSETS ============

export async function getAssets(userId: number, assetType?: string) {
  const conditions = [eq(assets.userId, userId)];
  if (assetType) {
    conditions.push(eq(assets.assetType, assetType as any));
  }
  return getDb().select().from(assets).where(and(...conditions)).orderBy(desc(assets.createdAt));
}

export async function createAsset(data: InsertAsset) {
  const [row] = await getDb().insert(assets).values(data).returning({ id: assets.id });
  return { id: row.id };
}

export async function updateAsset(id: number, userId: number, data: Partial<InsertAsset>) {
  await getDb().update(assets).set(data).where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function deleteAsset(id: number, userId: number) {
  await getDb().delete(assets).where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function getAssetsSummary(userId: number) {
  const [result] = await getDb().select({
    totalValue: sql<number>`SUM(CAST(${assets.estimatedValue} AS REAL))`,
    count: sql<number>`COUNT(*)`,
  }).from(assets)
    .where(and(eq(assets.userId, userId), eq(assets.status, "active")));

  return {
    totalValue: Number(result?.totalValue ?? 0),
    count: result?.count ?? 0,
  };
}

// ============ LEGAL CASES ============

export async function getLegalCases(userId: number) {
  return getDb().select().from(legalCases).where(eq(legalCases.userId, userId)).orderBy(desc(legalCases.createdAt));
}

export async function createLegalCase(data: InsertLegalCase) {
  const [row] = await getDb().insert(legalCases).values(data).returning({ id: legalCases.id });
  return { id: row.id };
}

export async function updateLegalCase(id: number, userId: number, data: Partial<InsertLegalCase>) {
  await getDb().update(legalCases).set(data).where(and(eq(legalCases.id, id), eq(legalCases.userId, userId)));
}

export async function deleteLegalCase(id: number, userId: number) {
  await getDb().delete(legalCases).where(and(eq(legalCases.id, id), eq(legalCases.userId, userId)));
}

// ============ DASHBOARD SUMMARY ============

export async function getDashboardSummary(userId: number) {
  const db = getDb();

  const [balanceResult] = await db.select({
    total: sql<number>`SUM(CAST(${bankAccounts.balance} AS REAL))`,
  }).from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, 1)));

  const [assetsResult] = await db.select({
    total: sql<number>`SUM(CAST(${assets.estimatedValue} AS REAL))`,
  }).from(assets).where(and(eq(assets.userId, userId), eq(assets.status, "active")));

  const recentDocuments = await db.select().from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(5);

  const [casesResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(legalCases).where(and(eq(legalCases.userId, userId), eq(legalCases.status, "active")));

  const upcomingDeadlines = await db.select().from(legalCases)
    .where(and(
      eq(legalCases.userId, userId),
      eq(legalCases.status, "active"),
      sql`${legalCases.nextDeadline} IS NOT NULL`
    ))
    .orderBy(legalCases.nextDeadline)
    .limit(5);

  return {
    totalBalance: Number(balanceResult?.total ?? 0),
    totalAssets: Number(assetsResult?.total ?? 0),
    recentDocuments,
    activeCases: casesResult?.count ?? 0,
    upcomingDeadlines,
  };
}
