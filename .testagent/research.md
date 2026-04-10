# Test Generation Research

## Project Overview

- **Path**: `C:\src\chamber`
- **Language**: TypeScript (strict)
- **Framework**: Electron 41 (main process: Node.js, renderer: React 19)
- **Build**: Electron Forge + Vite (separate configs for main, preload, renderer)
- **Test Framework**: Vitest 4.1.4 + jsdom 29 + @testing-library/react 16 + @testing-library/jest-dom 6
- **UI**: Tailwind CSS 4, Radix UI primitives, Lucide icons, class-variance-authority
- **State**: React Context + `useReducer` (no external state lib)
- **Markdown**: react-markdown + remark-gfm
- **Description**: "Chamber" — desktop chat UI for Genesis agents, powered by @github/copilot-sdk

## Build & Test Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | `vitest run` — run all tests once |
| `npm run test:watch` | `vitest` — watch mode |
| `npm run test:coverage` | `vitest run --coverage` (v8 provider) |
| `npm run test:ui` | `vitest --ui` |
| `npm run lint` | `eslint --ext .ts,.tsx .` |
| `npm run start` | `electron-forge start` (dev mode) |

## Vitest Configuration

- **Default environment**: `node` (main process / shared code)
- **Renderer tests**: opt-in `jsdom` via `/** @vitest-environment jsdom */` file-level comment
- **Path alias**: `@/` → `./src`
- **Test glob**: `src/**/*.{test,spec}.{ts,tsx}` and `test/**/*.{test,spec}.{ts,tsx}`
- **Timeouts**: 10s for both test and hook

## Project Structure

