/**
 * Consultor IA: sends a document's extracted text to Claude (Anthropic) and
 * returns a short summary plus a judgment on whether the document is relevant
 * for the Brazilian income-tax return (and should be sent to the accountant).
 *
 * The document text leaves the server only here, only when the user explicitly
 * triggers an analysis and only if an Anthropic key is configured.
 */
import { ExternalLookupError } from "./lookup";
import { CATEGORY_FIELDS, CATEGORY_LABELS, fieldsForCategory } from "@shared/documentFields";

export type AiProvider = "claude" | "openai";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const CLAUDE_MODEL = process.env.AI_MODEL ?? "claude-sonnet-4-6";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_INPUT_CHARS = 12_000;

export interface DocumentSummary {
  resumo: string;
  pontos: string[];
  comunicarContador: boolean;
  irJustificativa: string;
}

export function buildSummaryPrompt(text: string, title: string, category: string): string {
  const trimmed = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + "\n[...documento truncado...]" : text;
  return [
    `Documento: "${title}" (categoria: ${category}).`,
    "",
    "Analise o documento abaixo e responda SOMENTE com um JSON válido (sem markdown, sem texto fora do JSON), em português do Brasil, no formato:",
    `{`,
    `  "resumo": "2 a 4 frases resumindo o documento",`,
    `  "pontos": ["pontos importantes: partes, valores, prazos, vigência, obrigações, multas, renovação, condições"],`,
    `  "comunicarContador": true ou false (se este documento deve ser informado ao contador para a declaração de Imposto de Renda),`,
    `  "irJustificativa": "1 a 2 frases explicando por que é ou não relevante para o IR"`,
    `}`,
    "",
    "Texto do documento:",
    '"""',
    trimmed,
    '"""',
  ].join("\n");
}

/** Parse the model output into a DocumentSummary, tolerating markdown fences. */
export function parseSummary(modelText: string): DocumentSummary {
  const fallback: DocumentSummary = { resumo: modelText.trim(), pontos: [], comunicarContador: false, irJustificativa: "" };
  const match = modelText.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const obj = JSON.parse(match[0]);
    return {
      resumo: typeof obj.resumo === "string" ? obj.resumo : fallback.resumo,
      pontos: Array.isArray(obj.pontos) ? obj.pontos.filter((p: unknown) => typeof p === "string") : [],
      comunicarContador: obj.comunicarContador === true,
      irJustificativa: typeof obj.irJustificativa === "string" ? obj.irJustificativa : "",
    };
  } catch {
    return fallback;
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Build a friendly, specific error from a failed provider response. */
async function aiError(res: Response, provider: string): Promise<ExternalLookupError> {
  if (res.status === 401 || res.status === 403) {
    return new ExternalLookupError(`Chave da ${provider} inválida ou sem permissão.`);
  }
  const body = await res.text().catch(() => "");
  let detail = "";
  try { detail = (JSON.parse(body)?.error?.message as string) || ""; } catch { detail = body; }
  detail = (detail || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (res.status === 429) {
    return new ExternalLookupError(`Cota/limite da ${provider} atingido — verifique créditos e billing na conta.${detail ? " " + detail : ""}`);
  }
  return new ExternalLookupError(`IA indisponível (${provider} ${res.status})${detail ? ": " + detail : ""}.`);
}

async function callClaude(apiKey: string, system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw await aiError(res, "Anthropic");
  const data = await res.json();
  return Array.isArray(data?.content) ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "";
}

async function callOpenai(apiKey: string, system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw await aiError(res, "OpenAI");
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Single AI call routed to the configured provider. Returns the text output. */
async function callAi(opts: {
  provider: AiProvider;
  apiKey: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  try {
    const max = opts.maxTokens ?? 1024;
    const out = opts.provider === "openai"
      ? await callOpenai(opts.apiKey, opts.system, opts.messages, max)
      : await callClaude(opts.apiKey, opts.system, opts.messages, max);
    if (!out) throw new ExternalLookupError("A IA não retornou conteúdo.");
    return out;
  } catch (err) {
    if (err instanceof ExternalLookupError) throw err;
    throw new ExternalLookupError("Não foi possível falar com a IA (sem acesso ao serviço).");
  }
}

/** Use the LLM to extract a category's structured fields from a document. */
export async function aiExtractFields(opts: {
  provider: AiProvider;
  apiKey: string;
  text: string;
  category: string;
}): Promise<Record<string, string>> {
  const fields = fieldsForCategory(opts.category);
  if (fields.length === 0) return {};
  const fieldList = fields.map((f) => `"${f.key}" (${f.label})`).join(", ");
  const trimmed = opts.text.length > MAX_INPUT_CHARS ? opts.text.slice(0, MAX_INPUT_CHARS) : opts.text;
  const user = [
    `Extraia do documento abaixo os campos: ${fieldList}.`,
    'Responda SOMENTE com um objeto JSON {"chave": "valor"} usando exatamente as chaves em inglês listadas.',
    "Omita os campos que não encontrar — não invente. Valores monetários como \"R$ 1.234,56\"; datas como dd/mm/aaaa.",
    "",
    "Documento:",
    '"""',
    trimmed,
    '"""',
  ].join("\n");
  const out = await callAi({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: "Você extrai dados estruturados de documentos brasileiros. Responda apenas com JSON válido.",
    messages: [{ role: "user", content: user }],
    maxTokens: 800,
  });
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const allowed = new Set(fields.map((f) => f.key));
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (allowed.has(k) && v != null && String(v).trim()) result[k] = String(v).trim();
    }
    return result;
  } catch {
    return {};
  }
}

/** Use the LLM to both classify the document's category and extract its fields. */
export async function aiClassifyAndExtract(opts: {
  provider: AiProvider;
  apiKey: string;
  text: string;
}): Promise<{ category: string; fields: Record<string, string> }> {
  const catLines = Object.keys(CATEGORY_FIELDS)
    .map((key) => {
      const fs = CATEGORY_FIELDS[key].map((f) => f.key).join(", ") || "—";
      return `- ${key} = ${CATEGORY_LABELS[key] ?? key} [campos: ${fs}]`;
    })
    .join("\n");
  const trimmed = opts.text.length > MAX_INPUT_CHARS ? opts.text.slice(0, MAX_INPUT_CHARS) : opts.text;
  const user = [
    "Classifique o documento em UMA categoria (use a chave em inglês) e extraia os campos daquela categoria.",
    "Categorias disponíveis:",
    catLines,
    "",
    'Responda SOMENTE com JSON: {"category":"<chave>","fields":{"campo":"valor"}}.',
    "Omita campos não encontrados — não invente. Datas como dd/mm/aaaa; valores como \"R$ 1.234,56\".",
    "",
    "Documento:",
    '"""',
    trimmed,
    '"""',
  ].join("\n");
  const out = await callAi({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: "Você classifica e extrai dados de documentos brasileiros. Responda apenas com JSON válido.",
    messages: [{ role: "user", content: user }],
    maxTokens: 900,
  });
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) return { category: "other", fields: {} };
  try {
    const obj = JSON.parse(match[0]) as { category?: string; fields?: Record<string, unknown> };
    const category = obj.category && CATEGORY_FIELDS[obj.category] ? obj.category : "other";
    const allowed = new Set(fieldsForCategory(category).map((f) => f.key));
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.fields ?? {})) {
      if (allowed.has(k) && v != null && String(v).trim()) fields[k] = String(v).trim();
    }
    return { category, fields };
  } catch {
    return { category: "other", fields: {} };
  }
}

