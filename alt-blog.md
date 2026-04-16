# Alt-Blog: What Chamber Can Learn From t3code

Notes from a survey of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) (at `7a08fcf2`, ~841 tracked files) as a reference for Chamber's architecture. t3code is a minimal web GUI for coding agents (Codex, Claude) that ships as both `npx t3` and a desktop Electron app from a single codebase.

## TL;DR

t3code's big architectural idea is that **the UI is a web app and Electron is just one of three ways to load it**. The same Node server binary powers `npx t3` (opens a browser), the desktop app (Electron loads `localhost`), and remote pairing mode. Chamber currently welds main + renderer together through Electron IPC; adopting t3code's split would unlock a web/CLI shell for free and force our IPC surface to become a real, validated protocol.

## Architecture snapshot

| | Chamber | t3code |
|---|---|---|
| Topology | Electron main + renderer + preload | Thin Electron + standalone Node WS server + React/Vite web app |
| Monorepo | Single package | `bun` workspaces + `turbo` (`apps/{desktop,server,web,marketing}`, `packages/{contracts,shared,client-runtime}`) |
| Contracts | `src/shared/types.ts` — plain TS | `packages/contracts` — Effect `Schema` for WS protocol, provider events, session types |
| Transport | Electron IPC | WebSocket RPC (`NativeApi`) + server-push channels (e.g. `orchestration.domainEvent`) |
| State / runtime | React + custom reducer | Heavy use of Effect (`@effect/atom-react`, `@effect/platform`, `@effect/sql-sqlite-bun`) |
| Lint / fmt | ESLint | `oxlint` + `oxfmt` (Rust, ~instant) |
| Tests | Vitest, some nested dirs | Vitest, colocated flat (`foo.ts` / `foo.test.ts`), MSW + Vitest browser for web |
| Shared exports | Barrel `src/shared/index.ts` | No barrel — explicit subpath exports (`@t3tools/shared/git`) |
| Bundling | Vite for main/preload/renderer | `tsdown` for libs, Vite for web, `turbo` orchestrates |
| Ops | Basic | `updateMachine`, `rotatingFileSink`, `observability/`, `telemetry/`, `backendReadiness`, `serverListeningDetector` |

## How `npx t3` actually works

This was the headline discovery. The mechanism:

- `apps/server` publishes to npm as the package **`t3`** with `"bin": { "t3": "./dist/bin.mjs" }`. That's what `npx t3` runs.
- `apps/web` is a standalone React/Vite SPA.
- At server build time, `apps/server/scripts/cli.ts` runs `turbo build` for web, then **copies `apps/web/dist` into `apps/server/dist/client`**:

  ```ts
  const webDist = path.join(repoRoot, "apps/web/dist");
  const clientTarget = path.join(serverDir, "dist/client");
  if (yield* fs.exists(webDist)) yield* fs.copy(webDist, clientTarget);
  ```

- The server tarball ships with `"files": ["dist"]`, containing both the Node WS server and the static SPA.

At runtime:

- Server binds `http://localhost:PORT`, serves `/` from `dist/client/index.html` + assets, upgrades `/ws` for WebSocket RPC.
- `serverRuntimeStartup.ts` calls `openBrowser(target)` (unless `--no-browser`).
- **Desktop** mode is the same server; Electron just `loadURL`s `http://localhost:PORT` instead of opening a browser. `serverConfig.mode === "desktop"` skips the pairing-URL auth dance since it's trusted-local.
- In dev, `devUrl` points at Vite's `http://localhost:5173` so the server redirects there instead of serving stale `dist/client`.

Consequences:

1. **One codebase, three shells.** `npx t3` (browser), desktop Electron, remote pairing (`REMOTE.md`, `issueStartupPairingUrl` auth token flow).
2. **The Electron app is ~15 files.** Almost everything is in `server` + `web`. Electron is a thin loader + auto-updater + OS integration (shell env sync, confirm dialogs, rotating file sinks).
3. **Tests don't need Electron.** Server tests run pure Node; web tests run in Vitest browser mode. Electron runs only in `smoke-test`.
4. **Auth gating differs per mode.** Local desktop = implicit trust; `npx` / remote = pairing token URL. Same server, config-driven.

## Findings worth stealing for Chamber

### 1. Effect Schema contracts package

Chamber's IPC is typed but not runtime-validated. A `packages/contracts` with Schema-based definitions would catch malformed payloads at the boundary from the SDK, filesystem (`view.json`), and agents. Lens is literally "drop a JSON, agent extends UI" — it's our weak spot and the place where runtime schema validation pays the highest dividend.