```
src/
├── main.ts                          # Electron main entry — creates BrowserWindow, wires IPC
├── preload.ts                       # contextBridge — exposes electronAPI to renderer
├── renderer.tsx                     # React entry — createRoot + <App />
├── index.css                        # Tailwind theme + scrollbar styles
├── main/
│   ├── ipc/
│   │   ├── agent.ts                 # agent:* + config:* IPC handlers, loadConfig/saveConfig
│   │   ├── auth.ts                  # auth:* IPC handlers
│   │   ├── chat.ts                  # chat:* IPC handlers
│   │   ├── genesis.ts               # genesis:* IPC handlers
│   │   └── lens.ts                  # lens:* IPC handlers
│   ├── services/
│   │   ├── AuthService.ts           # GitHub device flow OAuth + keytar credential storage
│   │   ├── ChatService.ts           # SDK session management, message streaming
│   │   ├── ExtensionLoader.ts       # Discovers & loads mind extensions via adapters
│   │   ├── MindScaffold.ts          # Genesis flow — creates mind directory structure
│   │   ├── SdkLoader.ts             # Singleton CopilotClient — SDK bootstrap, path resolution
│   │   ├── ViewDiscovery.ts         # Lens view scanning, data loading, prompt refresh
│   │   └── adapters/
│   │       ├── canvas.ts            # Canvas extension adapter
│   │       ├── cron.ts              # Cron extension adapter
│   │       └── idea.ts              # IDEA extension adapter (child-process Node)
│   └── assets/
│       └── lens-skill/              # Bundled SKILL.md for auto-install
├── renderer/
│   ├── App.tsx                      # Root: AppStateProvider → AuthGate → GenesisGate → AppShell
│   ├── lib/
│   │   ├── utils.ts                 # cn(), generateId(), formatTime()
│   │   ├── utils.test.ts            # ✅ 9 tests
│   │   ├── store.tsx                # AppState context, reducer, getPlainContent()
│   │   └── store.test.ts            # ✅ 4 tests
│   ├── hooks/
│   │   ├── useAgentStatus.ts        # Fetches + subscribes to agent status
│   │   ├── useAppSubscriptions.ts   # Chat events, lens views, model loading
│   │   └── useChatStreaming.ts      # sendMessage + stopStreaming via electronAPI
│   └── components/
│       ├── auth/
│       │   ├── AuthGate.tsx          # Checks auth status, shows AuthScreen if needed
│       │   └── AuthScreen.tsx        # Device flow login UI
│       ├── chat/
│       │   ├── ChatPanel.tsx         # Composes MessageList + ChatInput + WelcomeScreen
│       │   ├── ChatInput.tsx         # Textarea + model selector + send/stop button
│       │   ├── MessageList.tsx       # Auto-scrolling message list
│       │   ├── StreamingMessage.tsx  # Renders ContentBlock[] (text/tool/reasoning)
│       │   ├── ToolBlock.tsx         # Collapsible tool call display
│       │   ├── ReasoningBlock.tsx    # Collapsible reasoning display
│       │   └── WelcomeScreen.tsx     # Starter prompts grid
│       ├── genesis/
│       │   ├── GenesisGate.tsx       # Shows landing or genesis flow if no mind connected
│       │   ├── GenesisFlow.tsx       # Multi-stage: void → voice → role → boot → done
│       │   ├── VoidScreen.tsx        # Boot text animation
│       │   ├── VoiceScreen.tsx       # Voice/persona picker
│       │   ├── RoleScreen.tsx        # Role picker (Chief of Staff, etc.)
│       │   ├── BootScreen.tsx        # Genesis progress display
│       │   ├── LandingScreen.tsx     # New Agent / Open Existing
│       │   ├── NameScreen.tsx        # Name input (unused in current flow)
│       │   └── TypeWriter.tsx        # Character-by-character text animation
│       ├── layout/
│       │   ├── AppShell.tsx          # Main layout: ActivityBar + SidePanel + ViewRouter
│       │   ├── ActivityBar.tsx       # Icon sidebar for view switching
│       │   ├── SidePanel.tsx         # Contextual sidebar (chat actions / lens info)
│       │   ├── Sidebar.tsx           # Legacy sidebar (appears unused)
│       │   └── ViewRouter.tsx        # Routes activeView to ChatPanel or LensViewRenderer
│       ├── views/
│       │   ├── LensViewRenderer.tsx  # Loads view data, handles refresh/action, routes to view type
│       │   ├── HelloWorldView.tsx    # Debug/placeholder view
│       │   ├── LensBriefing.tsx      # Card grid briefing view
│       │   ├── LensTable.tsx         # Table view
│       │   ├── LensStatusBoard.tsx   # Status card grid
│       │   ├── LensDetail.tsx        # Single-item detail card
│       │   ├── LensTimeline.tsx      # Timeline/feed view
│       │   └── LensEditor.tsx        # Editable form view with save
│       └── ui/                       # shadcn/Radix UI primitives
│           ├── badge.tsx
│           ├── card.tsx
│           ├── collapsible.tsx
│           ├── scroll-area.tsx
│           ├── select.tsx
│           ├── separator.tsx
│           ├── table.tsx
│           └── tooltip.tsx
└── shared/
    ├── types.ts                      # All shared types (ChatMessage, ChatEvent, ContentBlock, etc.)
    ├── createIpcListener.ts          # IPC listener factory with cleanup
    └── createIpcListener.test.ts     # ✅ 4 tests
```

## Existing Tests (17 passing)

### 1. `src/shared/createIpcListener.test.ts` — 4 tests
- Registers listener on channel ✅
- Forwards events without IpcRendererEvent object ✅
- Returns unsubscribe function ✅
- Stops receiving after unsubscribe ✅
- **Pattern**: Mock `IpcRenderer` with `on`/`removeListener` + helper `_emit`, uses `vi.fn()`

### 2. `src/renderer/lib/utils.test.ts` — 9 tests (no jsdom comment — runs in node)
- `cn()`: merges classes, handles conditionals, deduplicates Tailwind conflicts, empty input
- `generateId()`: non-empty string, unique IDs, timestamp-random format
- `formatTime()`: formatted output, fixed timestamp
- **Pattern**: Pure function testing, no mocks needed

### 3. `src/renderer/lib/store.test.ts` — 4 tests (`@vitest-environment jsdom`)
- `getPlainContent()`: extracts text blocks, ignores non-text, empty blocks
- **Pattern**: Helper `makeMessage()` factory, tests exported pure function only (not reducer/context)

### What's NOT Covered

| Area | Gap |
|------|-----|
| **store.tsx reducer** | `handleChatEvent()` (complex switch over 8 event types), `appReducer()` (12 action types) — the core state machine is untested |
| **All React components** | Zero component render tests |
| **All custom hooks** | `useAgentStatus`, `useAppSubscriptions`, `useChatStreaming` — untested |
| **Main process services** | `ExtensionLoader`, `MindScaffold` (pure logic portions), `AuthService` (pure helpers), `ViewDiscovery` |
| **IPC handlers** | `loadConfig`/`saveConfig` in agent.ts — pure fs functions |
| **Preload bridge** | `preload.ts` — structural, low value |
| **Shared types** | `types.ts` — type-only, no runtime logic |

