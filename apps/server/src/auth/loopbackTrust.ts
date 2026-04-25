/**
 * Process-scoped trust token shared between RemoteLink (the writer) and
 * ServerAuth (the reader). RemoteLink generates a random secret at startup
 * and stamps it as `x-trunk-loopback-trust` on every loopback dial-back to
 * the local server. ServerAuth treats requests carrying that header as
 * pre-authenticated by the SaaS relay, so they bypass T3's pairing flow.
 *
 * The token never leaves process memory, so possessing it implies caller
 * is inside this process. RemoteLink is the only thing that opens loopback
 * sockets to /ws, which makes the header itself the trust marker.
 */

export const LOOPBACK_TRUST_HEADER = "x-trunk-loopback-trust";

let token: string | null = null;

export function setLoopbackTrustToken(value: string): void {
  token = value;
}

export function getLoopbackTrustToken(): string | null {
  return token;
}
