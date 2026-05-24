import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import type { Application, Request, Response } from "express";
import express from "express";
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
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storageDelete, storagePut, storageReadStream, storageStat } from "./storage";

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

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

// ---- File routes (upload + authenticated download), registered in index.ts ----
export function registerFileRoutes(app: Application) {
  app.post("/api/upload", express.raw({ type: "*/*", limit: ENV.maxUploadBytes }), async (req, res) => {
    const user = await getUserFromRequest(req).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
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
    if (!user) {
      res.status(401).send("Unauthorized");
      return;
    }
    const key = decodeURIComponent((req.params as Record<string, string>)[0] ?? "");
    if (!key) {
      res.status(400).send("Missing file key");
      return;
    }

    // Only serve files the requesting user actually owns a document for.
    const doc = await db.getDocumentByKey(user.id, key);
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
      return {
        needsSetup: userCount === 0,
        allowRegistration: ENV.allowRegistration || userCount === 0,
      };
    }),

    me: publicProcedure.query(({ ctx }) => (ctx.user ? toPublicUser(ctx.user) : null)),

    register: publicProcedure
      .input(z.object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().trim().min(1).max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        rateLimit(`register:${clientIp(ctx.req)}`, 10, 60 * 60 * 1000);

        const userCount = await db.countUsers();
        const isFirstUser = userCount === 0;
        if (!isFirstUser && !ENV.allowRegistration) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro desativado." });
        }
        if (await db.getUserByEmail(input.email)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail." });
        }

        const passwordHash = await hashPassword(input.password);
        const role = isFirstUser || input.email === ENV.ownerEmail ? "admin" : "user";
        const user = await db.createUser({ email: input.email, name: input.name ?? null, passwordHash, role });
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

  // ============ DASHBOARD ============
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      return db.getDashboardSummary(ctx.user.id);
    }),
    financialSummary: protectedProcedure.query(async ({ ctx }) => {
      return db.getTransactionsSummary(ctx.user.id);
    }),
    cashFlow: protectedProcedure
      .input(z.object({ months: z.number().min(1).max(24).default(6) }).optional())
      .query(async ({ ctx, input }) => {
        return db.getMonthlyCashFlow(ctx.user.id, input?.months ?? 6);
      }),
  }),

  // ============ BANK ACCOUNTS ============
  bankAccounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getBankAccounts(ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      bank: z.string().optional(),
      accountType: z.enum(["checking", "savings", "investment", "digital"]).default("checking"),
      balance: z.string().default("0"),
      currency: z.string().default("BRL"),
      color: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createBankAccount({ ...input, userId: ctx.user.id });
    }),
    update: protectedProcedure.input(z.object({
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
      await db.updateBankAccount(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteBankAccount(input.id, ctx.user.id);
      return { success: true };
    }),
  }),

  // ============ CARDS ============
  cards: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getCards(ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      lastDigits: z.string().max(4).optional(),
      brand: z.string().optional(),
      cardType: z.enum(["credit", "debit", "both"]).default("credit"),
      creditLimit: z.string().optional(),
      closingDay: z.number().min(1).max(31).optional(),
      dueDay: z.number().min(1).max(31).optional(),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createCard({ ...input, userId: ctx.user.id });
    }),
    update: protectedProcedure.input(z.object({
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
      await db.updateCard(id, ctx.user.id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteCard(input.id, ctx.user.id);
      return { success: true };
    }),
  }),

  // ============ TRANSACTIONS ============
  transactions: router({
    list: protectedProcedure.input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional()).query(async ({ ctx, input }) => {
      return db.getTransactions(ctx.user.id, input?.limit ?? 50, input?.offset ?? 0);
    }),
    create: protectedProcedure.input(z.object({
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
    })).mutation(async ({ ctx, input }) => {
      return db.createTransaction({ ...input, userId: ctx.user.id });
    }),
    update: protectedProcedure.input(z.object({
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
      await db.updateTransaction(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteTransaction(input.id, ctx.user.id);
      return { success: true };
    }),
    summary: protectedProcedure.query(async ({ ctx }) => {
      return db.getTransactionsSummary(ctx.user.id);
    }),
  }),

  // ============ DOCUMENTS ============
  documents: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return db.getDocuments(ctx.user.id, input?.search, input?.category);
    }),
    create: protectedProcedure.input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["personal", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "other"]).default("other"),
      fileKey: z.string(),
      fileUrl: z.string(),
      fileName: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      tags: z.string().optional(),
      expiresAt: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createDocument({ ...input, userId: ctx.user.id, expiresAt: input.expiresAt || null });
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.enum(["personal", "property", "vehicle", "company", "legal", "tax", "insurance", "contract", "certificate", "other"]).optional(),
      tags: z.string().optional(),
      expiresAt: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateDocument(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const fileKey = await db.deleteDocument(input.id, ctx.user.id);
      if (fileKey) await storageDelete(fileKey);
      return { success: true };
    }),
  }),

  // ============ ASSETS ============
  assets: router({
    list: protectedProcedure.input(z.object({
      assetType: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return db.getAssets(ctx.user.id, input?.assetType);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      assetType: z.enum(["property", "vehicle", "company", "investment", "other"]),
      description: z.string().optional(),
      estimatedValue: z.string(),
      acquisitionValue: z.string().optional(),
      acquisitionDate: z.string().optional(),
      location: z.string().optional(),
      status: z.enum(["active", "sold", "inactive"]).default("active"),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.createAsset({ ...input, userId: ctx.user.id, acquisitionDate: input.acquisitionDate || null });
    }),
    update: protectedProcedure.input(z.object({
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
      await db.updateAsset(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteAsset(input.id, ctx.user.id);
      return { success: true };
    }),
    summary: protectedProcedure.query(async ({ ctx }) => {
      return db.getAssetsSummary(ctx.user.id);
    }),
  }),

  // ============ LEGAL CASES ============
  legalCases: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getLegalCases(ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
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
    })).mutation(async ({ ctx, input }) => {
      return db.createLegalCase({ ...input, userId: ctx.user.id, nextDeadline: input.nextDeadline || null });
    }),
    update: protectedProcedure.input(z.object({
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
      await db.updateLegalCase(id, ctx.user.id, data as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await db.deleteLegalCase(input.id, ctx.user.id);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
