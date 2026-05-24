import { eq, desc, and, sql, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  bankAccounts, InsertBankAccount,
  cards, InsertCard,
  transactions, InsertTransaction,
  documents, InsertDocument,
  assets, InsertAsset,
  legalCases, InsertLegalCase,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USERS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============ BANK ACCOUNTS ============

export async function getBankAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).orderBy(desc(bankAccounts.createdAt));
}

export async function createBankAccount(data: InsertBankAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bankAccounts).values(data);
  return { id: result[0].insertId };
}

export async function updateBankAccount(id: number, userId: number, data: Partial<InsertBankAccount>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
}

export async function deleteBankAccount(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bankAccounts).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
}

// ============ CARDS ============

export async function getCards(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cards).where(eq(cards.userId, userId)).orderBy(desc(cards.createdAt));
}

export async function createCard(data: InsertCard) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cards).values(data);
  return { id: result[0].insertId };
}

export async function updateCard(id: number, userId: number, data: Partial<InsertCard>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cards).set(data).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

export async function deleteCard(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cards).where(and(eq(cards.id, id), eq(cards.userId, userId)));
}

// ============ TRANSACTIONS ============

export async function getTransactions(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit)
    .offset(offset);
}

export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(transactions).values(data);
  return { id: result[0].insertId };
}

export async function updateTransaction(id: number, userId: number, data: Partial<InsertTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(transactions).set(data).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function deleteTransaction(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
}

export async function getTransactionsSummary(userId: number) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalExpense: 0 };
  const result = await db.select({
    type: transactions.type,
    total: sql<string>`SUM(${transactions.amount})`,
  }).from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(transactions.type);

  let totalIncome = 0;
  let totalExpense = 0;
  for (const row of result) {
    if (row.type === "income") totalIncome = parseFloat(row.total || "0");
    if (row.type === "expense") totalExpense = parseFloat(row.total || "0");
  }
  return { totalIncome, totalExpense };
}

// ============ DOCUMENTS ============

export async function getDocuments(userId: number, search?: string, category?: string) {
  const db = await getDb();
  if (!db) return [];
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
  return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
}

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return { id: result[0].insertId };
}

export async function updateDocument(id: number, userId: number, data: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set(data).where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

export async function deleteDocument(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

// ============ ASSETS ============

export async function getAssets(userId: number, assetType?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(assets.userId, userId)];
  if (assetType) {
    conditions.push(eq(assets.assetType, assetType as any));
  }
  return db.select().from(assets).where(and(...conditions)).orderBy(desc(assets.createdAt));
}

export async function createAsset(data: InsertAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(assets).values(data);
  return { id: result[0].insertId };
}

export async function updateAsset(id: number, userId: number, data: Partial<InsertAsset>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(assets).set(data).where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function deleteAsset(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(assets).where(and(eq(assets.id, id), eq(assets.userId, userId)));
}

export async function getAssetsSummary(userId: number) {
  const db = await getDb();
  if (!db) return { totalValue: 0, count: 0 };
  const result = await db.select({
    totalValue: sql<string>`SUM(${assets.estimatedValue})`,
    count: sql<number>`COUNT(*)`,
  }).from(assets)
    .where(and(eq(assets.userId, userId), eq(assets.status, "active")));

  return {
    totalValue: parseFloat(result[0]?.totalValue || "0"),
    count: result[0]?.count || 0,
  };
}

// ============ LEGAL CASES ============

export async function getLegalCases(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(legalCases).where(eq(legalCases.userId, userId)).orderBy(desc(legalCases.createdAt));
}

export async function createLegalCase(data: InsertLegalCase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(legalCases).values(data);
  return { id: result[0].insertId };
}

export async function updateLegalCase(id: number, userId: number, data: Partial<InsertLegalCase>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(legalCases).set(data).where(and(eq(legalCases.id, id), eq(legalCases.userId, userId)));
}

export async function deleteLegalCase(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(legalCases).where(and(eq(legalCases.id, id), eq(legalCases.userId, userId)));
}

// ============ DASHBOARD SUMMARY ============

export async function getDashboardSummary(userId: number) {
  const db = await getDb();
  if (!db) return { totalBalance: 0, totalAssets: 0, recentDocuments: [], activeCases: 0, upcomingDeadlines: [] };

  const [balanceResult] = await db.select({
    total: sql<string>`SUM(${bankAccounts.balance})`,
  }).from(bankAccounts).where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, 1)));

  const [assetsResult] = await db.select({
    total: sql<string>`SUM(${assets.estimatedValue})`,
  }).from(assets).where(and(eq(assets.userId, userId), eq(assets.status, "active")));

  const recentDocs = await db.select().from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(5);

  const [casesResult] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(legalCases).where(and(eq(legalCases.userId, userId), eq(legalCases.status, "active")));

  const deadlines = await db.select().from(legalCases)
    .where(and(
      eq(legalCases.userId, userId),
      eq(legalCases.status, "active"),
      sql`${legalCases.nextDeadline} IS NOT NULL`
    ))
    .orderBy(legalCases.nextDeadline)
    .limit(5);

  return {
    totalBalance: parseFloat(balanceResult?.total || "0"),
    totalAssets: parseFloat(assetsResult?.total || "0"),
    recentDocuments: recentDocs,
    activeCases: casesResult?.count || 0,
    upcomingDeadlines: deadlines,
  };
}
