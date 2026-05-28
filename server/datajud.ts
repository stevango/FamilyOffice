/**
 * DataJud (API Pública do CNJ) connector. DataJud is a per-tribunal
 * Elasticsearch endpoint queried by process number — there is no "list my
 * processes" — so the sync enriches the legal_cases already registered in the
 * Jurídico module with the official classe, órgão julgador and latest movement.
 *
 * Auth: header `Authorization: APIKey <key>` (the CNJ public key, published on
 * the wiki). Endpoint: `https://api-publica.datajud.cnj.jus.br/api_publica_<alias>/_search`.
 */
import * as db from "./db";

const BASE = "https://api-publica.datajud.cnj.jus.br";

/** Published CNJ public key (fallback when the household hasn't pasted one). */
export const DATAJUD_PUBLIC_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

// Justiça Estadual (segmento 8): código do tribunal (TR) -> alias DataJud.
const ESTADUAL: Record<string, string> = {
  "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam", "05": "tjba", "06": "tjce",
  "07": "tjdft", "08": "tjes", "09": "tjgo", "10": "tjma", "11": "tjmt", "12": "tjms",
  "13": "tjmg", "14": "tjpa", "15": "tjpb", "16": "tjpr", "17": "tjpe", "18": "tjpi",
  "19": "tjrj", "20": "tjrn", "21": "tjrs", "22": "tjro", "23": "tjrr", "24": "tjsc",
  "25": "tjse", "26": "tjsp", "27": "tjto",
};

/** Resolve the DataJud index alias from a 20-digit CNJ process number. */
export function aliasForNumero(numero: string): string | null {
  const d = numero.replace(/\D/g, "");
  if (d.length !== 20) return null;
  const j = d[13]; // segmento do judiciário
  const tr = d.slice(14, 16); // tribunal
  const n = Number(tr);
  if (j === "8") return ESTADUAL[tr] ?? null;
  if (j === "4") return n >= 1 && n <= 6 ? `trf${n}` : null;
  if (j === "5") return n >= 1 && n <= 24 ? `trt${n}` : null;
  if (j === "7") return "stm";
  if (j === "3") return "stj";
  if (j === "1") return "stf";
  return null;
}

export interface DatajudSyncContext {
  apiKey: string;
  householdId: number;
  userId: number;
}

async function datajudSearch(alias: string, body: unknown, apiKey: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}/api_publica_${alias}/_search`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `APIKey ${apiKey || DATAJUD_PUBLIC_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) throw new Error("Chave (APIKey) do DataJud inválida ou sem permissão.");
    if (!res.ok) throw new Error(`O DataJud respondeu HTTP ${res.status}.`);
    return await res.json();
  } catch (err) {
    if (err instanceof Error && /APIKey|HTTP/.test(err.message)) throw err;
    if ((err as { name?: string })?.name === "AbortError") throw new Error("Tempo de resposta do DataJud esgotado.");
    throw new Error("Não foi possível conectar ao DataJud.");
  } finally {
    clearTimeout(timer);
  }
}

function summarize(source: any): { court: string; description: string } {
  const classe = source?.classe?.nome ?? "";
  const orgao = source?.orgaoJulgador?.nome ?? "";
  const tribunal = source?.tribunal ?? "";
  const grau = source?.grau ?? "";
  const movs: any[] = Array.isArray(source?.movimentos) ? source.movimentos : [];
  const last = movs
    .slice()
    .sort((a, b) => String(b?.dataHora ?? "").localeCompare(String(a?.dataHora ?? "")))[0];
  const lastTxt = last ? `${last.nome ?? ""}${last.dataHora ? ` (${String(last.dataHora).slice(0, 10)})` : ""}` : "";
  const description = [
    classe && `Classe: ${classe}`,
    orgao && `Órgão: ${orgao}`,
    grau && `Grau: ${grau}`,
    lastTxt && `Último andamento: ${lastTxt}`,
    `Atualizado via DataJud em ${new Date().toLocaleDateString("pt-BR")}`,
  ].filter(Boolean).join("\n");
  return { court: (orgao || tribunal).slice(0, 255), description };
}

/** Enrich existing legal cases (with a CNJ number) using DataJud. */
export async function syncDatajud(ctx: DatajudSyncContext): Promise<{ imported: number }> {
  const cases = await db.getLegalCases(ctx.householdId);
  let updated = 0;
  for (const c of cases) {
    const numero = (c.caseNumber ?? "").replace(/\D/g, "");
    if (numero.length !== 20) continue;
    const alias = aliasForNumero(numero);
    if (!alias) continue;
    let json: any;
    try {
      json = await datajudSearch(alias, { size: 1, query: { match: { numeroProcesso: numero } } }, ctx.apiKey);
    } catch {
      continue; // skip cases whose tribunal lookup fails, keep going
    }
    const source = json?.hits?.hits?.[0]?._source;
    if (!source) continue;
    const { court, description } = summarize(source);
    await db.updateLegalCase(c.id, ctx.householdId, {
      court: court || c.court,
      description: description || c.description,
    } as any);
    updated++;
  }
  return { imported: updated };
}

/** Validate the key by hitting a known tribunal index. */
export async function verifyDatajud(apiKey: string): Promise<void> {
  await datajudSearch("tjsp", { size: 0, query: { match_all: {} } }, apiKey);
}

/** Normalize a DataJud date (ISO "2025-08-18T..." or compact "20250818120000")
 *  to "YYYY-MM-DD", or "" when not parseable. */
function toIsoDate(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = s.replace(/\D/g, "");
  if (d.length >= 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return "";
}

/** Look up a single process by CNJ number, returning structured fields. */
export async function lookupProcess(numero: string, apiKey: string): Promise<Record<string, string> | null> {
  const digits = numero.replace(/\D/g, "");
  const alias = aliasForNumero(digits);
  if (!alias) return null;
  const json = await datajudSearch(alias, { size: 1, query: { match: { numeroProcesso: digits } } }, apiKey);
  const source = json?.hits?.hits?.[0]?._source;
  if (!source) return null;
  const movs: any[] = Array.isArray(source.movimentos) ? source.movimentos : [];
  const last = movs.slice().sort((a, b) => String(b?.dataHora ?? "").localeCompare(String(a?.dataHora ?? "")))[0];
  const lastDate = last ? toIsoDate(last.dataHora) : "";
  const assuntos = Array.isArray(source.assuntos) ? source.assuntos.map((a: any) => a?.nome).filter(Boolean).join(", ") : "";
  return {
    tribunal: String(source.tribunal ?? ""),
    classe: String(source.classe?.nome ?? ""),
    assunto: assuntos,
    grau: String(source.grau ?? ""),
    orgaoJulgador: String(source.orgaoJulgador?.nome ?? ""),
    dataAjuizamento: toIsoDate(source.dataAjuizamento),
    valorCausa: source.valorCausa != null ? String(source.valorCausa) : (source.valorAcao != null ? String(source.valorAcao) : ""),
    ultimoAndamento: last ? `${last.nome ?? ""}${lastDate ? ` (${lastDate})` : ""}` : "",
  };
}
