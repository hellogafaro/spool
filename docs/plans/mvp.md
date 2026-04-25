# Trunk MVP Plan

## Goal

Trunk is a remote-first web UI for AI coding CLIs. Users host the server (T3) on their own machine. Trunk hosts the web app and a stateless WebSocket relay so the browser can reach the user's server without exposing it to the public internet.

## Domains

- `trunk.codes` — marketing site (Cloudflare Pages).
- `app.trunk.codes` — hosted Vite web app (Cloudflare Pages).
- `api.trunk.codes` — WebSocket relay (Cloudflare Worker + Durable Object).

## Core Architecture

```txt
[Browser] <── wss://api.trunk.codes/ws ──> [api Worker + DO] <── wss://…/server (control) ──> [User's machine, T3]
                                                  ↕
                                          /server-channel (paired per browser)
```

The user's machine never accepts inbound connections. T3 dials the relay outbound. Each browser gets its own paired connection through the relay so T3 sees a normal local WebSocket upgrade per browser — its existing multi-session, bearer-auth, and reactive RPC code handle the rest.

## Hosted API

Single Cloudflare Worker fronting one Durable Object class (`ServerRoom`), keyed by `serverId`.

Endpoints:

- `GET /health`
- `GET /version`
- `WSS /server` — long-lived control WebSocket from the user's server.
- `WSS /server-channel?serverId=…&channelId=…` — per-browser pair, opened by the server in response to a dial signal.
- `WSS /ws?serverId=…` — browser-side connection. The Worker generates a `channelId`, holds the browser socket, sends `{ type: "dial", channelId }` to the server's control WS, and bridges bytes once the server connects to `/server-channel`.

The Durable Object holds in-memory references only. No storage writes. If the Worker or DO restarts, sockets drop and reconnect.

## Multi-Device

Each browser gets its own pair through the relay. T3's existing per-upgrade session handler treats every paired connection as an independent local browser, so multi-device "just works" without any multiplexing protocol or channel envelope.

A single user with their laptop, phone, and second computer all connected at once: three independent pairs, three sessions, all reactive over WS.

## Stored State

Trunk hosts no per-user state for the transport. The relay is stateless beyond live socket references in the DO.

User machine stores `~/.trunk/config.json`:

```json
{
  "serverId": "happy-harbor-sd52",
  "serverSecret": "<256-bit hex>",
  "userId": "<optional WorkOS user id>"
}
```

`serverId` is public. `serverSecret` is local-only — used as the `x-trunk-server-proof` header on outbound dials. T3's own state (sessions, bearer tokens, projects, prompts, code, terminal output) stays on the user's machine.

## Authentication

For MVP we lean on T3's existing auth surface and treat the API as a transparent transport.

- **Server → relay**: server proves itself with `x-trunk-server-proof: <serverSecret>` on the outbound `/server` and `/server-channel` upgrades.
- **Browser → relay**: browser presents `Authorization: Bearer <token>` on `/ws`. The token is issued by T3's existing session-issuance flow (`trunk session issue --role owner` etc.).
- **Browser → server (inside the WS)**: T3's `authenticateWebSocketUpgrade` validates the bearer token at the local upgrade. T3 already supports remote-reachable auth policy.

The MVP API only checks header **presence**. Real verification (WorkOS JWT for browser, signed proof for server) lands as the next phase.

## Trust Model

Standard SaaS trust shape:

- TLS to Cloudflare. Cloudflare can technically observe traffic in the relay; our terms say we don't.
- Provider credentials (Anthropic/OpenAI keys, etc.) and source code never leave the user's machine — only T3's own RPC frames cross the wire, which mostly carry the same bytes the LLM provider would see anyway.
- T3's pairing tokens, bearer sessions, and revoke endpoints are the auth moat.

End-to-end encryption is **deferred**. The relay is byte-opaque already, so layering ECDH + AEAD on top is additive (~110 lines) and can be added if customers demand "Cloudflare cannot read my traffic" as an architectural property.

## Pairing Flow

Today (MVP):

1. User installs Trunk on their machine.
2. User runs `bun run apps/server/scripts/trunk-pair.ts` (eventually `trunk pair`). Generates `serverId` + `serverSecret`, writes `~/.trunk/config.json`, prints `wss://api.trunk.codes/?serverId=…`.
3. User runs `trunk session issue --role owner` to mint a bearer token.
4. User opens `app.trunk.codes`, adds an environment with the printed URL and the bearer token.
5. Browser connects → API generates channelId → signals server → server dials back → bridge → T3 authenticates → session live.

