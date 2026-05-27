import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { CATEGORY_LABELS, fieldsForCategory } from "@shared/documentFields";
import { INTEGRATIONS, INTEGRATION_IDS } from "@shared/integrations";
import { TRPCError } from "@trpc/server";
import type { Application, Request, Response } from "express";
import express from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import {
  getUserFromRequest,
  hashPassword,
  signSession,
  signShareToken,
  toPublicUser,
  verifyPassword,
  verifyShareToken,
} from "./_core/session";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router, writeProcedure } from "./_core/trpc";
import * as db from "./db";
import { aiClassifyAndExtract, aiExtractFields, chatAssistant, summarizeDocument, verifyAiKey, type AiProvider } from "./ai";
import { lookupCep } from "./cep";
import { lookupCnpj } from "./cnpj";
import { decryptSecret, encryptSecret, secretHint } from "./crypto";
import { extractFields, extractText } from "./extract";
import { IntegrationPendingError, syncJusbrasil } from "./jusbrasil";
import { ExternalLookupError } from "./lookup";
import { storageDelete, storagePut, storageReadBuffer } from "./storage";

// ---- Minimal in-memory rate limiter (per key) for auth endpoints ----
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Tente novamente em alguns minutos." });
  }
}

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido");
const passwordSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(200);
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** Resolve which AI provider to use: Claude takes priority, then OpenAI. */
async function resolveAi(householdId: number): Promise<{ provider: AiProvider; apiKey: string } | null> {
  const claude = await db.getIntegration(householdId, "claude");
  if (claude?.credentials) return { provider: "claude", apiKey: decryptSecret(claude.credentials) };
  const openai = await db.getIntegration(householdId, "openai");
  if (openai?.credentials) return { provider: "openai", apiKey: decryptSecret(openai.credentials) };
  return null;
}

/** Compact, token-light snapshot of the household for the AI assistant. */
async function buildHouseholdContext(householdId: number): Promise<string> {
  const [household, alerts, docs] = await Promise.all([
    db.getHousehold(householdId),
    db.getAlerts(householdId, 60),
    db.getDocuments(householdId),
  ]);
  const byCat: Record<string, number> = {};
  docs.forEach((d) => { byCat[d.category] = (byCat[d.category] || 0) + 1; });
  const cats = Object.entries(byCat).map(([c, n]) => `${c}: ${n}`).join(", ") || "nenhum";
  const prazos = alerts.slice(0, 12).map((a) => `${a.title} — ${a.date}${a.overdue ? " (vencido)" : ""}`).join("; ") || "nenhum nos próximos 60 dias";
  return [
    `Família: ${household?.name ?? "—"}`,
    `Total de documentos: ${docs.length} (${cats})`,
    `Próximos vencimentos/prazos: ${prazos}`,
  ].join("\n");
}

/** Render a document's saved fields as text, for AI analysis when the file
 *  itself has no readable text (scanned image, etc.). */
