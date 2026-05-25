/** Look up public company data by CNPJ via BrasilAPI (no auth required). */
import { ExternalLookupError, fetchLookupJson, onlyDigits } from "./lookup";

export type CnpjLookup = Record<string, string>;

export function formatCnpj(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCep(cep: string | number | null | undefined): string | undefined {
  if (cep == null) return undefined;
  const d = onlyDigits(String(cep));
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : undefined;
}

function isoToBr(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : undefined;
}

function joinEndereco(d: any): string | undefined {
  const parts: string[] = [];
  const street = [d.logradouro, d.numero].filter(Boolean).join(", ");
  if (street) parts.push(street);
  if (d.complemento) parts.push(String(d.complemento));
  if (d.bairro) parts.push(String(d.bairro));
  const city = [d.municipio, d.uf].filter(Boolean).join("/");
  if (city) parts.push(city);
  const cep = formatCep(d.cep);
  if (cep) parts.push(`CEP ${cep}`);
  const out = parts.join(" - ").trim();
  return out || undefined;
}

/** Map a BrasilAPI `/cnpj/v1` payload to our company field keys. Pure & testable. */
export function mapCnpjResponse(d: any): CnpjLookup {
  const out: CnpjLookup = {};
  const set = (k: string, v: string | undefined | null) => {
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  };
  set("cnpj", d.cnpj ? formatCnpj(String(d.cnpj)) : undefined);
  set("razaoSocial", d.razao_social);
  set("nomeFantasia", d.nome_fantasia);
  set("dataAbertura", isoToBr(d.data_inicio_atividade));
  set("situacao", d.descricao_situacao_cadastral);
  set("naturezaJuridica", d.natureza_juridica);
  if (d.cnae_fiscal || d.cnae_fiscal_descricao) {
    set("cnae", [d.cnae_fiscal, d.cnae_fiscal_descricao].filter(Boolean).join(" - "));
  }
  set("porte", d.descricao_porte || d.porte);
  set("endereco", joinEndereco(d));
  return out;
}

export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookup> {
  const cnpj = onlyDigits(rawCnpj);
  if (cnpj.length !== 14) {
    throw new ExternalLookupError("CNPJ inválido (precisa de 14 dígitos).");
  }
  const data = await fetchLookupJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    notFound: "CNPJ não encontrado na base da Receita.",
    unavailable: "Não foi possível consultar o CNPJ (serviço indisponível).",
  });
  return mapCnpjResponse(data);
}
