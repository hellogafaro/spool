# Pivot to T3-native + Vault-backed saved envs

Status: Proposal. Replaces the current Trunk SaaS relay/DO architecture.

## Goal

Make Trunk a thin layer over T3:

- `app.trunk.codes` is a static web build. No data-path backend.
- Users self-host envs (T3 vanilla). Trunk does not run the env runtime.
- Pairing uses T3's native pair URL+token flow. No Trunk-issued credentials on the data path.
- Multi-device sign-in surfaces the same env list everywhere via WorkOS Vault.
- Server stays on upstream T3 — fork divergence drops to ~zero.

## Architecture

```
Browser (app.trunk.codes)
  │
  ├─ HTTPS ──► Trunk Worker (api.trunk.codes)         ← saved-env metadata only
  │             • verify WorkOS JWT
  │             • read/write WorkOS Vault
  │
  └─ WSS  ──► User's T3 server (their URL)            ← actual data path
                • T3-native bearer auth
                • behind Tailscale / CF Tunnel / localhost
```

Trunk Worker is **not** on the data path. It hands the web a bearer once per session; the web talks to the env directly.

## Vault schema

One entry per (user, env) pair.

```
name:    env-<userId>-<environmentId>
value:   <T3 bearer session token>
key_context:
  owner:           <workos-user-id>
  environmentUrl:  https://t3.example.com
  label:           Laptop
```

Notes:
- `name` carries the listing boundary (`name_prefix=env-<userId>-`). One Vault list call returns just that user's envs.
- `environmentId` is parsed from the name; not duplicated in key_context.
- `environmentUrl` stores the http base URL. Web derives `wss://` by scheme swap at use.
- `value` is the T3 bearer. Encrypted at rest by WorkOS. Never returned in list responses.

## Trunk Worker API

Four endpoints, REST-shaped. Each requires a valid WorkOS JWT. Worker is a dumb Vault facade — it does **not** call the user's env. Web handles the T3 pair flow directly via CORS.

### `POST /env`

Body:
```
{ environmentUrl: string, environmentId: string, label: string, bearer: string }
```

Steps:
1. Verify JWT, extract `userId`.
2. Validate `environmentUrl` is `https://` or `http://localhost`.
3. `upsertVault(name=env-<userId>-<environmentId>, value=bearer, key_context={owner: userId, environmentUrl, label})`.
4. Return `{ environmentId, label, environmentUrl }`.

### `GET /env`

Returns `[{ environmentId, label, environmentUrl }]`. Bearer is **never** returned here.

Implementation: `listVault(name_prefix=env-<userId>-)`, project `key_context` to public fields, parse `environmentId` from name.

### `GET /env/<environmentId>`

Returns `{ environmentId, label, environmentUrl, bearer }`. Owner check (`key_context.owner === jwt.sub`). Web caches the bearer in memory only.

### `PATCH /env/<environmentId>`

Body: `{ label: string }`. Updates `key_context.label`. Owner check. Optional — could be deferred; users could delete and re-pair to rename.

### `DELETE /env/<environmentId>`

`deleteVault(name=env-<userId>-<environmentId>)`. Owner check.

## Web changes

Drop:
- `apps/web/src/environments/primary/*` — entire directory.
- `getPrimaryEnvironmentConnection()` and all callers.
- The "primary env" concept from the store; `activeEnvironmentId` either dies or becomes a UI-only selector for which saved env is in focus.
- WS heartbeat code (relay-specific, irrelevant for direct env connection).

Add:
- Empty-state route: if `listSavedEnvironmentRecords().length === 0`, redirect to `/welcome` → onboarding-styled `/pair`.
- `/pair` page flow:
  1. User pastes `environmentUrl`, `pairToken`, `label`.
  2. Web fetches `<environmentUrl>/.well-known/t3/environment` → `environmentId`.
  3. Web POSTs `<environmentUrl>/api/auth/bootstrap` with `pairToken` → bearer.
  4. Web POSTs Worker `/env` with `{environmentUrl, environmentId, label, bearer}`.
  5. Hydrate saved-env list, redirect to `/`.
- Saved-env source becomes the Worker (`GET /env`) on login. Cache to localStorage for offline browse. Bearer fetched per session via `GET /env/<id>`, cached in memory.
- URL validator on `/pair`: refuse plain `http://` to non-localhost (mixed-content rules + security guidance).
- Security checklist on `/pair`: "Is this env behind Tailscale, CF Tunnel, or localhost?" with link to `docs/security.md`.

Reuse:
- `apps/web/src/environments/remote/*` — already implements the saved-env runtime path and the bootstrap call to the env. Wire it as the only path.
- `SavedEnvironmentRecord` type stays. Worker maps `environmentUrl` ↔ T3's `httpBaseUrl` at the API boundary.

## Server changes

Drop:
- `apps/server/src/relay/*` — Relay, RelayConfig, RelayState, pairToken, banner, deviceFlow.
- `~/.trunk/config.json` writer.
- Relay layer wiring in the runtime composition.
- Heartbeat protocol added in `3e41d222`.

