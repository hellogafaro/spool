# Trunk MVP Plan

## Goal

Trunk is a remote-first web UI for AI coding CLIs. Users host the server and CLIs on their own machine. Trunk hosts the web app and a zero-DB WebSocket API that connects the browser to the user's server over an encrypted outbound server connection.

## Domains

- `trunk.codes`: marketing site.
- `app.trunk.codes`: hosted Vite web app.
- `api.trunk.codes`: zero-DB WebSocket API.

## Core Architecture

The user machine runs the existing T3 Code server. The server optionally dials the hosted API for remote access.

```txt
Browser app <-> api.trunk.codes <-> Trunk server
```

The API exists because the Vite app is static and cannot accept WebSockets from user servers. Both browser and server make outbound WebSocket connections to the API.

## Hosted API

Deploy `api.trunk.codes` on Cloudflare Workers with Durable Objects.

- Worker routes requests and verifies request shape/auth.
- One Durable Object instance is addressed by `serverId`.
- Durable Object holds live WebSocket references in memory.
- Durable Object forwards encrypted frames between browser and server.
- Durable Object does not write storage.
- API has no database.

Endpoints:

- `GET /health`
- `GET /version`
- `WSS /server`
- `WSS /browser`

If the Worker or Durable Object restarts, active sockets drop and reconnect. Durable pairing state is not lost because it lives in WorkOS and on the user machine.

## Stored State

WorkOS user metadata stores only a non-secret server pointer:

```json
{ "serverId": "happy-coffee-a7k9" }
```

User machine stores local server state in `~/.trunk/config.json`:

```json
{
  "serverId": "happy-coffee-a7k9",
  "serverSecret": "random-256-bit-secret",
  "userId": "user_abc123"
}
```

`serverId` is public. `serverSecret` is local-only. Provider credentials, sessions, code, diffs, files, prompts, and terminal output remain on the user machine.

## Authentication

The hosted app uses WorkOS AuthKit hosted UI.

Browser connection requirements:

- User is authenticated with WorkOS.
- Browser requests the `serverId` from WorkOS metadata.
- API verifies WorkOS auth before routing.

Server connection requirements:

- Server authenticates with WorkOS CLI Auth.
- Server registers its public `serverId`.
- API never stores server credentials.

Final authorization happens on the user server side:

- The WorkOS `userId` must match local `~/.trunk/config.json.userId`.

## Encryption

Browser and server establish end-to-end encryption through the API before application traffic flows.

- API forwards key-exchange messages.
- Browser and server derive a session key.
- Browser encrypts T3/WebSocket frames.
- Server decrypts and handles them locally.
- Server encrypts local responses.
- API forwards ciphertext only.

API can observe `serverId`, connection timing, byte counts, and online/offline status. API must not be able to read prompts, code, diffs, files, terminal output, provider credentials, or conversation payloads.

## Pairing Flow

Installer initializes:

- `serverId`
- WorkOS CLI Auth on the server

Server connects to `api.trunk.codes` after WorkOS CLI Auth succeeds.

User opens:

```txt
https://app.trunk.codes/pair
```

The app requires WorkOS login. The server and browser are paired when both authenticate as the same WorkOS user. The server stores:

```json
{ "userId": "user_abc123" }
```

The app writes this non-secret metadata to WorkOS:

```json
{ "serverId": "happy-coffee-a7k9" }
```

Pairing rules:

- use WorkOS-hosted AuthKit and CLI Auth
- store WorkOS refresh credentials only on the user's server
- never stored in WorkOS metadata

## Install Flow

Command:

```bash
curl -fsSL https://trunk.codes/install | bash
```

Installer responsibilities:

- install Bun if needed
- install Trunk server
- initialize `~/.trunk/config.json`
- register systemd service on Linux
- register launchd agent on macOS
- start Trunk server on `127.0.0.1:7777`
- authenticate server through WorkOS CLI Auth
- open outbound WebSocket to `wss://api.trunk.codes/server`

No Caddy, DNS, inbound ports, Cloudflare Tunnel, or user router configuration is required.

## Commands

MVP CLI commands:

- `trunk server`: run local server.
- `trunk status`: show local server and remote connection status.
- `trunk update`: update Trunk server and bundled CLIs.
- `trunk unpair`: remove local `userId` and require pairing again.

## Deployment

- `apps/marketing` deploys to Cloudflare Pages at `trunk.codes`.
- `apps/web` deploys to Cloudflare Pages at `app.trunk.codes`.
- `apps/api` deploys to Cloudflare Workers at `api.trunk.codes`.

The API should be Cloudflare-native first because Workers and Durable Objects give cheap global WebSocket routing without operating servers.

## Validation

- Treat Wrangler output as part of the test result.
- Do not ignore Worker, Durable Object, workerd, or Wrangler warnings/errors.
- Investigate noisy local Wrangler logs before calling an API slice production-ready.
- Run endpoint and WebSocket checks directly from the terminal when validating API behavior.

## MVP Phases

1. Keep T3 internals intact and add Trunk branding/distribution surfaces.
2. Add `apps/api` with zero-storage Durable Object routing.
3. Add isolated server remote-link module that authenticates and maintains outbound WebSocket.
4. Add browser-to-server encrypted transport.
5. Add WorkOS AuthKit hosted login to `apps/web`.
6. Add pairing screen and WorkOS metadata write for `serverId`.
7. Add installer and local service setup.
8. Add reconnect/offline/version mismatch UX.
9. Add update/unpair/rotate commands.
10. Add PostHog/error reporting with strict redaction and no payload capture.

## Non-Goals

- No managed Cloudflare Tunnels.
- No relay database.
- No Trunk-hosted session storage.
- No provider credential storage outside the user machine.
- No CLI abstraction or replacement.
- No localStorage auth tokens.
- No public inbound port requirement.

## Open Decisions

- Exact E2E crypto library and frame format.
- How the static app performs WorkOS metadata writes without adding a durable backend.
- Whether `trunk update` uses git, npm, or release artifacts for MVP.
- Compatibility protocol version shape between app, API, and server.
