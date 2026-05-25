import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
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
  toPublicUser,
  verifyPassword,
} from "./_core/session";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router, writeProcedure } from "./_core/trpc";
import * as db from "./db";
import { lookupCep } from "./cep";
import { lookupCnpj } from "./cnpj";
import { extractFields, extractText } from "./extract";
import { ExternalLookupError } from "./lookup";
import { storageDelete, storagePut, storageReadBuffer, storageReadStream, storageStat } from "./storage";

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

    // Only serve files that belong to a document in the user's household.
    const doc = await db.getDocumentByKey(user.householdId, key);
    if (!doc) {
      res.status(404).send("Not found");
      return;
    }

    try {
      const info = await storageStat(key);
      res.set("Content-Type", doc.mimeType || "application/octet-stream");
      res.set("Content-Length", String(info.size));
      res.set("Cache-Control", "private, max-age=0, no-cache");
      res.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
      storageReadStream(key).on("error", () => res.status(500).end()).pipe(res);
    } catch {
      res.status(404).send("Not found");
    }
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
    }).optional()).query(async ({ ctx, input }) => db.getDocuments(ctx.user.householdId, input?.search, input?.category)),
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
    /** Look up official company data by CNPJ (public Receita data via BrasilAPI). */
    lookupCnpj: writeProcedure.input(z.object({ cnpj: z.string() })).mutation(async ({ input }) => {
      try {
        return { fields: await lookupCnpj(input.cnpj) };
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
      category: z.enum(["personal", "cnh", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "other"]).default("other"),
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
    update: writeProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.enum(["personal", "cnh", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "other"]).optional(),
      tags: z.string().optional(),
      expiresAt: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, metadata, ...data } = input;
      await db.updateDocument(id, ctx.user.householdId, {
        ...data,
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
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
      assetType: z.enum(["property", "vehicle", "company", "investment", "other"]),
      description: z.string().optional(),
      estimatedValue: z.string(),
      acquisitionValue: z.string().optional(),
      acquisitionDate: z.string().optional(),
      location: z.string().optional(),
      status: z.enum(["active", "sold", "inactive"]).default("active"),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => db.createAsset({ ...input, userId: ctx.user.id, acquisitionDate: input.acquisitionDate || null })),
    update: writeProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      assetType: z.enum(["property", "vehicle", "company", "investment", "other"]).optional(),
      description: z.string().optional(),
      estimatedValue: z.string().optional(),
      acquisitionValue: z.string().optional(),
      acquisitionDate: z.string().optional(),
      location: z.string().optional(),
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
});

export type AppRouter = typeof appRouter;
