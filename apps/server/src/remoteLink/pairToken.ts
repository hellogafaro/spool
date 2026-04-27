/**
 * Module-level bridge for the SaaS pair token between the runtime startup
 * phase that issues it (via T3's BootstrapCredentialService) and the
 * RemoteLink WebSocket layer that ships it to the relay DO.
 *
 * Lifecycle:
 *   - Startup phase calls publishPairToken(token) once the credential is
 *     issued. Idempotent across reconnects within the same process.
 *   - RemoteLink awaits the token at WS-open; if it isn't available yet,
 *     the await resolves once startup publishes it (with a generous
 *     timeout so a busted setup doesn't wedge the env forever).
 */

let storedToken: string | null = null;
let resolveNext: ((token: string) => void) | null = null;
let waiter: Promise<string> | null = null;

function ensureWaiter(): Promise<string> {
  if (waiter) return waiter;
  waiter = new Promise<string>((resolve) => {
    resolveNext = resolve;
  });
  return waiter;
}

export function publishPairToken(token: string): void {
  storedToken = token;
  const resolver = resolveNext;
  resolveNext = null;
  resolver?.(token);
}

export function getPairTokenSync(): string | null {
  return storedToken;
}

export async function awaitPairToken(timeoutMs = 30_000): Promise<string | null> {
  if (storedToken) return storedToken;
  const pending = ensureWaiter();
  return await Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
