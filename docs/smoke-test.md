# Relay Smoke Test

End-to-end check of the dial-back relay against a local Worker, a local T3 server, and a synthetic browser client. Run before deploying changes to `apps/api` or `apps/server/src/remoteLink/`.

## Prerequisites

- Bun installed.
- Repo bootstrapped (`bun install` at the repo root).
- `wscat` available (`bun x wscat` works).

## 1. Boot the relay

```bash
cd apps/api
bun run dev   # = wrangler dev
```

Leave running. Note the URL it prints (typically `http://127.0.0.1:8787`).

Verify health:

```bash
curl -s http://127.0.0.1:8787/health
# → ok
curl -s http://127.0.0.1:8787/version | jq
# → { "product": "trunk-api", "version": "0.0.0", "protocolVersion": 1 }
```

## 2. Boot a T3 server pointed at the relay

In a fresh shell:

```bash
export TRUNK_HOME=$(mktemp -d)
export TRUNK_API_URL=ws://127.0.0.1:8787
bun run apps/server/src/bin.ts pair
```

The `pair` command writes `$TRUNK_HOME/.trunk/config.json` and prints a `serverId`. Note it.

Then start T3:

```bash
bun run apps/server/src/bin.ts start --port 3773
```

In the wrangler terminal you should see an inbound WebSocket on `/server` from `127.0.0.1` carrying the `x-trunk-server-proof` header. The T3 process logs should show `RemoteLink → connected`.

## 3. Drive a browser-like client

In a third shell:

```bash
SERVER_ID=<value from step 2>
bun x wscat -H "authorization: Bearer test" \
  -c "ws://127.0.0.1:8787/ws?serverId=${SERVER_ID}"
```

Expected behavior:

- Wrangler logs a `/ws` upgrade.
- Wrangler shows the DO sending `{"type":"dial","channelId":"…"}` on the server's control WS.
- The T3 process logs an outbound dial-back to `/server-channel?channelId=…` and a loopback WS to `127.0.0.1:3773/ws`.
- The wscat session stays open. Typing in wscat sends frames into the relay → server → T3's local `/ws`.

What you'll see depends on T3's RPC framing — for a sanity check, paste any string and confirm wscat does not see an immediate disconnect (the upgrade succeeded and the bridge is live).

## 4. Multi-device check

Open a second `wscat` session against the same `serverId` in another shell. Both should connect simultaneously, each generating its own `channelId`. The first session should not be kicked. T3 sees two independent local upgrades.

## 5. Teardown

- Ctrl-C the wscat sessions.
- Ctrl-C the T3 server.
- Ctrl-C wrangler dev.
- `rm -rf $TRUNK_HOME`.

## Failure modes & what they mean

| Symptom                                                | Likely cause                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curl /health` 5xx                                     | Wrangler isn't running or the Worker fails to load.                                                                                                                                                                                                                     |
| T3 logs `RemoteLink → disconnected` repeatedly         | `TRUNK_API_URL` mismatch, or `serverSecret` rejected by the Worker (presence check still passes, so this means the upgrade didn't happen — usually wrong URL).                                                                                                          |
| Browser WS gets close code 1013                        | Server side never connected, or its outbound dropped.                                                                                                                                                                                                                   |
| Browser WS gets close code 4404 (on `/server-channel`) | Channel id expired (browser closed before server dialed back).                                                                                                                                                                                                          |
| T3 doesn't log a loopback connection                   | `config.port` is 0 or the `/ws` upgrade target is misconfigured. RemoteLink only runs when `config.port > 0`.                                                                                                                                                           |
| Loopback dial reaches T3 but T3 returns 401            | The `x-trunk-loopback-trust` header is missing or doesn't match the in-process token. RemoteLink generates the token at boot and `ServerAuth` synthesises an owner session when it matches; if you see this, RemoteLink and ServerAuth booted from different processes. |

## When this test should run

- After any change to `apps/api/src/index.ts` or `apps/api/src/protocol.ts`.
- After any change to `apps/server/src/remoteLink/`.
- Before each release.

The unit tests (`apps/api/src/index.test.ts`, `apps/server/src/remoteLink/RemoteLink.test.ts`) cover the routing logic in isolation. This smoke test is what catches wiring mismatches between the two halves.