## Files to Test

### High Priority

| File | Exports to Test | Testability | Notes |
|------|-----------------|-------------|-------|
| `src/renderer/lib/store.tsx` | `handleChatEvent()`, `appReducer()` | **High** | Pure reducer functions. `handleChatEvent` is the most complex logic in the app — 8 event types mutating message blocks. `appReducer` handles 12 action types. Both are pure `(state, action) → state`. The existing test only covers `getPlainContent`. |
| `src/main/services/ExtensionLoader.ts` | `ExtensionLoader.registerAdapter()`, `discoverExtensions()`, `loadTools()`, `getLoadedExtensions()`, `cleanup()` | **High** | Class with injectable adapter functions. `discoverExtensions()` reads fs but is easily mockable. Core logic is adapter registration + orchestration. No Electron deps. |
| `src/main/services/MindScaffold.ts` | `MindScaffold.slugify()`, `MindScaffold.getDefaultBasePath()`, `validate()` | **High** | `slugify()` and `getDefaultBasePath()` are pure static methods. `validate()` reads fs but structure is simple. `createStructure()` is fs.mkdir calls — mockable. Skip `generateSoul()` and `bootstrapCapabilities()` (SDK + network deps). |
| `src/renderer/components/chat/WelcomeScreen.tsx` | Render, starter prompts, callback | **High** | Simple presentational component. Tests: renders prompts when connected, shows directory message when not, calls `onSendMessage` on click. No external deps beyond props. |
| `src/renderer/components/genesis/TypeWriter.tsx` | Character animation, onComplete | **High** | Self-contained component with timer logic. Tests: progressive reveal, completion callback, cursor display. Uses `setInterval` — use `vi.useFakeTimers()`. |
| `src/renderer/components/genesis/LandingScreen.tsx` | Render, button callbacks | **High** | Pure presentational. Two buttons, two callbacks. Trivial to test. |

### Medium Priority

| File | Exports to Test | Testability | Notes |
|------|-----------------|-------------|-------|
| `src/renderer/components/chat/StreamingMessage.tsx` | Block rendering, thinking indicator | **Medium** | Renders `ContentBlock[]` — text (Markdown), tool calls, reasoning. Tests: empty+streaming shows dots, text blocks render, tool blocks render `ToolBlock`, reasoning renders. Needs `react-markdown` + `remark-gfm` in jsdom (may need mocking). |
| `src/renderer/components/chat/ChatInput.tsx` | Submit, keyboard, disabled states | **Medium** | Controlled textarea + submit logic. Tests: Enter sends, Shift+Enter doesn't, disabled state, stop button when streaming. Needs mock for model `Select` (Radix). |
| `src/renderer/components/chat/ToolBlock.tsx` | Collapsible tool display, status icons | **Medium** | Takes a `ToolCallBlock` prop. Tests: shows tool name, status badge, expandable output/error. Uses Radix Collapsible. |
| `src/renderer/components/chat/ReasoningBlock.tsx` | Collapsible reasoning display | **Medium** | Similar to ToolBlock. Simple prop → render. |
| `src/renderer/components/auth/AuthGate.tsx` | Auth check flow | **Medium** | Calls `window.electronAPI.auth.getStatus()` in useEffect. Tests: shows children when authenticated, shows AuthScreen when not. Needs `window.electronAPI` mock. |
| `src/renderer/components/genesis/GenesisGate.tsx` | Gate logic | **Medium** | Shows landing or genesis flow based on state. Needs `AppStateProvider` + `window.electronAPI` mock. |
| `src/renderer/components/layout/ViewRouter.tsx` | View routing | **Medium** | Routes `activeView` to ChatPanel or LensViewRenderer. Simple switch logic. Needs AppState context. |
| `src/renderer/components/views/LensBriefing.tsx` | Card rendering from data+schema | **Medium** | Pure presentational. Maps data keys → Card components. Tests: renders all keys, uses schema titles, handles numbers vs strings. |
| `src/renderer/components/views/LensTable.tsx` | Table rendering | **Medium** | Renders data as table. Tests: derives columns from schema or data, formats cells. |
| `src/renderer/components/views/LensStatusBoard.tsx` | Status cards + status detection | **Medium** | `getStatusVariant()` and `getStatusDot()` are testable pure functions (currently not exported). Card rendering from data. |
| `src/renderer/components/views/LensDetail.tsx` | Detail card rendering | **Medium** | Pure presentational from props. |
| `src/renderer/components/views/LensTimeline.tsx` | Timeline rendering | **Medium** | Pure presentational from props. |
| `src/renderer/components/views/LensEditor.tsx` | Form editing + dirty tracking | **Medium** | Stateful form. Tests: renders fields, tracks dirty state, calls onSave with updates. |
| `src/renderer/hooks/useChatStreaming.ts` | sendMessage, stopStreaming | **Medium** | Calls `electronAPI.chat.send/stop`. Needs AppState context + electronAPI mock. Consider `renderHook` from @testing-library/react. |
| `src/renderer/hooks/useAgentStatus.ts` | Status fetch + subscribe | **Medium** | Calls `electronAPI.agent.getStatus()` + `onStatusChanged`. Needs context + mock. |
| `src/main/ipc/agent.ts` | `loadConfig()`, `saveConfig()` | **Medium** | Pure fs read/write to `~/.chamber/config.json`. Mockable with `vi.mock('fs')` or temp dir. |
| `src/main/services/AuthService.ts` | `getLoginFromAccount()`, `getCredentialAccount()`, `resolveStoredCredential()` | **Medium** | Three pure helper functions (currently not exported). If exported, they're trivially testable. The class methods depend on keytar + https — harder. |
| `src/main/services/ViewDiscovery.ts` | `scan()`, `getViews()`, `getViewData()` | **Medium** | Reads fs for view.json manifests. Mockable. `seedDefaults()` and `installLensSkill()` write files. Core scan logic is testable with mock fs. Depends on `BrowserWindow` only in `startWatching`. |

