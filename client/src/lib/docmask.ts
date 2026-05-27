import { onlyDigits, maskMoney } from "@/lib/currency";
import { fieldsForCategory } from "@shared/documentFields";

// ---- Input masks (CPF/CNPJ, telefone, data) ----
export function maskCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}
export function maskCnpj(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
}
export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function maskDate(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
/** Apply the right mask to a field's value, inferred from its key. */
export function maskValue(key: string, value: string): string {
  const k = key.toLowerCase();
  if (k === "cpfcnpj") return onlyDigits(value).length > 11 ? maskCnpj(value) : maskCpf(value);
  if (k.endsWith("cnpj")) return maskCnpj(value);
  if (k.endsWith("cpf")) return maskCpf(value);
  if (k.includes("telefone") || k.includes("celular") || k.includes("fone")) return maskPhone(value);
  if (k.includes("data") || k === "validade" || k === "vigencia" || k === "primeirahabilitacao") return maskDate(value);
  if (k.includes("valor") || k === "lance" || k === "premio" || k.startsWith("rendimentos") || k === "impostoretido") return maskMoney(value);
  return value;
}

/** Drop metadata values for category fields that are currently hidden by their
 *  `showWhen` rule, so stale values (e.g. a CPF left over after switching to
 *  Pessoa jurídica) don't linger and confuse downstream logic. */
export function pruneHiddenFields(category: string, meta: Record<string, string>): Record<string, string> {
  const hidden = new Set<string>();
  for (const f of fieldsForCategory(category)) {
    if (!f.showWhen) continue;
    const visible = f.showWhen.every((c) => {
      const v = meta[c.field];
      if (c.valueNot !== undefined) return Array.isArray(c.valueNot) ? !c.valueNot.includes(v) : v !== c.valueNot;
      return Array.isArray(c.value) ? c.value.includes(v) : v === c.value;
    });
    if (!visible) hidden.add(f.key);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) if (!hidden.has(k)) out[k] = v;
  return out;
}

/** Estimated end date = adesão + N installments (months), as dd/mm/aaaa.
 *  Accepts dd/mm/aaaa, dd-mm-aaaa or aaaa-mm-dd for the start date. */
export function computeEncerramento(dataAdesao?: string, parcelas?: string): string | null {
  const s = (dataAdesao ?? "").trim();
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else { m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } }
  const n = parseInt((parcelas ?? "").replace(/\D/g, ""), 10);
  if (y == null || mo == null || d == null || !n) return null;
  const dt = new Date(Date.UTC(y, mo - 1 + n, d));
  if (Number.isNaN(dt.getTime())) return null;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
}
