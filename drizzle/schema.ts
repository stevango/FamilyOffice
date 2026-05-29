import { customType, date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Binary column for storing file contents in the database (up to 4GB). */
const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});

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
    "tax", "insurance", "contract", "certificate", "finance", "studies", "ir", "consorcio", "informe_rendimento", "other",
  ]).default("other").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  tags: text("tags"),
  expiresAt: date("expiresAt", { mode: "string" }),
  metadata: text("metadata"),
  aiSummary: text("aiSummary"),
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
  assetType: mysqlEnum("assetType", ["property", "vehicle", "company", "investment", "consorcio", "other"]).notNull(),
  description: text("description"),
  estimatedValue: decimal("estimatedValue", { precision: 15, scale: 2 }).notNull(),
  acquisitionValue: decimal("acquisitionValue", { precision: 15, scale: 2 }),
  acquisitionDate: date("acquisitionDate", { mode: "string" }),
  location: varchar("location", { length: 500 }),
  holderName: varchar("holderName", { length: 255 }),
  holderDocument: varchar("holderDocument", { length: 20 }),
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
  // Inteligência jurídica (classificação + metadados das APIs DataJud/Jusbrasil/Digesto)
  area: mysqlEnum("area", ["civel", "trabalhista", "tributario", "criminal", "familia", "empresarial", "consumidor", "administrativo", "outro"]),
  esfera: mysqlEnum("esfera", ["pessoal", "empresarial", "familiar", "outro"]),
  polo: mysqlEnum("polo", ["autor", "reu", "interessado", "terceiro", "exequente", "executado", "reclamante", "reclamado", "outro"]),
  risco: mysqlEnum("risco", ["baixo", "medio", "alto", "critico"]),
  vinculo: varchar("vinculo", { length: 255 }),
  valorCausa: decimal("valorCausa", { precision: 15, scale: 2 }),
  classe: varchar("classe", { length: 255 }),
  assunto: varchar("assunto", { length: 500 }),
  grau: varchar("grau", { length: 50 }),
  comarca: varchar("comarca", { length: 255 }),
  vara: varchar("vara", { length: 255 }),
  dataDistribuicao: date("dataDistribuicao", { mode: "string" }),
  audiencia: date("audiencia", { mode: "string" }),
  ultimoAndamento: text("ultimoAndamento"),
  /** Full movement history (JSON array of {data, nome}) from the source API. */
  movimentos: text("movimentos"),
  /** Cofre Digital document ids attached to this case (JSON array). */
  documentIds: text("documentIds"),
  fonte: varchar("fonte", { length: 50 }),
  lastSyncAt: timestamp("lastSyncAt"),
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
  provider: mysqlEnum("provider", ["jusbrasil", "digesto", "datajud", "claude", "openai"]).notNull(),
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

/**
 * File contents for the document vault, stored in the database so uploads
 * survive deploys/restarts (the container filesystem is ephemeral).
 */
