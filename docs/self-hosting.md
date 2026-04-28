# Self-hosting T3 Code

T3 Code can run in two modes:

- **Managed:** use `app.trunk.codes` and `api.trunk.codes`. Run only the env (`apps/server`) on your machine. No networking config required. See [security.md](./security.md).
- **Self-host:** run the web app, the env, and (optionally) your own relay. You handle TLS, networking, and access control.

This document covers self-host. For most users, managed is simpler and more secure on a public network.

## What you run

- `apps/server` — the env (Node, Bun-compatible). Serves `/ws` and the static web build.
- `apps/web` — the React app. Built by Vite and served by the env.
- (optional) `apps/api` — the Cloudflare Worker + DO relay. Only needed if you want a hosted relay; the env can serve the web app directly.

## Recommended deployment

Run the env on a private network and reach it from a browser on the same network. Two patterns work well:

### Tailscale

1. Install Tailscale on the env host and on any device that needs to reach it.
2. Run the env: `bun run --filter t3 start`. It binds the configured port on `0.0.0.0`.
3. Browse to `http://<tailscale-host>:<port>` from another tailnet device.

The env's port is reachable only inside your tailnet. The pair URL is safe to share inside the tailnet.

### Cloudflare Tunnel

1. Install `cloudflared` on the env host.
2. `cloudflared tunnel create t3` and route a hostname (e.g. `t3.example.com`) to the env's local port.
3. Configure Cloudflare Access to require an identity provider for that hostname.

The env is now reachable only through Access-authenticated requests. Cloudflare terminates TLS and adds an auth layer on top of T3's pair-token auth.

## Pair flow (self-host)

1. Start the env. It prints a pair URL and token to stdout on first run.
2. Open the URL in a browser. The token is in the URL fragment so it is not sent to the server.
3. The browser exchanges the token for a session cookie.
4. Subsequent visits reuse the cookie until it expires.

If you lose the token, regenerate it with `t3 auth pair`.

## Anti-patterns

- **Do not expose the env's port directly to the internet.** The pair URL discloses the env's address; anyone who learns it can reach the auth endpoint and brute-force pair tokens. Put a private network (Tailscale, VPC) or an access-controlled proxy (Cloudflare Tunnel + Access) in front.
- **Do not reuse pair tokens.** Each token is single-issuer. Revoke and reissue if a token leaks.
- **Do not run the env as root.** It executes provider CLIs (`claude`, `codex`, etc.) on its host filesystem.

## Switching modes

- Managed → self-host: stop pointing the env at `api.trunk.codes` (delete `~/.trunk/config.json` or unset `TRUNK_API_URL`) and serve the web build directly.
- Self-host → managed: run `t3 trunk pair` (or equivalent) to register the env with `api.trunk.codes` and the web app at `app.trunk.codes`.