Keep:
- Everything else. Server becomes upstream T3 with no Trunk-specific code.

## Trunk Worker changes

Replace `apps/api/*` wholesale:
- Drop `EnvironmentRoom` Durable Object, `pairing.ts` (handlePairingRequest + writer), `ownership.ts`, `protocol.ts`, all WS bridging.
- Drop `environments` user-metadata writer in `workos.ts`. The `environments` claim is no longer used.
- Keep `auth.ts` (WorkOS JWT verifier).
- Keep Vault helpers in `workos.ts` (`upsertVault`, `getVault`, `deleteVault`); add `listVaultByPrefix`, `patchVaultKeyContext`.
- New `saved-env.ts` implementing the five endpoints above.
- `wrangler.jsonc` — drop `durable_objects` block. Add a one-time cleanup migration `{"tag": "v3", "deleted_classes": ["EnvironmentRoom"]}` to remove the deployed DO. After that migration ships, the `migrations` array can be cleared in a follow-up. Keep `routes`, `account_id`, `observability`.

Worker target size: ~80 LOC of route handlers + the Vault helpers. No data-path code. No DO, no SQLite, no Hibernation API — plain stateless Worker.

## Threat model

| Risk | Mitigation |
|------|-----------|
| WorkOS account compromise | Attacker reads Vault → has bearers. Same surface as managed mode. WorkOS 2FA, conditional access. |
| Bearer in transit (Worker → web) | TLS to Worker. Bearer in JSON body, short-lived TTL. Web caches in memory only. |
| Stolen bearer on a device | T3 supports per-session revoke. User clicks "rotate" → Worker re-runs pair on user's behalf with a fresh token. |
| Env URL exposure | User responsibility — Tailscale / CF Tunnel / localhost. Trunk validates URL is `https://`-or-localhost; refuses public `http://`. |
| Trunk Worker compromise | Can read all Vault entries. Mitigation: scope Worker's WorkOS API key to JWT verify + Vault read/write only. |
| Replaying old saved-env list | Vault is source of truth. Worker reads on every list call; localStorage cache is informational only. |

## What goes away from this week's work

- WS heartbeat (`3e41d222`) — irrelevant without relay.
- Custom pair flow (TOFU, pair-status, pair-token push) — replaced by T3's native flow.
- "Primary env" hack and the recurring stale-UUID bug class.
- DO hibernation tuning, zombie-WS class — no DO, no relay state.
- WorkOS user-metadata `environments` claim — replaced by Vault entries.
- `docs/security.md` and `docs/self-hosting.md` content rewritten to reflect new model.

## PR sequence

Three independent PRs. System remains usable between each.

1. **Trunk Worker rewrite** (`apps/api`) — implement the 4 endpoints. Keep the old `/pair` route for one release as a deprecation shim (returns 410 Gone with link to docs). Tests cover save/list/get-bearer/delete + ownership enforcement.
2. **Web pivot** (`apps/web`) — drop `environments/primary/*`, route empty-state to `/pair`, repaint `/pair` as onboarding, swap saved-env source to the Worker. Tests cover empty-state redirect, save flow, bearer caching, list rendering.
3. **Server cleanup** (`apps/server`) — delete `relay/*`, drop config.json writer, drop heartbeat protocol additions. Server is upstream-T3-clean. Tests removed alongside.

Doc PR (4) updates `docs/security.md`, `docs/self-hosting.md`, deletes `docs/specs/pivot-to-t3-native.md` (this file) once shipped.

## Open questions

- **Bearer rotation cadence.** T3 default TTL? Refresh-on-401 from web vs scheduled cron in Worker. Defer to first PR.
- **Anonymous mode.** Free users without a WorkOS login — fall back to localStorage-only saved-envs (no Worker)? Or require login for /pair? Recommend require login: gives auditability and multi-device for free.
- **Team envs.** WorkOS organizations as the boundary. Vault name becomes `env-<orgId>-<envId>`, ownership via org membership. Out of scope for this pivot; addresses in a follow-up spec.
- **CORS on env.** T3 server must accept `Origin: https://app.trunk.codes` for `/api/auth/bootstrap` and `/.well-known/t3/environment`. Verify upstream config; document if a flag is needed.
- **Pair-token TTL coordination.** Worker fetches token from user's paste, hits env's bootstrap. If token expires between paste and Worker call, error message must guide user to regenerate. Worker should call bootstrap promptly and surface env's error verbatim.

## Success criteria

- A user logs into `app.trunk.codes` on a fresh browser, sees their env list within 2 seconds.
- Pairing a new env on a clean machine takes ≤ 4 inputs (env URL, pair token, label, submit).
- Disconnecting and reconnecting an env recovers within 5s without user action (T3 native reconnect).
- Zero Trunk-side code on the WS data path.
- Server diff vs upstream T3 is < 50 lines (Trunk-specific UI strings, branding only).