### Low Priority / Skip

| File | Reason |
|------|--------|
| `src/main.ts` | Electron app lifecycle — tightly coupled to `app`, `BrowserWindow`, `ipcMain`. Integration-only. |
| `src/preload.ts` | Thin bridge — every method is a one-liner delegating to `ipcRenderer.invoke/send/on`. No logic. |
| `src/renderer.tsx` | `createRoot` + `<App />` — entry point, no logic. |
| `src/index.css` | CSS — not testable. |
| `src/shared/types.ts` | Type-only file, no runtime code. |
| `src/main/services/SdkLoader.ts` | Deep Electron + npm + fs + child_process integration. Singleton with module-level state. Too tightly coupled for unit tests. |
| `src/main/services/ChatService.ts` | Depends on CopilotClient SDK sessions. Would need full SDK mock. Core streaming logic is complex but integration-heavy. |
| `src/main/services/adapters/canvas.ts` | Dynamic ESM import from mind directory. Requires actual extension files. |
| `src/main/services/adapters/cron.ts` | Same — dynamic import of extension modules. |
| `src/main/services/adapters/idea.ts` | Spawns child process with system Node. Integration-only. |
| `src/main/ipc/auth.ts` | Thin wiring — delegates to AuthService. 15 lines of Electron glue. |
| `src/main/ipc/chat.ts` | Thin wiring — delegates to ChatService. |
| `src/main/ipc/genesis.ts` | Thin wiring — delegates to MindScaffold. |
| `src/main/ipc/lens.ts` | Thin wiring — 4 one-liner handlers delegating to ViewDiscovery. |
| `src/renderer/components/ui/*.tsx` | Third-party shadcn/Radix primitives. Not project code. |
| `src/renderer/components/layout/Sidebar.tsx` | Appears unused (replaced by SidePanel + ActivityBar). |
| `src/renderer/components/genesis/NameScreen.tsx` | Not used in current GenesisFlow (voice screen replaced it). |
| `src/renderer/components/layout/AppShell.tsx` | Thin composition — renders ActivityBar + SidePanel + ViewRouter. |
| `src/renderer/components/layout/ActivityBar.tsx` | UI-heavy, Tooltip-heavy. Low logic density. |
| `src/renderer/components/layout/SidePanel.tsx` | UI-heavy. Low logic beyond display. |
| `src/renderer/components/genesis/VoidScreen.tsx` | Animation-heavy. Timer-dependent. Low logic. |
| `src/renderer/components/genesis/VoiceScreen.tsx` | UI-heavy card picker. Calls electronAPI. Low isolated logic. |
| `src/renderer/components/genesis/RoleScreen.tsx` | Card picker with selection animation. Low isolated logic. |
| `src/renderer/components/genesis/BootScreen.tsx` | Progress display. Subscribes to genesis:onProgress. Timer-heavy. |
| `src/renderer/components/chat/ChatPanel.tsx` | Thin composition of MessageList + ChatInput + WelcomeScreen. |
| `src/renderer/components/chat/MessageList.tsx` | Scroll handling + message iteration. Most logic is auto-scroll. |
| `src/renderer/components/views/HelloWorldView.tsx` | Debug view. Reads state and displays. |
| `src/renderer/components/views/LensViewRenderer.tsx` | Orchestrator with `electronAPI` calls. Medium logic but heavy integration. |
| `src/renderer/hooks/useAppSubscriptions.ts` | Subscribes to 3 IPC channels + fetches models/views. Side-effect heavy. |

