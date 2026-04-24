# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Codex App Server (Important)

T3 Code is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Agent Operating Principles

- Do not act without sufficient context.
- Execute or ask one precise clarifying question.
- Prefer correct over complete.
- Prefer simple over clever.
- Practice KAIZEN: improve continuously through small verified steps.
- Practice YAGNI: do not build what is not needed now.

## Workflow Routing

- Use a defined workflow before ad hoc execution when the task is multi-step or ambiguous.
- Brainstorm before design-changing work.
- Plan before multi-step implementation.
- Review before declaring non-trivial work done.
- Do not implement before the request, scope, and success criteria are clear enough.

## Context Discipline

- Read only what is necessary.
- Do not reread unchanged files.
- Prefer targeted reads over full files.
- Cache file contents and intermediate results.
- Avoid loading large files fully into context.
- Prefer durable project artifacts over chat history.

## Project Artifacts

- Durable documentation lives under `docs/`.
- Specs live in `docs/specs/`.
- Plans live in `docs/plans/`.
- Keep structure minimal; do not add new doc categories without reason.
- Treat plans as proposals, not truth; verify against current code before acting.
- If shared task tracking is needed, use `TODO.md` at the repo root.

## Cross-Agent Handoff

- Use repository files, not hidden session memory, as the source of truth.
- A new agent must be able to continue from `AGENTS.md`, `TODO.md`, and the relevant docs/code.
- Handoffs must reference exact files.
- Do not rely on prior chat context when durable artifacts can carry the state.

## Output Discipline

- Keep responses extremely concise.
- No filler, praise, hedging, or narration.
- Lead with the answer or fix.
- Do not restate the problem.
- Prefer bullets, commands, or diffs over prose.

## Code Rules

- Do not rewrite entire files unless required.
- Make minimal diffs only.
- Follow existing patterns and structure.
- Prefer simple solutions over abstractions.
- Do not introduce new dependencies without reason.
- One domain per file; split unrelated responsibilities.
- Do not assume old architecture notes are still current without verifying in code.

## Naming

### Files and Directories

- Use `kebab-case` for all files and directories.
- Filename matches primary export when practical.
- One domain per file; split unrelated responsibilities.

### Variables and Functions

- Use `camelCase` for variables, functions, and methods.
- Use `PascalCase` for types, interfaces, and classes.
- Use `SCREAMING_SNAKE_CASE` for constants.
- Keep names short and direct.
- No redundant type in names.
- Use `row` for a single database result and plural names for collections.

### CRUD Operations

- Read one: `get` + singular.
- Read many: `get` + plural.
- Create or upsert: `upsert` + singular.
- Update: `update` + singular.
- Delete: `delete` + singular.
- Never use bare verbs; always use `verb` + domain noun.
- Never use `list`; use `get` + plural.
- Never use `remove`; use `delete`.
- Prefer one `get` per domain with optional lookup fields instead of `getBy*` variants.
- Prefer one `update` per domain with `id` plus optional partial fields.

### Non-CRUD Prefixes

- `handle` for entry points from webhooks and external events.
- `format` for data transformed for display.
- `on` for side-effect reactions.
- `has` or `is` for boolean checks.

## Code Style

### Functions

- Use a single return shape; do not mix `null` and `undefined` unless needed.
- Prefer early returns over nested conditionals.
- Max one level of callback nesting.
- Prefer one function with options over redundant granular variants.
- Return objects directly with a consistent shape.

### Types

- Use `interface` for public contracts.
- Use `type` for unions and utilities.
- Do not use `any`; use `unknown` and narrow it.

### Comments

- Add JSDoc only for exported functions when the intent is not obvious.
- Keep JSDoc to one sentence.
- No inline comments unless logic is truly non-obvious.
- No numbered step comments.

### Error Handling

- Throw descriptive errors in library code.
- Catch and format errors at route, action, or command boundaries.
- Use `try/catch` where failure needs controlled formatting or recovery.

### Logging

- Always use structured logging.
- Never use ad hoc `console.log` for application logs.

## Validation

- Validate before declaring done.
- Ensure code runs or compiles if applicable.
- Verify logic matches the request.
- Review non-trivial work before marking it complete.
- Surface uncertainty briefly if needed.

## Failure Handling

- Do not loop blindly on failures.
- Retry only if safe.
- Escalate clearly when blocked.
- Stop early if uncertain instead of guessing.

## Git

### Commits

- Use conventional commits: `type: short description`.
- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`.
- Scope optional: `feat(reports): add export action`.
- Subject line max 72 chars.
- No body unless the why is non-obvious.

### Pull Requests

- Title: same format as commit.
- Body: bullet points of what changed, one line each.
- No prose framing.
- Reference issue if one exists.
- Max 3 to 5 bullets.

### Branches

- `feat/short-slug`.
- `fix/short-slug`.
- `chore/short-slug`.

## Communication Style

- Be terse, direct, and technical.
- Remove all filler language.
- Use the minimum words needed for correctness.

## Local Notes

- Do not assume Convex is active in this app just because older docs or generated files mention it.
- Verify the current stack from the codebase before following legacy instructions.
