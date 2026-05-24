import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";
import type { Application } from "express";
import express from "express";

// File upload route (registered separately in index.ts)
export function registerUploadRoute(app: Application) {
  app.post("/api/upload", express.raw({ type: "*/*", limit: "16mb" }), async (req, res) => {
    try {
      // Authenticate via session cookie
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rawFileName = req.headers["x-file-name"] as string;
      const fileName = rawFileName ? decodeURIComponent(rawFileName) : `file_${Date.now()}`;
      const contentType = req.headers["content-type"] || "application/octet-stream";

      const body = req.body as Buffer;
      if (!body || body.length === 0) {
        res.status(400).json({ error: "Empty file" });
        return;
      }

      const fileKey = `documents/${user.id}/${Date.now()}-${fileName}`;
      const { key, url } = await storagePut(fileKey, body, contentType);
      res.json({ key, url, fileName });
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
      return db.createTransaction({
        ...input,
        userId: ctx.user.id,
        transactionDate: new Date(input.transactionDate),
      });
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
      return db.createDocument({
        ...input,
        userId: ctx.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
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
      await db.deleteDocument(input.id, ctx.user.id);
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
      return db.createAsset({
        ...input,
        userId: ctx.user.id,
        acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : null,
      });
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
      return db.createLegalCase({
        ...input,
        userId: ctx.user.id,
        nextDeadline: input.nextDeadline ? new Date(input.nextDeadline) : null,
      });
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