## Testing Patterns (from existing tests)

### 1. Environment Selection
```typescript
// Renderer tests requiring DOM:
/** @vitest-environment jsdom */

// Shared/main tests: no comment needed (default is 'node')
```

### 2. Imports
```typescript
import { describe, it, expect, vi } from 'vitest';
// No global setup file — vitest globals are enabled in config
```

### 3. Mock Factories
```typescript
// IPC mock pattern (from createIpcListener.test.ts):
function makeMockIpcRenderer() {
  const listeners = new Map<string, Function[]>();
  return {
    on: vi.fn((channel, handler) => { /* ... */ }),
    removeListener: vi.fn((channel, handler) => { /* ... */ }),
    _emit(channel, ...args) { /* simulate event */ },
  } as unknown as IpcRenderer & { _emit: (...) => void };
}
```

### 4. Test Data Factories
```typescript
// Message factory pattern (from store.test.ts):
function makeMessage(blocks: ContentBlock[], overrides?: Partial<ChatMessage>): ChatMessage {
  return { id: 'msg-1', role: 'assistant', blocks, timestamp: Date.now(), ...overrides };
}
```

### 5. Assertions
- Direct value comparison: `expect(result).toBe('expected')`
- Pattern matching: `expect(result).toMatch(/\d{1,2}:\d{2}/)`
- Spy verification: `expect(spy).toHaveBeenCalledWith('arg', expect.any(Function))`
- Call count: `expect(callback).toHaveBeenCalledTimes(1)`

## Recommendations

### Priority Order for Test Generation

1. **`store.tsx` reducer** — `handleChatEvent()` + `appReducer()` — the untested heart of the app. Pure functions, high complexity, high value. ~30-40 tests covering all event types and action types.

2. **`ExtensionLoader.ts`** — Clean class design with injectable adapters. Mock `fs` for `discoverExtensions`, provide fake adapters for `loadTools`. ~10-15 tests.

3. **`MindScaffold.ts` pure methods** — `slugify()`, `getDefaultBasePath()`, `validate()`. ~8-10 tests.

4. **Presentational components** (WelcomeScreen, LandingScreen, TypeWriter) — Quick wins, high confidence. ~5-8 tests each.

5. **Lens view components** (LensBriefing, LensTable, LensDetail, LensStatusBoard, LensTimeline, LensEditor) — Pure data→UI. ~5-8 tests each.

6. **Chat display components** (StreamingMessage, ToolBlock, ReasoningBlock) — Medium complexity. ~5-8 tests each.

7. **ChatInput** — Form behavior testing. ~6-8 tests.

8. **Gate components** (AuthGate, GenesisGate) — Need electronAPI mock. ~4-6 tests each.

9. **Hooks** (useChatStreaming, useAgentStatus) — Need renderHook + context + mocks. ~4-6 tests each.

10. **`loadConfig`/`saveConfig`** — fs mocking. ~4 tests.

### Mocking Strategy

