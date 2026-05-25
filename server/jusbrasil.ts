/**
 * Jusbrasil connector. The credential management, the sync orchestration and
 * the UI are all in place; the only piece pending is the provider-specific
 * HTTP call below, which needs the official API spec (auth scheme + the
 * processo-lookup endpoint + response shape).
 *
 * TO ACTIVATE once the API documentation is available:
 *   1. Call the search endpoint with the auth header (e.g. Bearer token),
 *      paginating through results.
 *   2. Map each processo to InsertLegalCase fields (title, caseNumber, court,
 *      status, nextDeadline, ...), deduping against existing cases by
 *      caseNumber so manually-entered cases are not duplicated.
 *   3. Upsert into legal_cases for the household and return the imported count.
 */

export class IntegrationPendingError extends Error {}

export interface SyncContext {
  apiKey: string;
  householdId: number;
  userId: number;
}

export async function syncJusbrasil(_ctx: SyncContext): Promise<{ imported: number }> {
  throw new IntegrationPendingError(
    "Conector do Jusbrasil pronto — aguardando a documentação da API para ativar a sincronização.",
  );
}
