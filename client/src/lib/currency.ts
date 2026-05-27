export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Parse a BRL string ("R$ 1.446,37" / "299.900" / "299900") to a number. */
export function parseBRLNum(v?: string): number {
  if (!v) return 0;
  const n = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const f = parseFloat(n);
  return Number.isFinite(f) ? f : 0;
}

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Currency mask that preserves the typed magnitude (thousand separators),
 * allowing an optional decimal part — "299900" → "R$ 299.900", "17356,48" →
 * "R$ 17.356,48".
 */
export function maskMoney(v: string): string {
  const s = v.replace(/[^\d,]/g, "");
  if (!s) return "";
  const [intPart = "", decPart] = s.split(",");
  const intDigits = intPart.replace(/\D/g, "");
  const intFmt = intDigits ? parseInt(intDigits, 10).toLocaleString("pt-BR") : "0";
  if (decPart === undefined) return `R$ ${intFmt}`;
  return `R$ ${intFmt},${decPart.slice(0, 2)}`;
}
