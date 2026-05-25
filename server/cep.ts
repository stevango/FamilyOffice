/** Look up a Brazilian address by CEP via BrasilAPI (no auth required). */
import { ExternalLookupError, fetchLookupJson, onlyDigits } from "./lookup";

export type CepLookup = Record<string, string>;

export function formatCep(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length !== 8) return digits;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Map a BrasilAPI `/cep/v2` payload to our property field keys. Pure & testable. */
export function mapCepResponse(d: any): CepLookup {
  const out: CepLookup = {};
  if (d.cep) out.cep = formatCep(String(d.cep));

  const street = [d.street, d.neighborhood].filter(Boolean).join(", ");
  const city = [d.city, d.state].filter(Boolean).join("/");
  const endereco = [street, city].filter(Boolean).join(" - ").trim();
  if (endereco) out.endereco = endereco;
  return out;
}

export async function lookupCep(rawCep: string): Promise<CepLookup> {
  const cep = onlyDigits(rawCep);
  if (cep.length !== 8) {
    throw new ExternalLookupError("CEP inválido (precisa de 8 dígitos).");
  }
  const data = await fetchLookupJson(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
    notFound: "CEP não encontrado.",
    unavailable: "Não foi possível consultar o CEP (serviço indisponível).",
  });
  return mapCepResponse(data);
}
