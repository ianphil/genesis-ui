# Changelog

## v0.13.0 (2026-04-09)

### Auth & Credential Fixes
- **Fix OAuth client ID** — switch from deprecated `Iv1.b507a08c87ecfe98` to current CLI client ID `Ov23ctDVkRmgkPke0Mmm` with correct scopes (`read:user,read:org,repo,gist`)
- **Fix UTF-16/UTF-8 credential encoding** — cmdkey stores blobs as UTF-16LE but the CLI reads via keytar (UTF-8). Now uses Win32 `CredWriteW` directly with UTF-8 encoding via a compiled helper
- **Fix PowerShell Add-Type timeout** — replaced slow JIT compilation with a precompiled `CredWrite.exe` via `csc.exe` (cached on first run)

### Agent Identity & Personality
- **Agent identity injection** — ChatService loads SOUL.md + `.github/agents/*.agent.md` and injects them into the session via `systemMessage` customize mode
- **Replace SDK identity section** — agent's SOUL replaces the default "You are GitHub Copilot CLI" identity while preserving all tool instructions, safety, and environment context
- **Remove SDK tone override** — the "100 words or less" tone section was suppressing agent personality; removed so SOUL.md's Vibe section controls voice

### Genesis & Boot
- **Surface genesis errors** — boot screen now shows red error text with actionable hint instead of spinning forever on failure
- **Fix BootScreen crash** — React strict mode double-fired useEffect corrupting interval index; fixed with optional chaining and value capture

## v0.12.0 (2026-04-09)

- **Auth gate** — GitHub device flow login, Windows Credential Manager storage

## v0.11.0 (2026-04-09)

- **The Genesis Moment** — full cinematic new-mind onboarding
- Void → Voice → Role → Boot → First Words
- Agent writes its own SOUL.md, personality, and identity
- MindScaffold: deterministic folders + agent-generated soul
- Landing screen: ✨ New Agent / 📂 Open Existing
- "Change your mind…" returns to landing
- Default mind path: `~/agents/{slug}/`

## v0.10.2 (2026-04-09)

- Fix logo icons (B/G → C)
- Remove "Genesis Chamber" branding — just Chamber

## v0.10.1 (2026-04-09)

- **Auto-seed Newspaper** alongside Hello World on mind connect

## v0.10.0 (2026-04-09)

- **Renamed to Chamber**
- Agent name from SOUL.md shown in chat
- Config dir now `~/.chamber/`

## v0.8.1 (2026-04-09)

- **Four new Lens view types:** detail, status-board, timeline, editor
- Agent now has 7 view components to choose from when creating Lens views

## v0.8.0 (2026-04-09)

- **Lens skill auto-installs** into minds on connect — agent learns to create views
- **Write-back:** action input bar on every view sends instructions to the agent
- Agent can now modify view data through natural language

## v0.7.0 (2026-04-09)

- **Briefing view type:** card grid with emoji icons and large number display
- **Table view type:** data table with headers from schema
- Newspaper view as a prompt-driven briefing

## v0.6.0 (2026-04-09)

- **Lens declarative view framework** — drop a `view.json` in `.github/lens/`, get a UI view
- Dynamic activity bar populated from discovered views
- Prompt-driven views: click Refresh → agent gathers data → view renders
- File watcher for hot discovery
- Hello World view auto-seeded on mind connect

## v0.5.0 (2026-04-09)

- **Activity bar + view switching** — VS Code-style three-column layout
- Contextual side panels per view
- App-level subscriptions survive view switches

## v0.4.0 (2026-04-09)

- **Model picker** inside chat input (shadcn Select)
- Models fetched from Copilot SDK, persisted in localStorage

## v0.3.0 (2026-04-08)

- Rich streaming UI with content blocks (text, tool calls, reasoning)
- shadcn/ui component library (Badge, Collapsible, ScrollArea)

## v0.2.0 (2026-04-08)

- Extension system: canvas, cron, IDEA adapters
- SDK auto-install on packaged builds
- CI/release GitHub Actions workflows

## v0.1.0 (2026-04-08)

- Initial release — desktop chat interface for Genesis minds
- Streaming chat with Copilot SDK
- Mind directory picker with validation