#### `window.electronAPI` (for renderer tests)
```typescript
// Global mock for all renderer component/hook tests:
const mockElectronAPI = {
  chat: {
    send: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn().mockResolvedValue(undefined),
    listModels: vi.fn().mockResolvedValue([]),
    onEvent: vi.fn().mockReturnValue(() => {}),
  },
  agent: {
    getStatus: vi.fn().mockResolvedValue({ connected: false, mindPath: null, agentName: null, sessionActive: false, uptime: null, error: null, extensions: [] }),
    selectMindDirectory: vi.fn().mockResolvedValue(null),
    setMindPath: vi.fn().mockResolvedValue(undefined),
    onStatusChanged: vi.fn().mockReturnValue(() => {}),
  },
  lens: {
    getViews: vi.fn().mockResolvedValue([]),
    getViewData: vi.fn().mockResolvedValue(null),
    refreshView: vi.fn().mockResolvedValue(null),
    sendAction: vi.fn().mockResolvedValue(null),
    onViewsChanged: vi.fn().mockReturnValue(() => {}),
  },
  auth: {
    getStatus: vi.fn().mockResolvedValue({ authenticated: true }),
    startLogin: vi.fn().mockResolvedValue({ success: true }),
    onProgress: vi.fn().mockReturnValue(() => {}),
  },
  genesis: {
    getDefaultPath: vi.fn().mockResolvedValue('C:\\Users\\test\\agents'),
    pickPath: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ success: true }),
    onProgress: vi.fn().mockReturnValue(() => {}),
  },
  config: {
    load: vi.fn().mockResolvedValue({ mindPath: null, theme: 'dark' }),
    save: vi.fn().mockResolvedValue(undefined),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  },
};

// In beforeEach:
Object.defineProperty(window, 'electronAPI', { value: mockElectronAPI, writable: true });
```

#### `localStorage` (for store.tsx tests in jsdom)
jsdom provides `localStorage` automatically. No mock needed.

#### `fs` module (for main process tests)
```typescript
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));
```

#### `electron` module (for main process tests)
```typescript
vi.mock('electron', () => ({
  app: { getPath: vi.fn(), getVersion: vi.fn().mockReturnValue('0.14.0'), isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: vi.fn().mockReturnValue([]) },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn() },
}));
```

### Framework Choices

- **Renderer component tests**: `@testing-library/react` (`render`, `screen`, `fireEvent`, `waitFor`)
- **Hook tests**: `@testing-library/react` `renderHook` with wrapper providing `AppStateProvider`
- **Pure function tests**: Direct import + assertions
- **Main process service tests**: `vi.mock()` for `fs`, `electron`, `child_process`
- **Timers**: `vi.useFakeTimers()` for TypeWriter and any setTimeout-dependent code
- **Async**: `await waitFor(() => ...)` for React state updates, direct `await` for promises

### Key Architectural Notes

1. **`handleChatEvent()` is not exported** — it's a module-level function in `store.tsx`. To test it, either:
   - Export it (recommended — it's pure, deserves direct testing)
   - Test indirectly by dispatching `CHAT_EVENT` actions through the reducer

2. **`appReducer()` is not exported** — same situation. Either export or test through context. Exporting the reducer is the recommended approach for maximum test coverage.

3. **AuthService pure helpers** (`getLoginFromAccount`, `getCredentialAccount`, `resolveStoredCredential`) are module-level functions, not exported. Consider exporting for testability.

4. **LensStatusBoard helpers** (`getStatusVariant`, `getStatusDot`) are module-level functions, not exported. Could be extracted and tested directly.

5. **`react-markdown`** in StreamingMessage may need mocking in jsdom if it doesn't render cleanly. Alternative: mock it as a passthrough `({children}) => <div>{children}</div>`.

### Estimated Test Count

| Category | Files | Est. Tests |
|----------|-------|------------|
| store.tsx reducer (handleChatEvent + appReducer) | 1 | 35-45 |
| ExtensionLoader | 1 | 10-15 |
| MindScaffold pure methods | 1 | 8-10 |
| Presentational components | 3 | 15-20 |
| Lens view components | 6 | 30-40 |
| Chat display components | 3 | 15-20 |
| ChatInput | 1 | 6-8 |
| Gate components | 2 | 8-12 |
| Hooks | 2-3 | 8-12 |
| Config helpers | 1 | 4-6 |
| **Total** | **~22** | **~140-190** |
