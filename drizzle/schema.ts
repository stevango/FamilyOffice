import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

/**
 * Core user table backing the email/password auth flow.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("passwordHash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  ...timestamps,
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
/** User shape safe to send to the client (never includes the password hash). */
export type PublicUser = Omit<User, "passwordHash">;

/**
 * Contas bancárias. Monetary values are stored as decimal strings to avoid
 * floating-point rounding errors.
 */
export const bankAccounts = sqliteTable("bank_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  bank: text("bank"),
  accountType: text("accountType", { enum: ["checking", "savings", "investment", "digital"] })
    .notNull()
    .default("checking"),
  balance: text("balance").notNull().default("0"),
  currency: text("currency").notNull().default("BRL"),
  color: text("color"),
  isActive: integer("isActive").notNull().default(1),
  ...timestamps,
}, (t) => [index("bank_accounts_userId_idx").on(t.userId)]);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

/**
 * Cartões de crédito/débito
 */
export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  lastDigits: text("lastDigits"),
  brand: text("brand"),
  cardType: text("cardType", { enum: ["credit", "debit", "both"] }).notNull().default("credit"),
  creditLimit: text("creditLimit"),
  closingDay: integer("closingDay"),
  dueDay: integer("dueDay"),
  bankAccountId: integer("bankAccountId"),
  isActive: integer("isActive").notNull().default(1),
  ...timestamps,
}, (t) => [index("cards_userId_idx").on(t.userId)]);

export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;

/**
 * Transações financeiras (receitas e despesas)
 */
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  description: text("description").notNull(),
  amount: text("amount").notNull(),
  category: text("category"),
  subcategory: text("subcategory"),
  transactionDate: text("transactionDate").notNull(),
  bankAccountId: integer("bankAccountId"),
  cardId: integer("cardId"),
  isPaid: integer("isPaid").notNull().default(1),
  isRecurring: integer("isRecurring").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("transactions_userId_date_idx").on(t.userId, t.transactionDate)]);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Cofre Digital - Documentos
 */
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category", {
    enum: [
      "personal", "property", "vehicle", "company", "legal",
      "tax", "insurance", "contract", "certificate", "other",
    ],
  }).notNull().default("other"),
  fileKey: text("fileKey").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileName: text("fileName").notNull(),
  fileSize: integer("fileSize"),
  mimeType: text("mimeType"),
  tags: text("tags"),
  expiresAt: text("expiresAt"),
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
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  assetType: text("assetType", { enum: ["property", "vehicle", "company", "investment", "other"] }).notNull(),
  description: text("description"),
  estimatedValue: text("estimatedValue").notNull(),
  acquisitionValue: text("acquisitionValue"),
  acquisitionDate: text("acquisitionDate"),
  location: text("location"),
  status: text("status", { enum: ["active", "sold", "inactive"] }).notNull().default("active"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("assets_userId_idx").on(t.userId)]);

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * Módulo Jurídico - Processos
 */
export const legalCases = sqliteTable("legal_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  title: text("title").notNull(),
  caseNumber: text("caseNumber"),
  caseType: text("caseType", { enum: ["favorable", "unfavorable", "neutral"] }).notNull().default("neutral"),
  status: text("status", { enum: ["active", "closed", "suspended", "archived"] }).notNull().default("active"),
  court: text("court"),
  lawyer: text("lawyer"),
  estimatedCost: text("estimatedCost"),
  actualCost: text("actualCost"),
  nextDeadline: text("nextDeadline"),
  description: text("description"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("legal_cases_userId_idx").on(t.userId)]);

export type LegalCase = typeof legalCases.$inferSelect;
export type InsertLegalCase = typeof legalCases.$inferInsert;
