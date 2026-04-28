# Security Model

T3 Code ships in two deployment modes that have different threat models. Use the right one.

## Modes

| Mode                 | Web client               | API/relay                          | Env (T3 server)         | Auth               |
| -------------------- | ------------------------ | ---------------------------------- | ----------------------- | ------------------ |
| Managed (Trunk SaaS) | `app.trunk.codes`        | `api.trunk.codes` (CF Worker + DO) | User-run, outbound-only | WorkOS JWT + Vault |
| Self-host            | User-deployed Vite build | Optional, user-deployed            | User-run, exposes `/ws` | T3 native pair URL |

## Managed mode

### Goals

- User runs an env on a VPS, container, laptop, or Railway worker without configuring inbound networking, TLS, or DNS.
- No env URL leaves the user's environment.
- Compromise of one env is bounded to that env.

### Mechanisms

- **Outbound-only WebSocket.** The env opens a single control WS to `wss://api.trunk.codes/environment` and never accepts inbound connections. There is no port to scan, no URL to leak.
- **Per-env secret in WorkOS Vault.** On first connect, the env presents a 32-byte secret over the proof header (`x-trunk-environment-proof`). The DO TOFU-stores it, then promotes it to a Vault entry keyed `env:<environmentId>` with `key_context.owner=<userId>` once a paired user claims the env. Subsequent connects reject mismatched proofs.
- **Pair token claim.** The env publishes a short-lived pair token over the control WS. The user pastes it (with the printed `environmentId`) into `/pair` on the web app. The DO verifies the JWT, matches the token, and binds the secret to the user.
- **Per-message ownership check.** `/ws` open verifies the JWT and that the requested `environmentId` is in the user's WorkOS metadata `environments` claim.
- **Heartbeat liveness.** The env sends `env-ping` every 20 s and force-reconnects if no `env-pong` arrives within 60 s. Closes the recurring "zombie WS" class where Railway/CF intermediates kept the env's TCP socket in `ESTABLISHED` long after the DO had lost track of it.
- **No env URL on the wire.** Banner and pair flow only reference `app.trunk.codes`; the env never advertises a callable URL.

### Out of scope

- Network-level attacker on the env's outbound path. TLS to `api.trunk.codes` is the only defense.
- Compromise of the WorkOS account. JWT signing keys and Vault entries assume WorkOS is trusted.
- Compromise of the env host. Anything reaching the env's filesystem can read `~/.trunk/config.json`.

### Known debt (planned)

- The "primary env" hack in `apps/web/src/environments/runtime/service.ts` maps every JWT-claimed env to a singleton primary connection. Multi-env breaks. Refactor to register each JWT envId as a saved environment is planned in a dedicated branch.

## Self-host mode

The env exposes its own HTTP+WS server on a port and the user's web app pairs by URL. This is T3's native model. It is **not** secure on a public network without a network-layer defense:

- Run the env behind Tailscale, a Cloudflare tunnel, or a private VPC.
- Do not expose the env's port directly to the internet.

The pair URL embeds a token in the URL fragment so it is not sent to the server, but the URL still discloses the env's address. Anyone who learns it can reach the auth endpoint.

See [self-hosting.md](./self-hosting.md) for setup.
