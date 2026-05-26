import { createRequire } from "node:module";
import path from "node:path";
import { ENV } from "./_core/env";

const require = createRequire(import.meta.url);

// ---------- Field detectors (Brazilian documents) ----------

function detectPlaca(text: string): string | undefined {
  const keyed = text.match(/PLACA[:\s]*([A-Z]{3}[-\s]?\d[A-Z0-9]\d{2})/i);
  const raw = keyed?.[1] ?? text.match(/\b([A-Z]{3}[-\s]?\d[A-Z]\d{2})\b/)?.[1] ?? text.match(/\b([A-Z]{3}[-\s]?\d{4})\b/)?.[1];
  return raw ? raw.replace(/[-\s]/g, "").toUpperCase() : undefined;
}

function detectRenavam(text: string): string | undefined {
  return text.match(/RENAVAM[:\s]*(\d{9,11})/i)?.[1] ?? text.match(/\b(\d{11})\b/)?.[1];
}

function detectChassi(text: string): string | undefined {
  const keyed = text.match(/CHASSI[:\s]*([A-HJ-NPR-Z0-9]{17})/i)?.[1];
  return (keyed ?? text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1])?.toUpperCase();
}

function detectCpf(text: string): string | undefined {
  return text.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/)?.[1] ?? text.match(/CPF[:\s]*(\d{11})\b/i)?.[1];
}

function detectCnpj(text: string): string | undefined {
  return text.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)?.[1] ?? text.match(/CNPJ[:\s]*(\d{14})\b/i)?.[1];
}

function detectFirstDate(text: string): string | undefined {
  return text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1];
}

function detectYear(text: string): string | undefined {
  return text.match(/\bAN[OO][:\s]*((?:19|20)\d{2})\b/i)?.[1] ?? text.match(/\bEXERC[IÍ]CIO[:\s]*((?:19|20)\d{2})\b/i)?.[1];
}

/** A date that follows a "validade/válida até" label, else the first date found. */
function detectValidade(text: string): string | undefined {
  return text.match(/(?:VALIDADE|V[ÁA]LIDA?\s+AT[ÉE])[:\s]*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? detectFirstDate(text);
}

function detectRg(text: string): string | undefined {
  return text.match(/\bRG[:\s]*([\d.]{5,12}-?[\dxX])/i)?.[1];
}

/** Issuing authority such as SSP-SP or DETRAN/RJ. */
function detectOrgaoEmissor(text: string): string | undefined {
  const m = text.match(/\b(SSP|DETRAN)\s*[\/-]?\s*([A-Z]{2})?\b/i);
  if (!m) return undefined;
  return m[2] ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : m[1].toUpperCase();
}

/** A monetary amount like "R$ 1.234,56". */
function detectValor(text: string): string | undefined {
  const m = text.match(/R\$\s*([\d.]{1,12},\d{2})/);
  return m ? `R$ ${m[1]}` : undefined;
}

function detectRazaoSocial(text: string): string | undefined {
  return text.match(/(?:RAZ[ÃA]O\s+SOCIAL|NOME\s+EMPRESARIAL)[:\s]+([A-ZÀ-Ú0-9][^\n;]{2,60})/i)?.[1]?.trim();
}

function detectInscricaoEstadual(text: string): string | undefined {
  return text.match(/INSCRI[ÇC][ÃA]O\s+ESTADUAL[:\s]*([\d.\/-]{6,20})/i)?.[1];
}

/** "Nome de fantasia" / "Título do estabelecimento" on the cartão CNPJ. */
function detectNomeFantasia(text: string): string | undefined {
  return text.match(/NOME\s+(?:DE\s+)?FANTASIA[)\s:.*-]*([A-ZÀ-Ú0-9][^\n;]{1,60})/i)?.[1]?.trim();
}

