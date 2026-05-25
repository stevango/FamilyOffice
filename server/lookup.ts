/** Shared helpers for external public-data lookups (CNPJ, CEP) via BrasilAPI. */

export class ExternalLookupError extends Error {
  constructor(message: string, readonly notFound = false) {
    super(message);
  }
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Fetch JSON with a hard timeout, mapping failures to friendly messages. */
export async function fetchLookupJson(
  url: string,
  messages: { notFound: string; unavailable: string },
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (res.status === 404) throw new ExternalLookupError(messages.notFound, true);
    if (!res.ok) throw new ExternalLookupError(messages.unavailable);
    return await res.json();
  } catch (err) {
    if (err instanceof ExternalLookupError) throw err;
    // Network blocked/timeout/etc. — keep the message actionable.
    throw new ExternalLookupError(messages.unavailable);
  } finally {
    clearTimeout(timer);
  }
}
