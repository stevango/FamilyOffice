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
      set("ano", detectYear(t));
      break;
    case "personal":
      set("cpf", detectCpf(t));
      set("validade", detectFirstDate(t));
      break;
    case "company":
      set("cnpj", detectCnpj(t));
      break;
    case "tax":
      set("cpfCnpj", detectCnpj(t) ?? detectCpf(t));
      set("exercicio", detectYear(t));
      break;
    case "insurance":
      set("vigencia", detectFirstDate(t));
      break;
    case "certificate":
      set("dataEmissao", detectFirstDate(t));
      break;
    case "legal":
      set("numeroProcesso", t.match(/\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/)?.[1]);
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