function detectDataAbertura(text: string): string | undefined {
  return text.match(/DATA\s+DE\s+ABERTURA[:\s]*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
}

/** Cadastral status on the cartão CNPJ. Constrained to real statuses because
 *  the document title also contains the words "situação cadastral". */
function detectSituacaoCadastral(text: string): string | undefined {
  return text.match(/SITUA[ÇC][ÃA]O\s+CADASTRAL[:\s]*(ATIVA|BAIXADA|INAPTA|SUSPENSA|NULA)/i)?.[1]?.toUpperCase();
}

function detectMatricula(text: string): string | undefined {
  return text.match(/MATR[IÍ]CULA[:\s]*(?:N[º°.]?\s*)?(\d{2,})/i)?.[1];
}

function detectApolice(text: string): string | undefined {
  return text.match(/AP[ÓO]LICE[:\s]*(?:N[º°.]?\s*)?([\d.\-\/]{4,})/i)?.[1];
}

function detectCnhRegistro(text: string): string | undefined {
  return text.match(/(?:N[º°.]?\s*)?REGISTRO[:\s]*(\d{9,11})/i)?.[1];
}

/** CNH driving category (A, B, AB, AC, ...). Tolerates the "CAT. HAB." label. */
function detectCnhCategoria(text: string): string | undefined {
  return text.match(/\bCAT(?:EGORIA)?\.?\s*(?:HAB\.?)?\s*[:]?\s*(ACC|AB|AC|AD|AE|A|B|C|D|E)\b/i)?.[1]?.toUpperCase();
}

function detectPrimeiraHabilitacao(text: string): string | undefined {
  return text.match(/(?:1[ªA°º.]?\s*|PRIMEIRA\s+)HABILITA[ÇC][ÃA]O[:\s]*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
}

function detectGrupo(text: string): string | undefined {
  return text.match(/\bGRUPO[:\s]*(\d{3,6})\b/i)?.[1];
}

function detectCota(text: string): string | undefined {
  return text.match(/\bCOTA[:\s]*(\d{1,6})\b/i)?.[1];
}

function detectParcelas(text: string): string | undefined {
  return text.match(/\b(\d{1,3})\s*PARCELAS\b/i)?.[1] ?? text.match(/\b(?:PRAZO|PARCELAS|N[º°.]?\s*PARCELAS)[:\s]*(\d{1,3})\b/i)?.[1];
}

/** Map raw OCR/PDF text to the structured fields of a category (best effort). */
export function extractFields(text: string, category: string): Record<string, string> {
  const t = text.replace(/ /g, " ");
  const out: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => {
    if (v) out[k] = v;
  };

  switch (category) {
    case "vehicle":
      set("placa", detectPlaca(t));
      set("renavam", detectRenavam(t));
      set("chassi", detectChassi(t));
      set("anoFabricacao", detectYear(t));
      break;
    case "personal":
      set("cpf", detectCpf(t));
      set("rg", detectRg(t));
      set("orgaoEmissor", detectOrgaoEmissor(t));
      set("validade", detectValidade(t));
      break;
    case "cnh":
      set("cpf", detectCpf(t));
      set("numeroRegistro", detectCnhRegistro(t));
      set("categoria", detectCnhCategoria(t));
      set("validade", detectValidade(t));
      set("primeiraHabilitacao", detectPrimeiraHabilitacao(t));
      set("orgaoEmissor", detectOrgaoEmissor(t));
      break;
    case "company":
      set("cnpj", detectCnpj(t));
      set("razaoSocial", detectRazaoSocial(t));
      set("nomeFantasia", detectNomeFantasia(t));
      set("dataAbertura", detectDataAbertura(t));
      set("situacao", detectSituacaoCadastral(t));
      set("inscricaoEstadual", detectInscricaoEstadual(t));
      break;
    case "property":
      set("matricula", detectMatricula(t));
      break;
    case "tax":
    case "ir":
      set("cpfCnpj", detectCnpj(t) ?? detectCpf(t));
      set("exercicio", detectYear(t));
      set("valor", detectValor(t));
      break;
    case "insurance":
      set("apolice", detectApolice(t));
      set("vigencia", detectFirstDate(t));
      set("valor", detectValor(t));
      break;
    case "contract":
      set("vigencia", detectFirstDate(t));
      set("valor", detectValor(t));
      break;
    case "consorcio":
      set("grupo", detectGrupo(t));
      set("cota", detectCota(t));
      set("parcelas", detectParcelas(t));
      set("valorParcela", detectValor(t));
      break;
    case "certificate":
      set("dataEmissao", detectFirstDate(t));
      break;
    case "legal":
      set("numeroProcesso", t.match(/\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/)?.[1]);
      break;
    case "finance":
      set("valor", detectValor(t));
      set("data", detectFirstDate(t));
      break;
    case "studies":
      set("conclusao", detectFirstDate(t));
      break;
    default:
      break;
  }
  return out;
}

// ---------- Text extraction from files ----------

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Use the legacy build for Node (no DOM).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  let text = "";
  const maxPages = Math.min(doc.numPages, 10);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await doc.cleanup().catch(() => {});
  return text;
}

async function extractImageText(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const langPath = path.dirname(require.resolve("@tesseract.js-data/por/4.0.0/por.traineddata.gz"));
  const worker = await createWorker("por", 1, {
    langPath,
    gzip: true,
    cachePath: path.join(ENV.dataDir, ".ocr-cache"),
  });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract raw text from a document. Digital PDFs use text extraction; images
 * use local OCR. Returns "" if the type is unsupported or extraction fails.
 */
export async function extractText(buffer: Buffer, mimeType: string | undefined): Promise<string> {
  try {
    if (mimeType?.includes("pdf")) {
      const text = await extractPdfText(buffer);
      return text.trim();
    }
    if (mimeType?.startsWith("image/")) {
      return (await extractImageText(buffer)).trim();
    }
  } catch (err) {
    console.warn("[extract] failed:", err instanceof Error ? err.message : err);
  }
  return "";
}