function metadataToText(doc: { title: string; category: string; metadata?: string | null }): string {
  let meta: Record<string, string> = {};
  try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch { /* ignore */ }
  const fields = fieldsForCategory(doc.category);
  const lines = Object.entries(meta)
    .filter(([, v]) => v)
    .map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v}`);
  if (lines.length === 0) return "";
  return `Documento "${doc.title}" (categoria: ${CATEGORY_LABELS[doc.category] ?? doc.category}).\nDados informados pelo usuário:\n${lines.join("\n")}`;
}

/** Parse a Brazilian currency string ("R$ 1.234,56") to a number. */
function parseBRL(v?: string): number {
  if (!v) return 0;
  const n = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const f = parseFloat(n);
  return Number.isFinite(f) ? f : 0;
}

/** Add `n` months to an ISO date (YYYY-MM-DD), clamping to the month's last day. */
function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

// ---- File routes (upload + authenticated download), registered in index.ts ----
export function registerFileRoutes(app: Application) {
  app.post("/api/upload", express.raw({ type: "*/*", limit: ENV.maxUploadBytes }), async (req, res) => {
    const user = await getUserFromRequest(req).catch(() => null);
    if (!user || user.householdId == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role === "viewer") {
      res.status(403).json({ error: "Read-only" });
      return;
    }

    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      res.status(400).json({ error: "Empty file" });
      return;
    }
    if (body.length > ENV.maxUploadBytes) {
      res.status(413).json({ error: "File too large" });
      return;
    }

    const rawFileName = req.headers["x-file-name"] as string | undefined;
    const fileName = rawFileName ? decodeURIComponent(rawFileName) : `file_${Date.now()}`;

    try {
      const { key, size } = await storagePut(user.id, fileName, body);
      res.json({ key, url: `/api/files/${encodeURI(key)}`, fileName, size });
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.get("/api/files/*", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req).catch(() => null);
    if (!user || user.householdId == null) {
      res.status(401).send("Unauthorized");
      return;
    }
    const key = decodeURIComponent((req.params as Record<string, string>)[0] ?? "");
    if (!key) {
      res.status(400).send("Missing file key");
      return;
    }

    const sendMissing = () => {
      res.status(404).type("html").send(
        `<!doctype html><html lang="pt-br"><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#9a9a9a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><p style="margin:0 0 6px">Arquivo não encontrado no servidor.</p><p style="font-size:12px;margin:0;color:#6a6a6a">Pode ter sido enviado antes da migração de armazenamento. Reenvie o documento.</p></div></body></html>`,
      );
    };

    // Only serve files that belong to a document in the user's household.
    const doc = await db.getDocumentByKey(user.householdId, key);
    if (!doc) {
      sendMissing();
      return;
    }

    const buffer = await storageReadBuffer(key).catch(() => null);
    if (!buffer) {
      sendMissing();
      return;
    }
    res.set("Content-Type", doc.mimeType || "application/octet-stream");
    res.set("Content-Length", String(buffer.length));
    res.set("Cache-Control", "private, max-age=0, no-cache");
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.send(buffer);
  });

  // Public, signed, time-limited share link (no login) for email/WhatsApp.
  app.get("/api/share/:token", async (req: Request, res: Response) => {
    const payload = await verifyShareToken((req.params as Record<string, string>).token);
    if (!payload) {
      res.status(410).type("html").send(
        `<!doctype html><html lang="pt-br"><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#9a9a9a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><p>Link de compartilhamento inválido ou expirado.</p></body></html>`,
      );
      return;
    }
    const buffer = await storageReadBuffer(payload.fileKey).catch(() => null);
    if (!buffer) {
      res.status(404).type("html").send("Arquivo não encontrado.");
      return;
    }
    // Audit trail: record the access (best-effort, never blocks serving).
    if (payload.householdId) {
      const fwd = req.headers["x-forwarded-for"];
      const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      db.logShareAccess({
        householdId: payload.householdId,
        documentId: payload.documentId ?? null,
        fileKey: payload.fileKey,
        ip: ip.slice(0, 64),
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 255),
      }).catch(() => {});
    }
    res.set("Content-Type", payload.mimeType || "application/octet-stream");
    res.set("Content-Length", String(buffer.length));
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(payload.fileName)}"`);
    res.send(buffer);
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    /** Public bootstrap info for the login screen. */
    config: publicProcedure.query(async () => {
      const userCount = await db.countUsers();
      return { needsSetup: userCount === 0 };
    }),

    /** Validate an invite code so the join screen can show the family name. */
    inviteInfo: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      const invite = await db.getValidInvite(input.code.trim());
      if (!invite) return { valid: false as const };
      const household = await db.getHousehold(invite.householdId);
      return { valid: true as const, householdName: household?.name ?? "Família", role: invite.role };
    }),

    me: publicProcedure.query(({ ctx }) => (ctx.user ? toPublicUser(ctx.user) : null)),

    register: publicProcedure
      .input(z.object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().trim().min(1).max(120).optional(),
        inviteCode: z.string().trim().optional(),
        householdName: z.string().trim().min(1).max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        rateLimit(`register:${clientIp(ctx.req)}`, 10, 60 * 60 * 1000);

        if (await db.getUserByEmail(input.email)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail." });
        }

        const isFirstUser = (await db.countUsers()) === 0;
        let householdId: number;
        let role: "admin" | "member" | "viewer";

        if (isFirstUser) {
          householdId = await db.createHousehold(input.householdName || (input.name ? `Família ${input.name}` : "Minha Família"));
          role = "admin";
        } else {
          if (!input.inviteCode) {
            throw new TRPCError({ code: "FORBIDDEN", message: "É necessário um convite para criar uma conta." });
          }
          const invite = await db.getValidInvite(input.inviteCode);
          if (!invite) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Convite inválido ou expirado." });
          }
          householdId = invite.householdId;
          role = invite.role;
          const user = await db.createUser({ email: input.email, name: input.name ?? null, passwordHash: await hashPassword(input.password), role, householdId });
          if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar conta." });
          await db.markInviteUsed(invite.id, user.id);
          const token = await signSession({ userId: user.id, email: user.email }, ONE_YEAR_MS);
          ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
          return toPublicUser(user);
        }

        const user = await db.createUser({ email: input.email, name: input.name ?? null, passwordHash: await hashPassword(input.password), role, householdId });
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar conta." });
        const token = await signSession({ userId: user.id, email: user.email }, ONE_YEAR_MS);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return toPublicUser(user);
      }),

    login: publicProcedure
      .input(z.object({ email: emailSchema, password: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        rateLimit(`login:${clientIp(ctx.req)}:${input.email}`, 8, 15 * 60 * 1000);

        const user = await db.getUserByEmail(input.email);
        const ok = user ? await verifyPassword(input.password, user.passwordHash) : false;
        if (!user || !ok) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos." });
        }

        await db.touchLastSignedIn(user.id);
        const token = await signSession({ userId: user.id, email: user.email }, ONE_YEAR_MS);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return toPublicUser(user);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }))
      .mutation(async ({ ctx, input }) => {
        const ok = await verifyPassword(input.currentPassword, ctx.user.passwordHash);
        if (!ok) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });
        }
        await db.updateUserPassword(ctx.user.id, await hashPassword(input.newPassword));
        return { success: true } as const;
      }),
  }),

  // ============ HOUSEHOLD (family) ============
  household: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const household = await db.getHousehold(ctx.user.householdId);
      return { id: ctx.user.householdId, name: household?.name ?? "Família", myRole: ctx.user.role };
    }),
    rename: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
      await db.renameHousehold(ctx.user.householdId, input.name);
      return { success: true };
    }),
    members: protectedProcedure.query(async ({ ctx }) => {
      return db.getHouseholdMembers(ctx.user.householdId);
    }),
    updateMemberRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["admin", "member", "viewer"]) }))
      .mutation(async ({ ctx, input }) => {
        const members = await db.getHouseholdMembers(ctx.user.householdId);
        const target = members.find((m) => m.id === input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
        if (target.role === "admin" && input.role !== "admin" && (await db.countAdmins(ctx.user.householdId)) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A família precisa de pelo menos um administrador." });
        }
        await db.updateUserRole(input.userId, ctx.user.householdId, input.role);
        return { success: true };
      }),
    removeMember: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover a si mesmo." });
      }
      const members = await db.getHouseholdMembers(ctx.user.householdId);
      const target = members.find((m) => m.id === input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
      await db.removeUser(input.userId, ctx.user.householdId);
      return { success: true };
    }),
    invites: router({
      list: adminProcedure.query(async ({ ctx }) => {
        return db.listInvites(ctx.user.householdId);
      }),
      create: adminProcedure.input(z.object({ role: z.enum(["member", "viewer"]).default("member") })).mutation(async ({ ctx, input }) => {
        const code = nanoid(12);
        await db.createInvite({
          householdId: ctx.user.householdId,
          code,
          role: input.role,
          createdBy: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
        return { code, role: input.role };
      }),
      revoke: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        await db.deleteInvite(input.id, ctx.user.householdId);
        return { success: true };
      }),
    }),
  }),

  // ============ DASHBOARD ============
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => db.getDashboardSummary(ctx.user.householdId)),
    financialSummary: protectedProcedure.query(async ({ ctx }) => db.getTransactionsSummary(ctx.user.householdId)),
    cashFlow: protectedProcedure
      .input(z.object({ months: z.number().min(1).max(24).default(6) }).optional())
      .query(async ({ ctx, input }) => db.getMonthlyCashFlow(ctx.user.householdId, input?.months ?? 6)),
    alerts: protectedProcedure
      .input(z.object({ horizonDays: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ ctx, input }) => db.getAlerts(ctx.user.householdId, input?.horizonDays ?? 30)),
  }),

  // ============ BANK ACCOUNTS ============
  bankAccounts: router({
    list: protectedProcedure.query(async ({ ctx }) => db.getBankAccounts(ctx.user.householdId)),
    create: writeProcedure.input(z.object({
      name: z.string().min(1),
      bank: z.string().optional(),
      accountType: z.enum(["checking", "savings", "investment", "digital"]).default("checking"),
      balance: z.string().default("0"),
      currency: z.string().default("BRL"),
      color: z.string().optional(),
    })).mutation(async ({ ctx, input }) => db.createBankAccount({ ...input, userId: ctx.user.id })),
    update: writeProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      bank: z.string().optional(),
      accountType: z.enum(["checking", "savings", "investment", "digital"]).optional(),
      balance: z.string().optional(),
      currency: z.string().optional(),
      color: z.string().optional(),
      isActive: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateBankAccount(id, ctx.user.householdId, data);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteBankAccount(input.id, ctx.user.householdId);
      return { success: true };
    }),
  }),

  // ============ CARDS ============
  cards: router({
    list: protectedProcedure.query(async ({ ctx }) => db.getCards(ctx.user.householdId)),
    create: writeProcedure.input(z.object({
      name: z.string().min(1),
      lastDigits: z.string().max(4).optional(),
      brand: z.string().optional(),
      cardType: z.enum(["credit", "debit", "both"]).default("credit"),
      creditLimit: z.string().optional(),
      closingDay: z.number().min(1).max(31).optional(),
      dueDay: z.number().min(1).max(31).optional(),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => db.createCard({ ...input, userId: ctx.user.id })),
    update: writeProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      lastDigits: z.string().max(4).optional(),
      brand: z.string().optional(),
      cardType: z.enum(["credit", "debit", "both"]).optional(),
      creditLimit: z.string().optional(),
      closingDay: z.number().min(1).max(31).optional(),
      dueDay: z.number().min(1).max(31).optional(),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateCard(id, ctx.user.householdId, data);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCard(input.id, ctx.user.householdId);
      return { success: true };
    }),
  }),

  // ============ TRANSACTIONS ============
  transactions: router({
    list: protectedProcedure.input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional()).query(async ({ ctx, input }) => db.getTransactions(ctx.user.householdId, input?.limit ?? 50, input?.offset ?? 0)),
    create: writeProcedure.input(z.object({
      type: z.enum(["income", "expense"]),
      description: z.string().min(1),
      amount: z.string(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      transactionDate: z.string(),
      bankAccountId: z.number().optional(),
      cardId: z.number().optional(),
      isPaid: z.number().default(1),
      isRecurring: z.number().default(0),
      notes: z.string().optional(),
      repeatMonths: z.number().min(1).max(60).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { repeatMonths, ...base } = input;
      if (!repeatMonths || repeatMonths <= 1) {
        return db.createTransaction({ ...base, userId: ctx.user.id, isRecurring: repeatMonths ? 1 : base.isRecurring });
      }
      const rows = Array.from({ length: repeatMonths }, (_, i) => ({
        ...base,
        userId: ctx.user.id,
        transactionDate: addMonthsIso(base.transactionDate, i),
        isRecurring: 1,
        isPaid: i === 0 ? base.isPaid : 0,
      }));
      return db.createTransactions(rows);
    }),
    update: writeProcedure.input(z.object({
      id: z.number(),
      type: z.enum(["income", "expense"]).optional(),
      description: z.string().min(1).optional(),
      amount: z.string().optional(),
      category: z.string().optional(),
      subcategory: z.string().optional(),
      transactionDate: z.string().optional(),
      bankAccountId: z.number().optional(),
      cardId: z.number().optional(),
      isPaid: z.number().optional(),
      isRecurring: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateTransaction(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteTransaction(input.id, ctx.user.householdId);
      return { success: true };
    }),
    summary: protectedProcedure.query(async ({ ctx }) => db.getTransactionsSummary(ctx.user.householdId)),
  }),

  // ============ DOCUMENTS ============
  documents: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      memberId: z.number().optional(),
    }).optional()).query(async ({ ctx, input }) => db.getDocuments(ctx.user.householdId, input?.search, input?.category, input?.memberId)),
    /** Aggregate active consórcio contracts (from documents) for the leverage view. */
    consorcioLeverage: protectedProcedure.query(async ({ ctx }) => {
      const allDocs = await db.getDocuments(ctx.user.householdId);
      const docs = allDocs.filter((d) => d.category === "consorcio");
      // Consórcios linked to a purchase (vehicle/property/...) are "realized" —
      // their credit became the asset, so they don't count toward leverage.
      const linkedConsorcioIds = new Set<number>();
      const linkInfo = new Map<number, { placa: string; proprietario: string; descricao: string }>();
      for (const d of allDocs) {
        try {
          const m = d.metadata ? JSON.parse(d.metadata) : {};
          const ids = String(m.consorciosVinculados ?? "").split(",").map((x: string) => parseInt(x, 10)).filter(Boolean);
          if (ids.length === 0) continue;
          const placa = m.placa ?? "";
          const proprietario = m.proprietario ?? "";
          const descricao = m.marcaModelo ? `${m.marcaModelo}${placa ? ` - ${placa}` : ""}` : (m.endereco || d.title);
          ids.forEach((id: number) => {
            linkedConsorcioIds.add(id);
            if (!linkInfo.has(id)) linkInfo.set(id, { placa, proprietario, descricao });
          });
        } catch { /* ignore */ }
      }
      const items: Array<{ id: number; title: string; fileUrl: string; metadata: Record<string, string>; administradora: string; tipo: string; valorParcela: number; diaVencimento: string; credito: number; situacao: string; pago: number; total: number; pct: number; realizado: boolean; vinculo: { placa: string; proprietario: string; descricao: string } | null }> = [];
      let totalCredito = 0, totalPago = 0, totalAPagar = 0, totalComprometido = 0;
      for (const doc of docs) {
        let meta: Record<string, string> = {};
        try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch { /* ignore */ }
        const situacao = (meta.situacao ?? "").trim();
        const low = situacao.toLowerCase();
        if (low.includes("quitad") || low.includes("cancel")) continue; // só vigentes/realizados
        const realizado = linkedConsorcioIds.has(doc.id); // já virou um bem
        const credito = parseBRL(meta.valorCredito);
        const valorParcela = parseBRL(meta.valorParcela);
        const parcelas = parseInt((meta.parcelas ?? "").replace(/\D/g, ""), 10) || 0;
        const pagas = parseInt((meta.parcelasPagas ?? "").replace(/\D/g, ""), 10) || 0;
        const total = valorParcela * parcelas;
        const pago = valorParcela * Math.min(pagas, parcelas || pagas);
        const aPagar = Math.max(0, total - pago);
        if (!realizado) {
          // Realized consórcios don't count toward leverage (the credit became the asset).
          totalCredito += credito;
          totalComprometido += total;
          totalPago += pago;
          totalAPagar += aPagar;
        }
        items.push({
          id: doc.id,
          title: doc.title,
          fileUrl: doc.fileUrl,
          metadata: meta,
          administradora: meta.administradora ?? "",
          tipo: meta.tipo ?? "",
          valorParcela,
          diaVencimento: meta.diaVencimento ?? "",
          credito,
          situacao: situacao || "—",
          pago,
          total,
          pct: total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0,
          realizado,
          vinculo: realizado ? (linkInfo.get(doc.id) ?? null) : null,
        });
      }
      items.sort((a, b) => (a.realizado ? 1 : 0) - (b.realizado ? 1 : 0) || b.credito - a.credito);
      return {
        count: items.filter((i) => !i.realizado).length,
        realizadoCount: items.filter((i) => i.realizado).length,
        totalCredito, totalPago, totalAPagar, totalComprometido,
        items,
      };
    }),
    /** Best-effort local extraction of category fields from an uploaded file. */
    analyze: writeProcedure.input(z.object({
      fileKey: z.string(),
      mimeType: z.string().optional(),
      category: z.string(),
    })).mutation(async ({ ctx, input }) => {
      // The just-uploaded file is stored under the requester's user id.
      if (!input.fileKey.startsWith(`${ctx.user.id}/`)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo inválido." });
      }
      const buffer = await storageReadBuffer(input.fileKey).catch(() => null);
      if (!buffer) return { fields: {} as Record<string, string>, hasText: false };
      const text = await extractText(buffer, input.mimeType);
      return { fields: extractFields(text, input.category), hasText: text.length > 0 };
    }),
    /** Re-read an existing document's file (local OCR) and re-extract its fields. */
    reextract: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const doc = await db.getDocumentById(ctx.user.householdId, input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      const buffer = await storageReadBuffer(doc.fileKey).catch(() => null);
      if (!buffer) return { fields: {} as Record<string, string>, hasText: false };
      const text = await extractText(buffer, doc.mimeType ?? undefined);
      return { fields: extractFields(text, doc.category), hasText: text.length > 0 };
    }),
    /** Generate a signed, time-limited public link to share the file. */
    shareLink: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const doc = await db.getDocumentById(ctx.user.householdId, input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      const token = await signShareToken({
        fileKey: doc.fileKey,
        fileName: doc.fileName,
        mimeType: doc.mimeType ?? "application/octet-stream",
        documentId: doc.id,
        householdId: ctx.user.householdId,
      });
      return { token };
    }),
    /** Audit trail: recent accesses to public share links in the household. */
    shareAccessLog: protectedProcedure.query(async ({ ctx }) => db.getShareAccessLogs(ctx.user.householdId)),
    /** Consultor IA: summarize a document and flag income-tax relevance (Claude). */
    summarize: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const doc = await db.getDocumentById(ctx.user.householdId, input.id);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      const ai = await resolveAi(ctx.user.householdId);
      if (!ai) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure um Consultor IA (Claude ou OpenAI) em Integrações." });
      }
      const buffer = await storageReadBuffer(doc.fileKey).catch(() => null);
      // Prefer the file's text; if it can't be read, fall back to the fields
      // the user already filled in the form.
      let text = buffer ? await extractText(buffer, doc.mimeType ?? undefined) : "";
      if (!text) text = metadataToText(doc);
      if (!text) {
        throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "Não consegui ler o arquivo e não há dados preenchidos para analisar." });
      }
      try {
        const summary = await summarizeDocument({ provider: ai.provider, apiKey: ai.apiKey, text, title: doc.title, category: doc.category });
        await db.updateDocument(doc.id, ctx.user.householdId, { aiSummary: JSON.stringify(summary) } as any);
        return summary;
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Falha na análise de IA." });
      }
    }),
    /** Use AI to read a document and fill the category's structured fields
     *  (and, when classify is set, detect the category too). */
    aiExtract: writeProcedure.input(z.object({
      category: z.string(),
      classify: z.boolean().optional(),
      id: z.number().optional(),
      fileKey: z.string().optional(),
      mimeType: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      let buffer: Buffer | null = null;
      let mime = input.mimeType;
      if (input.id != null) {
        const doc = await db.getDocumentById(ctx.user.householdId, input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
        buffer = await storageReadBuffer(doc.fileKey).catch(() => null);
        mime = doc.mimeType ?? undefined;
      } else if (input.fileKey) {
        if (!input.fileKey.startsWith(`${ctx.user.id}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo inválido." });
        }
        buffer = await storageReadBuffer(input.fileKey).catch(() => null);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o documento." });
      }
      if (!buffer) throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado." });
      const ai = await resolveAi(ctx.user.householdId);
      if (!ai) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure um Consultor IA (Claude ou OpenAI) em Integrações." });
      }
      const text = await extractText(buffer, mime);
      if (!text) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "Não consegui ler texto deste arquivo (imagem sem texto ou ilegível)." });
      try {
        if (input.classify) {
          return await aiClassifyAndExtract({ provider: ai.provider, apiKey: ai.apiKey, text });
        }
        const fields = await aiExtractFields({ provider: ai.provider, apiKey: ai.apiKey, text, category: input.category });
        return { category: input.category, fields };
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Falha na extração por IA." });
      }
    }),
    /** Look up official company data by CNPJ (public Receita data via BrasilAPI). */
    lookupCnpj: writeProcedure.input(z.object({ cnpj: z.string() })).mutation(async ({ input }) => {
      try {
        const { fields, socios } = await lookupCnpj(input.cnpj);
        return { fields, socios };
      } catch (err) {
        throw new TRPCError({
          code: err instanceof ExternalLookupError && err.notFound ? "NOT_FOUND" : "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Falha na consulta de CNPJ.",
        });
      }
    }),
    /** Look up an address by CEP (public data via BrasilAPI). */
    lookupCep: writeProcedure.input(z.object({ cep: z.string() })).mutation(async ({ input }) => {
      try {
        return { fields: await lookupCep(input.cep) };
      } catch (err) {
        throw new TRPCError({
          code: err instanceof ExternalLookupError && err.notFound ? "NOT_FOUND" : "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Falha na consulta de CEP.",
        });
      }
    }),
    create: writeProcedure.input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["personal", "cnh", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "finance", "studies", "ir", "consorcio", "informe_rendimento", "other"]).default("other"),
      fileKey: z.string(),
      fileUrl: z.string(),
      fileName: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      tags: z.string().optional(),
      expiresAt: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { metadata, ...rest } = input;
      return db.createDocument({
        ...rest,
        userId: ctx.user.id,
        expiresAt: input.expiresAt || null,
        metadata: metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      });
    }),
    /** Re-attach a freshly uploaded file to an existing document (keeps metadata). */
    replaceFile: writeProcedure.input(z.object({
      id: z.number(),
      fileKey: z.string(),
      fileUrl: z.string(),
      fileName: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateDocument(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    update: writeProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.enum(["personal", "cnh", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "finance", "studies", "ir", "consorcio", "informe_rendimento", "other"]).optional(),
      tags: z.string().optional(),
      expiresAt: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
      aiSummary: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, metadata, aiSummary, ...data } = input;
      await db.updateDocument(id, ctx.user.householdId, {
        ...data,
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        ...(aiSummary !== undefined ? { aiSummary } : {}),
      } as any);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const fileKey = await db.deleteDocument(input.id, ctx.user.householdId);
      if (fileKey) await storageDelete(fileKey);
      return { success: true };
    }),
  }),

  // ============ ASSETS ============
  assets: router({
    list: protectedProcedure.input(z.object({
      assetType: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => db.getAssets(ctx.user.householdId, input?.assetType)),
    create: writeProcedure.input(z.object({
      name: z.string().min(1),
      assetType: z.enum(["property", "vehicle", "company", "investment", "consorcio", "other"]),
      description: z.string().optional(),
      estimatedValue: z.string(),
      acquisitionValue: z.string().optional(),
      acquisitionDate: z.string().optional(),
      location: z.string().optional(),
      holderName: z.string().optional(),
      holderDocument: z.string().optional(),
      status: z.enum(["active", "sold", "inactive"]).default("active"),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => db.createAsset({ ...input, userId: ctx.user.id, acquisitionDate: input.acquisitionDate || null })),
    update: writeProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      assetType: z.enum(["property", "vehicle", "company", "investment", "consorcio", "other"]).optional(),
      description: z.string().optional(),
      estimatedValue: z.string().optional(),
      acquisitionValue: z.string().optional(),
      acquisitionDate: z.string().optional(),
      location: z.string().optional(),
      holderName: z.string().optional(),
      holderDocument: z.string().optional(),
      status: z.enum(["active", "sold", "inactive"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateAsset(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteAsset(input.id, ctx.user.householdId);
      return { success: true };
    }),
    summary: protectedProcedure.query(async ({ ctx }) => db.getAssetsSummary(ctx.user.householdId)),
  }),

  companies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const [comps, parts] = await Promise.all([
        db.getCompanies(ctx.user.householdId),
        db.getCompanyPartners(ctx.user.householdId),
      ]);
      const byCompany = new Map<number, typeof parts>();
      for (const p of parts) {
        const list = byCompany.get(p.companyId) ?? [];
        list.push(p);
        byCompany.set(p.companyId, list);
      }
      return comps.map((c) => ({
        ...c,
        riscos: (() => { try { return c.riscos ? (JSON.parse(c.riscos) as string[]) : []; } catch { return []; } })(),
        partners: byCompany.get(c.id) ?? [],
      }));
    }),
    create: writeProcedure.input(z.object({
      razaoSocial: z.string().min(1),
      nomeFantasia: z.string().optional(),
      cnpj: z.string().optional(),
      inscricaoEstadual: z.string().optional(),
      inscricaoMunicipal: z.string().optional(),
      dataAbertura: z.string().optional(),
      situacaoCadastral: z.string().optional(),
      regimeTributario: z.string().optional(),
      cnaePrincipal: z.string().optional(),
      cnaeSecundarios: z.string().optional(),
      ramo: z.string().optional(),
      endereco: z.string().optional(),
      contador: z.string().optional(),
      advogado: z.string().optional(),
      bancoPrincipal: z.string().optional(),
      temCertificado: z.boolean().optional(),
      certificadoVencimento: z.string().optional(),
      ultimaAlteracao: z.string().optional(),
      finalidade: z.enum(["operacional", "patrimonial", "holding", "investimento", "tecnologia", "seguros", "servicos", "consultoria", "imobiliaria", "veiculos", "familiar", "projeto_futuro", "risco", "encerramento", "reestruturacao", "sucessao", "outro"]).optional(),
      status: z.enum(["ativa", "inativa", "baixada", "em_analise", "risco", "pendente"]).optional(),
      valorEstimado: z.string().optional(),
      riscos: z.array(z.string()).optional(),
      riscoNivel: z.enum(["baixo", "medio", "alto", "critico"]).optional(),
      planejamento: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { riscos, temCertificado, ...rest } = input;
      return db.createCompany({
        ...rest,
        householdId: ctx.user.householdId,
        temCertificado: temCertificado ? 1 : 0,
        riscos: riscos ? JSON.stringify(riscos) : null,
        dataAbertura: rest.dataAbertura || null,
        certificadoVencimento: rest.certificadoVencimento || null,
        ultimaAlteracao: rest.ultimaAlteracao || null,
        valorEstimado: rest.valorEstimado || null,
      } as any);
    }),
    update: writeProcedure.input(z.object({
      id: z.number(),
      razaoSocial: z.string().min(1).optional(),
      nomeFantasia: z.string().optional(),
      cnpj: z.string().optional(),
      inscricaoEstadual: z.string().optional(),
      inscricaoMunicipal: z.string().optional(),
      dataAbertura: z.string().optional(),
      situacaoCadastral: z.string().optional(),
      regimeTributario: z.string().optional(),
      cnaePrincipal: z.string().optional(),
      cnaeSecundarios: z.string().optional(),
      ramo: z.string().optional(),
      endereco: z.string().optional(),
      contador: z.string().optional(),
      advogado: z.string().optional(),
      bancoPrincipal: z.string().optional(),
      temCertificado: z.boolean().optional(),
      certificadoVencimento: z.string().optional(),
      ultimaAlteracao: z.string().optional(),
      finalidade: z.enum(["operacional", "patrimonial", "holding", "investimento", "tecnologia", "seguros", "servicos", "consultoria", "imobiliaria", "veiculos", "familiar", "projeto_futuro", "risco", "encerramento", "reestruturacao", "sucessao", "outro"]).optional(),
      status: z.enum(["ativa", "inativa", "baixada", "em_analise", "risco", "pendente"]).optional(),
      valorEstimado: z.string().optional(),
      riscos: z.array(z.string()).optional(),
      riscoNivel: z.enum(["baixo", "medio", "alto", "critico"]).optional(),
      planejamento: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, riscos, temCertificado, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (riscos !== undefined) data.riscos = riscos.length ? JSON.stringify(riscos) : null;
      if (temCertificado !== undefined) data.temCertificado = temCertificado ? 1 : 0;
      for (const k of ["dataAbertura", "certificadoVencimento", "ultimaAlteracao", "valorEstimado"]) {
        if (data[k] === "") data[k] = null;
      }
      await db.updateCompany(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCompany(input.id, ctx.user.householdId);
      return { success: true };
    }),
    addPartner: writeProcedure.input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      cpfCnpj: z.string().optional(),
      tipoParticipacao: z.enum(["socio", "socio_administrador", "socio_investidor", "administrador", "procurador", "representante", "terceiro"]).optional(),
      percentual: z.string().optional(),
      capitalSocial: z.string().optional(),
      dataEntrada: z.string().optional(),
      dataSaida: z.string().optional(),
      funcao: z.string().optional(),
      isAdministrador: z.boolean().optional(),
      poderesBancarios: z.boolean().optional(),
      assinaContratos: z.boolean().optional(),
      possuiProcuracao: z.boolean().optional(),
      observacoesRisco: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { isAdministrador, poderesBancarios, assinaContratos, possuiProcuracao, ...rest } = input;
      return db.createCompanyPartner({
        ...rest,
        householdId: ctx.user.householdId,
        isAdministrador: isAdministrador ? 1 : 0,
        poderesBancarios: poderesBancarios ? 1 : 0,
        assinaContratos: assinaContratos ? 1 : 0,
        possuiProcuracao: possuiProcuracao ? 1 : 0,
        percentual: rest.percentual || null,
        capitalSocial: rest.capitalSocial || null,
        dataEntrada: rest.dataEntrada || null,
        dataSaida: rest.dataSaida || null,
      } as any);
    }),
    updatePartner: writeProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      cpfCnpj: z.string().optional(),
      tipoParticipacao: z.enum(["socio", "socio_administrador", "socio_investidor", "administrador", "procurador", "representante", "terceiro"]).optional(),
      percentual: z.string().optional(),
      capitalSocial: z.string().optional(),
      dataEntrada: z.string().optional(),
      dataSaida: z.string().optional(),
      funcao: z.string().optional(),
      isAdministrador: z.boolean().optional(),
      poderesBancarios: z.boolean().optional(),
      assinaContratos: z.boolean().optional(),
      possuiProcuracao: z.boolean().optional(),
      observacoesRisco: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, isAdministrador, poderesBancarios, assinaContratos, possuiProcuracao, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (isAdministrador !== undefined) data.isAdministrador = isAdministrador ? 1 : 0;
      if (poderesBancarios !== undefined) data.poderesBancarios = poderesBancarios ? 1 : 0;
      if (assinaContratos !== undefined) data.assinaContratos = assinaContratos ? 1 : 0;
      if (possuiProcuracao !== undefined) data.possuiProcuracao = possuiProcuracao ? 1 : 0;
      for (const k of ["percentual", "capitalSocial", "dataEntrada", "dataSaida"]) {
        if (data[k] === "") data[k] = null;
      }
      await db.updateCompanyPartner(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    removePartner: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCompanyPartner(input.id, ctx.user.householdId);
      return { success: true };
    }),
  }),

  // ============ LEGAL CASES ============
  legalCases: router({
    list: protectedProcedure.query(async ({ ctx }) => db.getLegalCases(ctx.user.householdId)),
    create: writeProcedure.input(z.object({
      title: z.string().min(1),
      caseNumber: z.string().optional(),
      caseType: z.enum(["favorable", "unfavorable", "neutral"]).default("neutral"),
      status: z.enum(["active", "closed", "suspended", "archived"]).default("active"),
      court: z.string().optional(),
      lawyer: z.string().optional(),
      estimatedCost: z.string().optional(),
      actualCost: z.string().optional(),
      nextDeadline: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => db.createLegalCase({ ...input, userId: ctx.user.id, nextDeadline: input.nextDeadline || null })),
    update: writeProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      caseNumber: z.string().optional(),
      caseType: z.enum(["favorable", "unfavorable", "neutral"]).optional(),
      status: z.enum(["active", "closed", "suspended", "archived"]).optional(),
      court: z.string().optional(),
      lawyer: z.string().optional(),
      estimatedCost: z.string().optional(),
      actualCost: z.string().optional(),
      nextDeadline: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateLegalCase(id, ctx.user.householdId, data as any);
      return { success: true };
    }),
    delete: writeProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteLegalCase(input.id, ctx.user.householdId);
      return { success: true };
    }),
  }),

  // ============ INTEGRATIONS (partner APIs) ============
  integrations: router({
    /** Catalog merged with the household's stored config (never returns secrets). */
    list: adminProcedure.query(async ({ ctx }) => {
      const rows = await db.getIntegrations(ctx.user.householdId);
      return INTEGRATIONS.map((meta) => {
        const row = rows.find((r) => r.provider === meta.id);
        return {
          ...meta,
          enabled: row ? row.enabled === 1 : false,
          configured: !!row?.credentials,
          credentialHint: row?.credentialHint ?? null,
          status: row?.status ?? "disconnected",
          lastSyncAt: row?.lastSyncAt ?? null,
          lastError: row?.lastError ?? null,
        };
      });
    }),
    /** Save credentials and/or the enabled flag for a provider. */
    save: adminProcedure.input(z.object({
      provider: z.enum(INTEGRATION_IDS),
      apiKey: z.string().trim().optional(),
      enabled: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.apiKey) {
        data.credentials = encryptSecret(input.apiKey);
        data.credentialHint = secretHint(input.apiKey);
        // New credentials must be re-validated before we trust them.
        data.status = "disconnected";
        data.lastError = null;
      }
      if (input.enabled !== undefined) data.enabled = input.enabled ? 1 : 0;
      await db.upsertIntegration(ctx.user.householdId, input.provider, data);
      return { success: true };
    }),
    /** Test that stored credentials actually work (AI providers). */
    test: adminProcedure.input(z.object({ provider: z.enum(INTEGRATION_IDS) })).mutation(async ({ ctx, input }) => {
      const row = await db.getIntegration(ctx.user.householdId, input.provider);
      if (!row?.credentials) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure as credenciais primeiro." });
      }
      if (input.provider !== "claude" && input.provider !== "openai") {
        throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Teste de conexão não disponível para este provedor." });
      }
      try {
        await verifyAiKey(input.provider, decryptSecret(row.credentials));
        await db.upsertIntegration(ctx.user.householdId, input.provider, { status: "connected", lastError: null, lastSyncAt: new Date() });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha no teste de conexão.";
        await db.upsertIntegration(ctx.user.householdId, input.provider, { status: "error", lastError: message });
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
    /** Remove stored credentials and disable the provider. */
    disconnect: adminProcedure.input(z.object({ provider: z.enum(INTEGRATION_IDS) })).mutation(async ({ ctx, input }) => {
      await db.upsertIntegration(ctx.user.householdId, input.provider, {
        credentials: null,
        credentialHint: null,
        enabled: 0,
        status: "disconnected",
        lastError: null,
      });
      return { success: true };
    }),
    /** Run a sync for a configured provider, importing data into its module. */
    sync: adminProcedure.input(z.object({ provider: z.enum(INTEGRATION_IDS) })).mutation(async ({ ctx, input }) => {
      if (input.provider !== "jusbrasil") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este provedor não possui sincronização." });
      }
      const row = await db.getIntegration(ctx.user.householdId, input.provider);
      if (!row?.credentials) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure as credenciais antes de sincronizar." });
      }
      const apiKey = decryptSecret(row.credentials);
      try {
        const { imported } = await syncJusbrasil({ apiKey, householdId: ctx.user.householdId, userId: ctx.user.id });
        await db.upsertIntegration(ctx.user.householdId, input.provider, {
          status: "connected", lastSyncAt: new Date(), lastError: null,
        });
        return { imported };
      } catch (err) {
        const pending = err instanceof IntegrationPendingError;
        const message = err instanceof Error ? err.message : "Falha na sincronização.";
        await db.upsertIntegration(ctx.user.householdId, input.provider, {
          status: pending ? "disconnected" : "error", lastError: message,
        });
        throw new TRPCError({ code: pending ? "NOT_IMPLEMENTED" : "BAD_REQUEST", message });
      }
    }),
  }),

  // ============ AI ASSISTANT (chat) ============
  ai: router({
    /** Whether an AI provider key is configured (so the chat can prompt setup). */
    configured: protectedProcedure.query(async ({ ctx }) => {
      return { configured: (await resolveAi(ctx.user.householdId)) != null };
    }),
    /** Multi-turn chat with the family-office assistant (Claude or OpenAI). */
    chat: protectedProcedure.input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })).min(1).max(40),
    })).mutation(async ({ ctx, input }) => {
      const ai = await resolveAi(ctx.user.householdId);
      if (!ai) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure um Consultor IA (Claude ou OpenAI) em Integrações." });
      }
      const context = await buildHouseholdContext(ctx.user.householdId);
      try {
        const reply = await chatAssistant({ provider: ai.provider, apiKey: ai.apiKey, context, messages: input.messages });
        return { reply };
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Falha no chat de IA." });
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