/** Validate an AI key with a tiny real generation (catches key, quota and
 *  model issues — i.e. exactly what the actual features need). */
export async function verifyAiKey(provider: AiProvider, apiKey: string): Promise<void> {
  const name = provider === "openai" ? "OpenAI" : "Anthropic";
  let res: Response;
  try {
    res = provider === "openai"
      ? await fetch(OPENAI_URL, {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
        })
      : await fetch(ANTHROPIC_URL, {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
        });
  } catch {
    throw new ExternalLookupError("Sem acesso ao serviço de IA (verifique a rede/egress do ambiente).");
  }
  if (!res.ok) throw await aiError(res, name);
}

export async function summarizeDocument(opts: {
  provider: AiProvider;
  apiKey: string;
  text: string;
  title: string;
  category: string;
}): Promise<DocumentSummary> {
  const out = await callAi({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system: "Você é um consultor jurídico-fiscal de um family office brasileiro. Seja objetivo e responda apenas com o JSON solicitado.",
    messages: [{ role: "user", content: buildSummaryPrompt(opts.text, opts.title, opts.category) }],
  });
  return parseSummary(out);
}

/** Multi-turn chat with the family-office assistant. */
export async function chatAssistant(opts: {
  provider: AiProvider;
  apiKey: string;
  context: string;
  messages: ChatMessage[];
}): Promise<string> {
  const system = [
    "Você é o assistente/consultor do family office da família. Responda em português do Brasil, de forma objetiva, prática e cordial.",
    "Você ajuda com finanças pessoais, documentos, patrimônio, questões jurídicas e fiscais (incluindo Imposto de Renda).",
    "Use o contexto abaixo quando for relevante. Não invente dados que não estão no contexto; se não tiver a informação, diga isso e oriente onde encontrar.",
    "",
    "Contexto atual da família:",
    opts.context,
  ].join("\n");
  return callAi({ provider: opts.provider, apiKey: opts.apiKey, system, messages: opts.messages, maxTokens: 1500 });
}

/** Explain a legal case in plain language for a layperson (pt-BR). */
export async function explainLegalCase(opts: {
  provider: AiProvider;
  apiKey: string;
  processo: string;
}): Promise<string> {
  const system = [
    "Você é um advogado que explica processos judiciais em linguagem simples para um cliente leigo, em português do Brasil.",
    "Com base apenas nos dados fornecidos, produza uma explicação curta e prática, em tópicos, contendo quando possível:",
    "1) Do que trata o processo (1–2 frases simples).",
    "2) O que significa a última movimentação.",
    "3) A consequência prática e qual provavelmente é o próximo passo.",
    "4) O nível de risco aparente e o porquê.",
    "5) Perguntas úteis para fazer ao advogado.",
    "Não invente fatos que não estejam nos dados; se faltar informação, diga o que falta. Evite juridiquês.",
  ].join("\n");
  const messages: ChatMessage[] = [{ role: "user", content: `Dados do processo:\n${opts.processo}` }];
  return callAi({ provider: opts.provider, apiKey: opts.apiKey, system, messages, maxTokens: 900 });
}
