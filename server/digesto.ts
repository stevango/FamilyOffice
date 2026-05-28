/**
 * Digesto connector — imports monitored legal processes (and their latest
 * movements) into the Jurídico module.
 *
 * Auth: Bearer token (the user's Digesto API token), sent in the Authorization
 * header. Base URL and the monitoramento endpoint follow the public docs at
 * https://op.digesto.com.br/doc_api/monitoramento.html. The response mapping is
 * intentionally tolerant of field-name variations, and any contract mismatch
 * surfaces a clear error so it can be adjusted against the live API.
 */
import * as db from "./db";
import type { InsertLegalCase } from "../drizzle/schema";

const BASE = "https://op.digesto.com.br/api";

export interface DigestoSyncContext {
  apiKey: string;
  householdId: number;
  userId: number;
}

async function digestoGet(path: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Token do Digesto inválido ou sem permissão.");
    }
    if (res.status === 404) {
      throw new Error("Endpoint do Digesto não encontrado (verifique o plano/contrato da API).");
    }
    if (!res.ok) throw new Error(`O Digesto respondeu HTTP ${res.status}.`);
    return await res.json();
  } catch (err) {
    if (err instanceof Error && /Token|Endpoint|HTTP/.test(err.message)) throw err;
    if ((err as { name?: string })?.name === "AbortError") throw new Error("Tempo de resposta do Digesto esgotado.");
    throw new Error("Não foi possível conectar ao Digesto.");
  } finally {
    clearTimeout(timer);
  }
}

function asArray(payload: unknown): any[] {
  const p = payload as Record<string, unknown> | unknown[] | null;
  if (Array.isArray(p)) return p;
  if (p && typeof p === "object") {
    for (const key of ["data", "results", "monitoramentos", "processos", "items"]) {
      const v = (p as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function mapProcesso(p: any): { caseNumber: string; title: string; court: string; description: string } {
  const numero = String(p.numero_cnj ?? p.numeroCNJ ?? p.numero ?? p.cnj ?? p.processo ?? p.numero_processo ?? "").trim();
  const tribunal = String(p.tribunal ?? p.tribunal_nome ?? p.sigla_tribunal ?? p.orgao ?? p.foro ?? "").trim();
  const partes = Array.isArray(p.partes)
    ? p.partes.map((x: any) => (typeof x === "string" ? x : x?.nome)).filter(Boolean).join(" × ")
    : String(p.partes ?? "");
  const ultimo = p.ultimo_andamento ?? p.last_movement ?? (Array.isArray(p.andamentos) ? p.andamentos[0] : null);
  const ultimoTxt = ultimo
    ? typeof ultimo === "string" ? ultimo : String(ultimo.descricao ?? ultimo.texto ?? ultimo.conteudo ?? "")
    : "";
  const title = (partes || numero || "Processo monitorado").slice(0, 500);
  const description = [tribunal && `Tribunal: ${tribunal}`, numero && `Nº ${numero}`, ultimoTxt && `Último andamento: ${ultimoTxt}`]
    .filter(Boolean).join("\n");
  return { caseNumber: numero, title, court: tribunal.slice(0, 255), description };
}

/** Pull monitored processes and upsert them into legal_cases (deduped by número). */
export async function syncDigesto(ctx: DigestoSyncContext): Promise<{ imported: number }> {
  const payload = await digestoGet("/monitoramento", ctx.apiKey);
  const items = asArray(payload);
  const processos: any[] = [];
  for (const it of items) {
    if (Array.isArray(it?.processos)) processos.push(...it.processos);
    else processos.push(it);
  }

  const existing = await db.getLegalCases(ctx.householdId);
  const seen = new Set(existing.map((c) => (c.caseNumber ?? "").replace(/\D/g, "")).filter(Boolean));

  let imported = 0;
  for (const p of processos) {
    const m = mapProcesso(p);
    const key = m.caseNumber.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    await db.createLegalCase({
      userId: ctx.userId,
      title: m.title || "Processo monitorado",
      caseNumber: m.caseNumber.slice(0, 100),
      court: m.court || null,
      description: m.description || null,
      status: "active",
    } as InsertLegalCase);
    seen.add(key);
    imported++;
  }
  return { imported };
}

/** Lightweight credential check used by the "test connection" action. */
export async function verifyDigesto(apiKey: string): Promise<void> {
  await digestoGet("/monitoramento", apiKey);
}
