import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserFromRequest } from "./session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await getUserFromRequest(opts.req).catch(() => null);
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
