# Blotter

Your AI command surface. Sit down and your agent has already prepared your world.

Blotter is a desktop app that connects to [Genesis](https://github.com/ianphil/genesis) minds — AI agents with memory, skills, and personality. The agent extends the UI itself: drop a `view.json` into the mind and a new panel appears. No code changes, no deploys.

Built with Electron, React, Tailwind CSS, and the GitHub Copilot SDK.

## The Idea

Before computers, a Chief of Staff had a desk blotter — the working surface where today's papers landed. The briefing book, the Rolodex, the inbox tray, the intercom to the team. Everything that mattered was within arm's reach.

Blotter is the digital version. Your agent is the assistant who prepared the desk before you arrived.

| The old world | Blotter |
|---------------|---------|
| Briefing book | Newspaper — prompt-driven daily briefing |
| Rolodex | Contacts — Lens table view |
| Inbox tray | Inbox — Lens list view |
| Intercom | Chat — streaming conversation with your agent |
| Filing cabinets | Mind directories (domains, expertise, archives) |
| The assistant | The Genesis agent |

## Features

- **Lens** — declarative view framework. Drop a `view.json` in `.github/lens/`, get a UI panel. 7 view types: form, table, briefing, detail, status-board, timeline, editor.
- **Prompt-driven views** — click Refresh, the agent gathers data and populates the view. Edit the prompt to change what it shows.
- **Write-back** — type instructions in the action bar on any view. The agent modifies the data.
- **Self-extending** — the agent has a Lens skill. Ask it to "create a view for my cron jobs" and it builds one.
- **Activity bar** — VS Code-style icon strip. Icons appear as views are discovered.
- **Streaming chat** — real-time responses with markdown, tool calls, and reasoning blocks.
- **Model picker** — choose your model, persisted across sessions.
- **Agent identity** — chat shows the agent's name from SOUL.md, not "Blotter."

## Quick Start

```bash
git clone https://github.com/ianphil/blotter
cd blotter
npm install
npm start
```

Select a Genesis mind directory from the sidebar. The agent connects, views appear, and you're ready.

## Architecture

```
Electron Main Process
├── SdkLoader        — singleton CopilotClient, auto-install SDK
├── ChatService      — streaming sessions, background prompts
├── ViewDiscovery    — scans .github/lens/ for view.json, file watcher
├── ExtensionLoader  — canvas, cron, IDEA adapters
└── IPC Handlers     — chat, agent, lens, config channels

Preload Bridge
└── contextBridge    — narrow typed API (chat, agent, lens, config, window)

React Renderer
├── ActivityBar      — dynamic icons from discovered views
├── SidePanel        — contextual per view (chat, lens metadata)
├── ViewRouter       — routes to ChatPanel or LensViewRenderer
├── Lens components  — Form, Table, Briefing, Detail, StatusBoard, Timeline, Editor
└── Chat components  — MessageList, ChatInput, StreamingMessage, WelcomeScreen
```

## Development

```bash
npm start          # Launch with hot reload
npm run lint       # ESLint
npm run make       # Build distributable
```

## License

[MIT](LICENSE)