WorkOS-backed collaboration (future):

- Owner pairs the server with WorkOS identity (their `userId` written to `~/.trunk/config.json` and to WorkOS user metadata as `serverId`).
- Owner invites collaborators via WorkOS.
- Each invitee logs in via AuthKit and inherits a server-scoped bearer token bound to the shared server.

## Install Flow

```bash
curl -fsSL https://trunk.codes/install | bash
```

Installer responsibilities (MVP target):

- Install Bun if needed.
- Install the Trunk server.
- Run `trunk pair` to bootstrap `~/.trunk/config.json`.
- Register systemd / launchd to start T3 + outbound dial on boot.
- Print the pairing URL and a bearer-token instruction.

No public ports, no DNS, no router config, no Caddy, no Cloudflare Tunnel.

## Commands (CLI)

MVP-target commands on the `trunk` CLI:

- `trunk server` — run the local server (existing T3 entry point).
- `trunk pair` — bootstrap `~/.trunk/config.json`. Wraps the script above.
- `trunk status` — show local server state and remote-link snapshot.
- `trunk session issue` — already exists in T3; documented as the bearer-token mint.
- `trunk update` — update Trunk + bundled CLIs.
- `trunk unpair` — clear `userId` (and optionally rotate `serverSecret`) to require re-pairing.

## Deployment

- `apps/marketing` → Cloudflare Pages, `trunk.codes`.
- `apps/web` → Cloudflare Pages, `app.trunk.codes`. Build env: `VITE_WS_URL=wss://api.trunk.codes` (so the RPC client's forced `/ws` path lands on the relay's browser endpoint).
- `apps/api` → Cloudflare Worker + Durable Object, `api.trunk.codes`.

## Validation

- Treat Wrangler output as part of the test result; investigate noisy local logs before calling a slice ready.
- `apps/api` runs in `workerd` via `@cloudflare/vitest-pool-workers` (pinned to vitest 3 because pool-workers is not yet vitest-4 compatible).
- Run end-to-end checks against `wrangler dev` + a real T3 server before each release.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Trunk branding + distribution surfaces over T3 internals | Done. |
| 2 | `apps/api` zero-storage DO routing skeleton | Done (`bea0bbc1`, `1c17493f`). |
| 3 | Server outbound `RemoteLink` with reconnect | Done (`52523f49`). |
| 4 | Dial-back relay so each browser gets its own pair (multi-device) | Done (`a9289187`, `c9abb866`, `a3e53044`). |
| 4a | `trunk pair` bootstrap script | Done (`e77ed108`). |
| 5 | Real WorkOS verification at the API edge (browser auth + server proof) | Not started. |
| 6 | WorkOS-backed collaboration (multi-user per server) | Not started. |
| 7 | Installer + service registration | Not started. |
| 8 | Reconnect / offline / version-mismatch UX in the web app | Not started. |
| 9 | `trunk update` / `trunk unpair` / key rotation | Not started. |
| 10 | PostHog + error reporting with strict redaction | Not started. |

## Non-Goals (MVP)

- No managed Cloudflare Tunnels. Pricing model doesn't fit a free product at scale.
- No relay-side database or state. The DO is in-memory only.
- No Trunk-hosted session storage. T3's local SQLite remains the source of truth.
- No provider credential storage outside the user machine.
- No CLI abstraction or replacement.
- No public inbound port requirement.
- No end-to-end encryption layer in MVP. Standard SaaS trust shape.
- No multiplexing protocol (channel ids in frame envelopes). Each browser gets its own pair.

## Open Decisions

- Whether to inline `trunk pair` as a Command-framework subcommand now or keep the script-based flow until installer work begins.
- WorkOS AuthKit integration shape — still a hosted-UI redirect from `app.trunk.codes`, plus a CLI device-flow for server pairing.
- Whether to add HTTP forwarding through the API for the `/api/auth/*` pairing endpoints, or keep pairing fully WS-mediated.
- Compatibility / protocol version handshake between app, API, and server.
- License (MIT vs. Apache 2.0) for open-source release.
