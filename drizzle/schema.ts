import { date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

const timestamps = {
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
};

/**
 * A family/household. All of a household's members share the same financial,
 * patrimonial, document and legal data.
 */
export const households = mysqlTable("households", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ...timestamps,
});

export type Household = typeof households.$inferSelect;
export type InsertHousehold = typeof households.$inferInsert;

/**
 * Core user table backing the email/password auth flow. Each user belongs to
 * one household and has a role within it: admin (manages members), member
 * (read+write) or viewer (read-only).
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "member", "viewer"]).default("member").notNull(),
  ...timestamps,
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Role = User["role"];
/** User shape safe to send to the client (never includes the password hash). */
export type PublicUser = Omit<User, "passwordHash">;

/**
 * Invite codes for joining a household with a given role.
 */
export const invites = mysqlTable("invites", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  role: mysqlEnum("role", ["member", "viewer"]).default("member").notNull(),
  createdBy: int("createdBy").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedBy: int("usedBy"),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [index("invites_householdId_idx").on(t.householdId)]);

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;

/**
 * Contas bancárias
 */
export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  bank: varchar("bank", { length: 255 }),
  accountType: mysqlEnum("accountType", ["checking", "savings", "investment", "digital"]).default("checking").notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("BRL").notNull(),
  color: varchar("color", { length: 20 }),
  isActive: int("isActive").default(1).notNull(),
  ...timestamps,
}, (t) => [index("bank_accounts_userId_idx").on(t.userId)]);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

/**
 * Cartões de crédito/débito
 */
export const cards = mysqlTable("cards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lastDigits: varchar("lastDigits", { length: 4 }),
  brand: varchar("brand", { length: 50 }),
  cardType: mysqlEnum("cardType", ["credit", "debit", "both"]).default("credit").notNull(),
  creditLimit: decimal("creditLimit", { precision: 15, scale: 2 }),
  closingDay: int("closingDay"),
  dueDay: int("dueDay"),
  bankAccountId: int("bankAccountId"),
  isActive: int("isActive").default(1).notNull(),
  ...timestamps,
}, (t) => [index("cards_userId_idx").on(t.userId)]);

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

/**
 * Transações financeiras (receitas e despesas)
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }),
  subcategory: varchar("subcategory", { length: 100 }),
  transactionDate: date("transactionDate", { mode: "string" }).notNull(),
  bankAccountId: int("bankAccountId"),
  cardId: int("cardId"),
  isPaid: int("isPaid").default(1).notNull(),
  isRecurring: int("isRecurring").default(0).notNull(),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("transactions_userId_date_idx").on(t.userId, t.transactionDate)]);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Cofre Digital - Documentos
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", [
    "personal", "cnh", "property", "vehicle", "company", "legal",
    "tax", "insurance", "contract", "certificate", "finance", "studies", "ir", "other",
  ]).default("other").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  tags: text("tags"),
  expiresAt: date("expiresAt", { mode: "string" }),
  metadata: text("metadata"),
  ...timestamps,
}, (t) => [
  index("documents_userId_idx").on(t.userId),
  index("documents_userId_fileKey_idx").on(t.userId, t.fileKey),
]);

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Gestão Patrimonial - Ativos
 */
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  assetType: mysqlEnum("assetType", ["property", "vehicle", "company", "investment", "other"]).notNull(),
  description: text("description"),
  estimatedValue: decimal("estimatedValue", { precision: 15, scale: 2 }).notNull(),
  acquisitionValue: decimal("acquisitionValue", { precision: 15, scale: 2 }),
  acquisitionDate: date("acquisitionDate", { mode: "string" }),
  location: varchar("location", { length: 500 }),
  status: mysqlEnum("status", ["active", "sold", "inactive"]).default("active").notNull(),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("assets_userId_idx").on(t.userId)]);

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * Módulo Jurídico - Processos
 */
export const legalCases = mysqlTable("legal_cases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  caseNumber: varchar("caseNumber", { length: 100 }),
  caseType: mysqlEnum("caseType", ["favorable", "unfavorable", "neutral"]).default("neutral").notNull(),
  status: mysqlEnum("status", ["active", "closed", "suspended", "archived"]).default("active").notNull(),
  court: varchar("court", { length: 255 }),
  lawyer: varchar("lawyer", { length: 255 }),
  estimatedCost: decimal("estimatedCost", { precision: 15, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 15, scale: 2 }),
  nextDeadline: date("nextDeadline", { mode: "string" }),
  description: text("description"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("legal_cases_userId_idx").on(t.userId)]);

export type LegalCase = typeof legalCases.$inferSelect;
export type InsertLegalCase = typeof legalCases.$inferInsert;

/**
 * Integrações com APIs de parceiros (ex.: Jusbrasil). Uma linha por
 * (household, provedor). Credenciais ficam cifradas em `credentials`.
 */
export const integrations = mysqlTable("integrations", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  provider: mysqlEnum("provider", ["jusbrasil", "claude"]).notNull(),
  enabled: int("enabled").default(0).notNull(),
  credentials: text("credentials"),
  credentialHint: varchar("credentialHint", { length: 32 }),
  config: text("config"),
  status: mysqlEnum("status", ["disconnected", "connected", "error"]).default("disconnected").notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  lastError: text("lastError"),
  ...timestamps,
}, (t) => [index("integrations_household_provider_idx").on(t.householdId, t.provider)]);

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = typeof integrations.$inferInsert;
