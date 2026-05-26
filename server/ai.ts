/**
 * Consultor IA: sends a document's extracted text to Claude (Anthropic) and
 * returns a short summary plus a judgment on whether the document is relevant
 * for the Brazilian income-tax return (and should be sent to the accountant).
 *
 * The document text leaves the server only here, only when the user explicitly
 * triggers an analysis and only if an Anthropic key is configured.
 */
import { ExternalLookupError } from "./lookup";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AI_MODEL ?? "claude-sonnet-4-6";
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

/** Single call to Claude's Messages API. Returns the concatenated text output. */
async function callClaude(opts: {
  apiKey: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ExternalLookupError("Chave da Anthropic inválida ou sem permissão.");
    }
    if (!res.ok) {
      throw new ExternalLookupError("Serviço de IA indisponível no momento.");
    }
    const data = await res.json();
    const textOut = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n")
      : "";
    if (!textOut) throw new ExternalLookupError("A IA não retornou conteúdo.");
    return textOut;
  } catch (err) {
    if (err instanceof ExternalLookupError) throw err;
    throw new ExternalLookupError("Não foi possível falar com a IA (sem acesso ao serviço).");
  } finally {
    clearTimeout(timer);
  }
}

export async function summarizeDocument(opts: {
  apiKey: string;
  text: string;
  title: string;
  category: string;
}): Promise<DocumentSummary> {
  const out = await callClaude({
    apiKey: opts.apiKey,
    system: "Você é um consultor jurídico-fiscal de um family office brasileiro. Seja objetivo e responda apenas com o JSON solicitado.",
    messages: [{ role: "user", content: buildSummaryPrompt(opts.text, opts.title, opts.category) }],
  });
  return parseSummary(out);
}

/** Multi-turn chat with the family-office assistant. */
export async function chatWithClaude(opts: {
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
  return callClaude({ apiKey: opts.apiKey, system, messages: opts.messages, maxTokens: 1500 });
}
