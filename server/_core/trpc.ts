import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Authenticated and attached to a household; narrows user.householdId to number.
const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.householdId == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: { ...ctx.user, householdId: ctx.user.householdId } } });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Members and admins can write; viewers are read-only.
export const writeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil é somente leitura." });
  }
  return next();
});

// Only household admins can manage members and invites.
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next();
});