export const fileBlobs = mysqlTable("file_blobs", {
  fileKey: varchar("fileKey", { length: 500 }).primaryKey(),
  data: longblob("data").notNull(),
  size: int("size").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileBlob = typeof fileBlobs.$inferSelect;

/**
 * Audit trail of public share-link accesses. One row per time a signed link
 * (email/WhatsApp) is opened, so the household can see who viewed what.
 */
export const shareAccessLogs = mysqlTable("share_access_logs", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  documentId: int("documentId"),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("userAgent", { length: 255 }),
  accessedAt: timestamp("accessedAt").defaultNow().notNull(),
}, (t) => [index("share_access_household_idx").on(t.householdId)]);

export type ShareAccessLog = typeof shareAccessLogs.$inferSelect;
export type InsertShareAccessLog = typeof shareAccessLogs.$inferInsert;

/**
 * Mapa Societário Familiar — companies the family holds a stake in. One row per
 * company, household-scoped. Partners/participations live in `company_partners`.
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  razaoSocial: varchar("razaoSocial", { length: 500 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 500 }),
  cnpj: varchar("cnpj", { length: 20 }),
  inscricaoEstadual: varchar("inscricaoEstadual", { length: 50 }),
  inscricaoMunicipal: varchar("inscricaoMunicipal", { length: 50 }),
  dataAbertura: date("dataAbertura", { mode: "string" }),
  situacaoCadastral: varchar("situacaoCadastral", { length: 100 }),
  regimeTributario: varchar("regimeTributario", { length: 100 }),
  cnaePrincipal: varchar("cnaePrincipal", { length: 255 }),
  cnaeSecundarios: text("cnaeSecundarios"),
  ramo: varchar("ramo", { length: 255 }),
  endereco: varchar("endereco", { length: 500 }),
  contador: varchar("contador", { length: 255 }),
  advogado: varchar("advogado", { length: 255 }),
  bancoPrincipal: varchar("bancoPrincipal", { length: 255 }),
  /** Bank accounts (JSON array: nomeBanco, numeroBanco, agencia, conta, gerente). */
  bancos: text("bancos"),
  temCertificado: int("temCertificado").default(0).notNull(),
  certificadoVencimento: date("certificadoVencimento", { mode: "string" }),
  certificadoFileKey: varchar("certificadoFileKey", { length: 500 }),
  certificadoFileName: varchar("certificadoFileName", { length: 500 }),
  ultimaAlteracao: date("ultimaAlteracao", { mode: "string" }),
  finalidade: mysqlEnum("finalidade", [
    "operacional", "patrimonial", "holding", "investimento", "tecnologia", "seguros",
    "servicos", "consultoria", "imobiliaria", "veiculos", "familiar", "projeto_futuro",
    "risco", "encerramento", "reestruturacao", "sucessao", "outro",
  ]).default("operacional").notNull(),
  status: mysqlEnum("status", ["ativa", "inativa", "baixada", "em_analise", "risco", "pendente"]).default("ativa").notNull(),
  capitalSocial: decimal("capitalSocial", { precision: 15, scale: 2 }),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  /** Selected risk tags (JSON array of strings). */
  riscos: text("riscos"),
  riscoNivel: mysqlEnum("riscoNivel", ["baixo", "medio", "alto", "critico"]).default("baixo").notNull(),
  /** Strategic planning intent (manter, vender, encerrar, ...). */
  planejamento: varchar("planejamento", { length: 100 }),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("companies_householdId_idx").on(t.householdId)]);

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * People linked to a company (sócios, administradores, procuradores, ...), with
 * their participation, powers and risk notes.
 */
export const companyPartners = mysqlTable("company_partners", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  householdId: int("householdId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  tipoParticipacao: mysqlEnum("tipoParticipacao", [
    "socio", "socio_administrador", "socio_investidor", "administrador",
    "procurador", "representante", "terceiro",
  ]).default("socio").notNull(),
  percentual: decimal("percentual", { precision: 6, scale: 3 }),
  capitalSocial: decimal("capitalSocial", { precision: 15, scale: 2 }),
  dataEntrada: date("dataEntrada", { mode: "string" }),
  dataSaida: date("dataSaida", { mode: "string" }),
  funcao: varchar("funcao", { length: 255 }),
  isAdministrador: int("isAdministrador").default(0).notNull(),
  poderesBancarios: int("poderesBancarios").default(0).notNull(),
  assinaContratos: int("assinaContratos").default(0).notNull(),
  possuiProcuracao: int("possuiProcuracao").default(0).notNull(),
  observacoesRisco: text("observacoesRisco"),
  ...timestamps,
}, (t) => [
  index("company_partners_companyId_idx").on(t.companyId),
  index("company_partners_householdId_idx").on(t.householdId),
]);

export type CompanyPartner = typeof companyPartners.$inferSelect;
export type InsertCompanyPartner = typeof companyPartners.$inferInsert;

/**
 * Alerts surfaced to the household (e.g. a new legal-process movement found by
 * the daily monitor, or an upcoming deadline).
 */
export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  householdId: int("householdId").notNull(),
  legalCaseId: int("legalCaseId"),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [index("alerts_householdId_idx").on(t.householdId)]);

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;