Rule from t3code's `AGENTS.md`: **contracts package is schema-only — no runtime logic**. Prevents the usual drift where protocol types grow helpers and bleed server-only deps into the client.

### 2. Headless server + web shell

Extract main-process services into a runnable Node process behind a WebSocket + JSON-RPC surface. Unlocks `npx chamber`, remote / web UI, and makes tests trivial (no Electron).

Mapping to Chamber today:

- `apps/server` ← current `src/main/` services. SdkLoader, ChatService, ViewDiscovery, ExtensionLoader, Lens file watcher all run here. Talks WebSocket + JSON-RPC instead of `ipcMain.handle`.
- `apps/web` ← current `src/renderer/`. Uses a WS client instead of the `window.chamber.*` preload bridge.
- `apps/desktop` ← minimal Electron: window, auto-updater, menu, shell env, deep-linking, native file pickers. Loads `http://localhost:PORT` (or the dev Vite URL).
- `npx chamber` ← start server, open browser. Minds still live on the user's filesystem; Lens `view.json` discovery still works because the server has FS access.

Side effect: Lens "self-extending UI" works **better** in a browser — sharing a view with a collaborator becomes a URL.

Friction point: Chamber's preload exposes Node-ish APIs (file ops, shell) that the renderer relies on. Moving to WS RPC means every one of those becomes an explicit RPC method in `packages/contracts`. That's actually the goal of (1), so the two ideas reinforce each other.

### 3. Drop the `src/shared/` barrel

Switch to subpath exports (`@chamber/shared/lens`, `@chamber/shared/sessionErrors`). Prevents accidental renderer imports of main-only code and improves tree-shaking. t3code's `AGENTS.md` explicitly calls this out.

### 4. `oxlint` + `oxfmt`

Drop-in replacement for ESLint. Near-instant on a repo t3code's size. Chamber's ESLint config is small enough to port with little effort.

### 5. Update state machine + rotating log sink

Chamber ships as Electron but has nothing for auto-update or structured logs. `apps/desktop/src/updateMachine.ts` and `rotatingFileSink.ts` are short, readable references.

### 6. `AGENTS.md` discipline

Short, punchy root-level doc that enforces `bun fmt && bun lint && bun typecheck` before "done," documents per-package roles, and lists reference repos. Chamber has agent-instruction bits scattered across `.github/` — consolidating into a single `AGENTS.md` would be an easy win.

## Things worth **not** copying

- **Flatten everything.** t3code keeps `apps/server/src/` mostly flat with ~50 top-level files. Chamber's `services/*` split (a2a, chat, chatroom, genesis, lens, mind, sdk) is a meaningful domain grouping, not folders-for-folders'-sake. Keep it.
- **Full Effect adoption.** Effect has a real learning curve and pervades everything (layers, runtime, generators). Adopting it wholesale is a bigger commitment than it looks. Use Effect `Schema` for contracts only; don't rewrite the runtime.
- **`bun` as the package manager.** Chamber runs on Node + npm and `npm run lint`/`npm test` are the verified baseline. Switching runtimes is a separate conversation.

## Things Chamber already does better

- **Lens framework** (`view.json` → UI). t3code has no equivalent; it's a fixed UI for Codex/Claude. This is Chamber's real differentiator.
- **Agent-as-first-class** (identity, personality, minds). t3code treats the coding agent as a provider, not a persona.
- **Genesis flow / mind bootstrapping.** Nothing like it in t3code.

## Suggested sequencing (if we pursue the big split)

1. Introduce `packages/contracts` with Effect `Schema` mirroring the current IPC surface. No behavior change.
2. Stand up `apps/server` exposing the same surface over WebSocket + JSON-RPC. Run it as a sidecar from the existing Electron main process.
3. Shim the preload bridge to call WS instead of `ipcRenderer.invoke`. Renderer is unchanged. Ship this intermediate state — everything still works, but the boundary is now a real protocol.
4. Extract `apps/web` and slim Electron down to a window + updater shell.
5. Add `npx chamber` bin. Layer in pairing-URL auth for remote mode.

Each step is independently shippable and reversible.

## Caveats

- t3code is explicit WIP (see `CONTRIBUTING.md`). Their own design may still churn.
- ~5× Chamber's LOC, so not every pattern generalizes — some are weight Chamber doesn't carry yet.
- The Effect ecosystem is opinionated. Schema is great; don't assume the rest is.
