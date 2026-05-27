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
  // ISO date for native <input type="date"> consumers.
  set("dataAberturaIso", d.data_inicio_atividade ? String(d.data_inicio_atividade).slice(0, 10) : undefined);
  set("ramo", d.cnae_fiscal_descricao);
  set("telefone", d.ddd_telefone_1 || d.ddd_telefone_2);
  set("email", d.email);
  set("capitalSocial", d.capital_social != null ? String(d.capital_social) : undefined);
  set("dataSituacao", isoToBr(d.data_situacao_cadastral));
  const regime = d.opcao_pelo_mei === true ? "MEI" : d.opcao_pelo_simples === true ? "Simples Nacional" : undefined;
  set("regimeTributario", regime);
  if (Array.isArray(d.inscricoes_estaduais) && d.inscricoes_estaduais.length) {
    const ie = d.inscricoes_estaduais.find((x: any) => x?.ativo) ?? d.inscricoes_estaduais[0];
    set("inscricaoEstadual", ie?.inscricao_estadual);
  }
  if (Array.isArray(d.cnaes_secundarios) && d.cnaes_secundarios.length) {
    set("cnaeSecundarios", d.cnaes_secundarios.map((c: any) => [c.codigo, c.descricao].filter(Boolean).join(" - ")).join("; "));
  }
  return out;
}

export type CnpjSocio = { nome: string; qualificacao: string; cpfCnpj: string };

/** Extract the partner list (QSA) from a BrasilAPI payload. */
export function mapCnpjSocios(d: any): CnpjSocio[] {
  if (!Array.isArray(d.qsa)) return [];
  return d.qsa
    .map((s: any) => ({
      nome: String(s.nome_socio ?? s.nome ?? "").trim(),
      qualificacao: String(s.qualificacao_socio ?? "").trim(),
      cpfCnpj: String(s.cnpj_cpf_do_socio ?? "").trim(),
    }))
    .filter((s: CnpjSocio) => s.nome);
}

export async function lookupCnpj(rawCnpj: string): Promise<{ fields: CnpjLookup; socios: CnpjSocio[] }> {
  const cnpj = onlyDigits(rawCnpj);
  if (cnpj.length !== 14) {
    throw new ExternalLookupError("CNPJ inválido (precisa de 14 dígitos).");
  }
  const data = await fetchLookupJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    notFound: "CNPJ não encontrado na base da Receita.",
    unavailable: "Não foi possível consultar o CNPJ (serviço indisponível).",
  });
  return { fields: mapCnpjResponse(data), socios: mapCnpjSocios(data) };
}
