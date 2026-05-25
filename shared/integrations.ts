/** Catalog of partner integrations, shared by client and server. */

export type IntegrationProvider = "jusbrasil";

export interface IntegrationMeta {
  id: IntegrationProvider;
  name: string;
  description: string;
  /** Which app module this integration feeds. */
  feeds: string;
  /** Label for the credential the user must paste (token / API key). */
  credentialLabel: string;
  docsUrl?: string;
}

export const INTEGRATIONS: IntegrationMeta[] = [
  {
    id: "jusbrasil",
    name: "Jusbrasil",
    description: "Monitoramento e importação de processos judiciais para o módulo Jurídico.",
    feeds: "Jurídico",
    credentialLabel: "Token de API",
    docsUrl: "https://api.jusbrasil.com.br/docs/index.html",
  },
];

export const INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id) as [IntegrationProvider, ...IntegrationProvider[]];

export function integrationMeta(id: string): IntegrationMeta | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
