/** Catalog of partner integrations, shared by client and server. */

export type IntegrationProvider = "jusbrasil" | "digesto" | "datajud" | "claude" | "openai";

export interface IntegrationMeta {
  id: IntegrationProvider;
  name: string;
  description: string;
  /** Which app module this integration feeds. */
  feeds: string;
  /** Label for the credential the user must paste (token / API key). */
  credentialLabel: string;
  docsUrl?: string;
  /** Whether the provider exposes a manual "sync now" action. */
  supportsSync?: boolean;
  /** Whether the provider supports a "test connection" check. */
  supportsTest?: boolean;
}

export const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: "jusbrasil",
    name: "Jusbrasil",
    description: "Monitoramento e importação de processos judiciais para o módulo Jurídico.",
    feeds: "Jurídico",
    credentialLabel: "Token de API",
    docsUrl: "https://api.jusbrasil.com.br/docs/index.html",
    supportsSync: true,
  },
  {
    id: "digesto",
    name: "Digesto",
    description: "Monitoramento de processos judiciais e importação dos andamentos para o módulo Jurídico.",
    feeds: "Jurídico",
    credentialLabel: "Token de API (Digesto)",
    docsUrl: "https://op.digesto.com.br/doc_api/monitoramento.html",
    supportsSync: true,
    supportsTest: true,
  },
  {
    id: "datajud",
    name: "DataJud (CNJ)",
    description: "API Pública do CNJ. Enriquece os processos já cadastrados no Jurídico com classe, órgão julgador e o último andamento oficial (consulta pelo número CNJ).",
    feeds: "Jurídico",
    credentialLabel: "Chave pública (APIKey) do DataJud",
    docsUrl: "https://datajud-wiki.cnj.jus.br/api-publica/acesso",
    supportsSync: true,
    supportsTest: true,
  },
  {
    id: "claude",
    name: "Consultor IA (Claude)",
    description: "Resumo inteligente de documentos e contratos, com alerta de relevância para o Imposto de Renda. O texto do documento é enviado à Anthropic apenas quando você solicita a análise.",
    feeds: "Documentos / Assistente",
    credentialLabel: "API Key (Anthropic)",
    docsUrl: "https://docs.anthropic.com/en/api/overview",
    supportsTest: true,
  },
  {
    id: "openai",
    name: "Consultor IA (OpenAI)",
    description: "Alternativa de IA para resumo de documentos e chat do assistente. O texto é enviado à OpenAI apenas quando você solicita. Se ambas estiverem configuradas, o Claude é usado por padrão.",
    feeds: "Documentos / Assistente",
    credentialLabel: "API Key (OpenAI)",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    supportsTest: true,
  },
];

export const INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id) as [IntegrationProvider, ...IntegrationProvider[]];

export function integrationMeta(id: string): IntegrationMeta | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
