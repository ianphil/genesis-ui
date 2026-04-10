# Chamber Test Implementation Plan

> **Baseline:** 17 tests passing (utils 9, getPlainContent 4, createIpcListener 4)
> **Target:** ~160–190 tests across ~22 new test files
> **Conventions:** Vitest 4 + jsdom opt-in, @testing-library/react, vi.fn() mocks, factory helpers

---

## Phase 1 — Test Infrastructure + Core State Machine

### Why first
Everything downstream depends on two things: (1) shared mock factories and helpers, and (2) confidence in the reducer that drives all app state. The store reducer (`handleChatEvent` + `appReducer`) is the single most complex and most important untested code in the app. Test it before anything that consumes it.

### 1A. Shared test helpers — `src/test/helpers.ts`

**Purpose:** Central factory for `mockElectronAPI`, state factories, and type builders reused by every renderer test.

**Contents:**

```ts
// No vitest-environment comment — importable from any environment

export function mockElectronAPI() {
  // Return a fully-typed mock matching window.electronAPI shape.
  // Every method is vi.fn() with sensible defaults:
  //   chat.send → resolvedValue(undefined)
  //   chat.stop → resolvedValue(undefined)
  //   chat.newConversation → resolvedValue(undefined)
  //   chat.listModels → resolvedValue([])
  //   chat.onEvent → returnValue(() => {})   // unsubscribe stub
  //   agent.getStatus → resolvedValue(defaultAgentStatus())
  //   agent.selectMindDirectory → resolvedValue(null)
  //   agent.setMindPath → resolvedValue(undefined)
  //   agent.onStatusChanged → returnValue(() => {})
  //   lens.getViews → resolvedValue([])
  //   lens.getViewData → resolvedValue(null)
  //   lens.refreshView → resolvedValue(null)
  //   lens.sendAction → resolvedValue(null)
  //   lens.onViewsChanged → returnValue(() => {})
  //   auth.getStatus → resolvedValue({ authenticated: true })
  //   auth.startLogin → resolvedValue({ success: true })
  //   auth.onProgress → returnValue(() => {})
  //   genesis.getDefaultPath → resolvedValue('C:\\Users\\test\\agents')
  //   genesis.pickPath → resolvedValue(null)
  //   genesis.create → resolvedValue({ success: true })
  //   genesis.onProgress → returnValue(() => {})
  //   config.load → resolvedValue({ mindPath: null, theme: 'dark' })
  //   config.save → resolvedValue(undefined)
  //   window.minimize → vi.fn()
  //   window.maximize → vi.fn()
  //   window.close → vi.fn()
}

export function installElectronAPI(api = mockElectronAPI()) {
  Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });
  return api;
}

export function defaultAgentStatus(): AgentStatus {
  return { connected: false, mindPath: null, agentName: null, sessionActive: false, uptime: null, error: null, extensions: [] };
}

export function connectedAgentStatus(overrides?: Partial<AgentStatus>): AgentStatus {
  return { connected: true, mindPath: 'C:\\test\\mind', agentName: 'test-agent', sessionActive: true, uptime: 100, error: null, extensions: [], ...overrides };
}

export function makeTextBlock(content: string, sdkMessageId?: string): TextBlock { ... }
export function makeToolCallBlock(overrides?: Partial<ToolCallBlock>): ToolCallBlock { ... }
export function makeReasoningBlock(content: string, reasoningId?: string): ReasoningBlock { ... }
export function makeMessage(blocks: ContentBlock[], overrides?: Partial<ChatMessage>): ChatMessage { ... }
export function makeChatEvent(type: string, overrides?: Record<string, unknown>): ChatEvent { ... }
export function makeLensViewManifest(overrides?: Partial<LensViewManifest>): LensViewManifest { ... }
```

**Test file:** `src/test/helpers.test.ts` — 3–4 smoke tests confirming factories return valid shapes.

---

### 1B. Export `handleChatEvent` and `appReducer` from store.tsx

**Source change required:** `src/renderer/lib/store.tsx`

Currently `handleChatEvent` and `appReducer` are module-scoped and not exported. They are pure functions (`(state, event) → state` and `(state, action) → state`) and deserve direct unit testing.

**Action:** Add named exports:

```ts
// Add to existing exports in store.tsx:
export { handleChatEvent, appReducer, initialState };
// Also export the AppState type and AppAction type for test type-safety.
export type { AppState, AppAction };
```

This is a non-breaking change — nothing in the app imports these names today.

---

### 1C. Store reducer tests — `src/renderer/lib/store.reducer.test.ts`

> **Environment:** `/** @vitest-environment jsdom */` (matches existing store.test.ts)

**Import:** `handleChatEvent`, `appReducer`, `initialState` from `@/renderer/lib/store`

#### `handleChatEvent` tests (~20 tests)

Starting state for each test: a messages array containing one assistant message with `isStreaming: true` and an empty `blocks` array.

| # | Scenario | Input event | Assertion |
|---|----------|-------------|-----------|
| 1 | `chunk` — first text creates a TextBlock | `{ type:'chunk', content:'Hello' }` | `blocks[0]` is `{ type:'text', content:'Hello' }` |
| 2 | `chunk` — subsequent text appends to existing TextBlock | Two `chunk` events | `blocks[0].content === 'HelloWorld'` |
| 3 | `chunk` — after a tool block, creates NEW text block | tool_start then chunk | `blocks.length === 2`, `blocks[1].type === 'text'` |
| 4 | `chunk` — with sdkMessageId, sets it on block | `{ type:'chunk', content:'x', sdkMessageId:'sdk-1' }` | `blocks[0].sdkMessageId === 'sdk-1'` |
| 5 | `tool_start` — creates tool_call block | `{ type:'tool_start', toolCallId:'tc1', toolName:'readFile' }` | `blocks[0]` is ToolCallBlock with status `'running'` |
| 6 | `tool_start` — with arguments | include `arguments: '{"path":"x"}'` | block has `.arguments` |
| 7 | `tool_start` — with parentToolCallId | include `parentToolCallId: 'tc0'` | block has `.parentToolCallId` |
| 8 | `tool_progress` — appends output | tool_start then `{ type:'tool_progress', toolCallId:'tc1', output:'line1' }` | `blocks[0].output === 'line1'` |
| 9 | `tool_progress` — accumulates output | Two progress events | output concatenated |
| 10 | `tool_output` — appends output | tool_start then `{ type:'tool_output', toolCallId:'tc1', output:'result' }` | output contains 'result' |
| 11 | `tool_done` — success sets status='done' | tool_start then `{ type:'tool_done', toolCallId:'tc1' }` | `status === 'done'` |
| 12 | `tool_done` — with result | include `result: 'ok'` | block has `.result` |
| 13 | `tool_done` — with error | include `error: 'fail'` | `status === 'error'`, block has `.error` |
| 14 | `tool_done` — unknown toolCallId is no-op | `{ type:'tool_done', toolCallId:'unknown' }` | blocks unchanged |
| 15 | `reasoning` — creates ReasoningBlock | `{ type:'reasoning', reasoningId:'r1', content:'thinking' }` | `blocks[0].type === 'reasoning'` |
| 16 | `reasoning` — appends to existing block | Two reasoning events same id | content concatenated |
| 17 | `reasoning` — new id creates new block | Two reasoning events different ids | `blocks.length === 2` |
| 18 | `message_final` — reconciles with final text | `{ type:'message_final', content:'Final answer' }` | text block content matches |
| 19 | `done` — sets isStreaming=false | `{ type:'done' }` | message `isStreaming === false` |
| 20 | `error` — adds error text block, sets isStreaming=false | `{ type:'error', error:'timeout' }` | last block is TextBlock with error content, `isStreaming === false` |

#### `appReducer` tests (~18 tests)

| # | Action type | Setup | Assertion |
|---|-------------|-------|-----------|
| 1 | `ADD_USER_MESSAGE` | dispatch with id, content, timestamp | messages array has new user message with TextBlock |
| 2 | `ADD_USER_MESSAGE` | sets `isStreaming: false` on message | message has `role: 'user'` |
| 3 | `ADD_ASSISTANT_MESSAGE` | dispatch with id, timestamp | messages has new assistant msg, `isStreaming: true`, empty blocks |
| 4 | `CHAT_EVENT` | prev: has assistant msg; dispatch event | delegates to `handleChatEvent`, message updated |
| 5 | `CHAT_EVENT` — message not found | wrong messageId | state unchanged |
| 6 | `SET_AGENT_STATUS` | dispatch with AgentStatus | `state.agentStatus` updated |
| 7 | `SET_AVAILABLE_MODELS` | dispatch with ModelInfo[] | `state.availableModels` updated |
| 8 | `SET_SELECTED_MODEL` | dispatch with model id | `state.selectedModel` updated |
| 9 | `SET_SELECTED_MODEL` — null clears selection | dispatch null | `state.selectedModel === null` |
| 10 | `SET_ACTIVE_VIEW` | dispatch 'chat' | `state.activeView === 'chat'` |
| 11 | `SET_ACTIVE_VIEW` — custom lens view | dispatch 'briefing-1' | `state.activeView === 'briefing-1'` |
| 12 | `SET_DISCOVERED_VIEWS` | dispatch LensViewManifest[] | `state.discoveredViews` updated |
| 13 | `SHOW_LANDING` | dispatch | `state.showLanding === true` |
| 14 | `HIDE_LANDING` | dispatch | `state.showLanding === false` |
| 15 | `CLEAR_MESSAGES` | prev: 3 messages; dispatch | `state.messages` is empty array |
| 16 | `NEW_CONVERSATION` | prev: messages + streaming; dispatch | messages cleared, isStreaming false, new conversationId |
| 17 | `NEW_CONVERSATION` — generates new conversationId | compare before/after | IDs differ |
| 18 | Unknown action type | dispatch `{ type: 'BOGUS' }` | state returned unchanged |

### Phase 1 success criteria
- `src/test/helpers.ts` exists and exports all factories listed above
- `handleChatEvent`, `appReducer`, `initialState`, `AppState`, `AppAction` are exported from `store.tsx`
- `store.reducer.test.ts` has ~38 passing tests covering every event type and every action type
- Existing 17 tests still pass
- `npm run test` green

---

## Phase 2 — Main Process Pure Functions & Services

### Why second
These are pure functions and classes in the main process with zero React/DOM deps. They establish patterns for `vi.mock('fs')` and class-level testing. Each file is independently testable and independently committable.

### 2A. MindScaffold pure methods — `src/main/services/MindScaffold.test.ts`

**Environment:** node (default — no jsdom comment)

| # | Function | Scenario | Assertion |
|---|----------|----------|-----------|
| 1 | `slugify` | simple name → `'my-agent'` | lowercase, spaces → hyphens |
| 2 | `slugify` | special chars → stripped | `'Hello World!'` → `'hello-world'` |
| 3 | `slugify` | leading/trailing hyphens trimmed | `'--test--'` → `'test'` |
| 4 | `slugify` | consecutive hyphens collapsed | `'a---b'` → `'a-b'` |
| 5 | `slugify` | unicode/emoji stripped | `'café ☕'` → `'caf'` or `'caf-'` (verify actual) |
| 6 | `slugify` | empty string | returns `''` |
| 7 | `getDefaultBasePath` | returns `os.homedir()/agents` | `path.join(os.homedir(), 'agents')` |
| 8 | `validate` — valid mind | create temp dir with IDEA folders + .github | `{ ok: true, missing: [] }` |
| 9 | `validate` — missing folders | partial structure | `ok: false`, `missing` lists the gaps |
| 10 | `validate` — nonexistent path | random path | `ok: false` |

~10 tests. Mock `fs` for validate tests OR use real temp directories.

### 2B. AuthService helpers — `src/main/services/AuthService.test.ts`

**Source change required:** Export the three module-level helpers from `AuthService.ts`:
```ts
export { getCredentialAccount, getLoginFromAccount, resolveStoredCredential };
```

**Tests:**

| # | Function | Scenario | Assertion |
|---|----------|----------|-----------|
| 1 | `getCredentialAccount` | `'alice'` | `'https://github.com:alice'` (or whatever the prefix is — verify actual `GITHUB_ACCOUNT_PREFIX`) |
| 2 | `getCredentialAccount` | empty string | returns prefix only |
| 3 | `getLoginFromAccount` | valid account string | extracts login |
| 4 | `getLoginFromAccount` | wrong prefix | returns `null` |
| 5 | `getLoginFromAccount` | empty string | returns `null` |
| 6 | `resolveStoredCredential` | one valid cred | returns `{ login, account, password }` |
| 7 | `resolveStoredCredential` | multiple valid creds | returns first, warns via console |
| 8 | `resolveStoredCredential` | no valid creds | returns `null` |
| 9 | `resolveStoredCredential` | empty array | returns `null` |

~9 tests.

### 2C. ExtensionLoader — `src/main/services/ExtensionLoader.test.ts`

**Mocks:** `vi.mock('fs')` for `existsSync`, `readdirSync`.

| # | Method | Scenario | Assertion |
|---|--------|----------|-----------|
| 1 | `registerAdapter` | register one adapter | `getLoadedExtensions()` empty until `loadTools` |
| 2 | `registerAdapter` | register multiple adapters | all tracked |
| 3 | `discoverExtensions` | mindPath has `.github/extensions/` with subdirs | returns extension names |
| 4 | `discoverExtensions` | no extensions dir | returns `[]` |
| 5 | `discoverExtensions` | extensions dir is empty | returns `[]` |
| 6 | `loadTools` | adapter returns tools | tools aggregated, `getLoadedExtensions` updated |
| 7 | `loadTools` | adapter throws | error handled gracefully, other adapters still run |
| 8 | `loadTools` | no registered adapters | returns `[]` |
| 9 | `getLoadedExtensions` | after loadTools | returns loaded extension names |
| 10 | `cleanup` | calls cleanup on adapters | adapters' cleanup invoked |

~10 tests.

### 2D. loadConfig / saveConfig — `src/main/ipc/agent.test.ts`

**Mocks:** `vi.mock('fs')` for `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`.

| # | Function | Scenario | Assertion |
|---|----------|----------|-----------|
| 1 | `loadConfig` | config file exists | returns parsed JSON |
| 2 | `loadConfig` | config file missing | returns default `{ mindPath: null, theme: 'dark' }` |
| 3 | `loadConfig` | config file has invalid JSON | returns default (graceful) |
| 4 | `saveConfig` | writes JSON to path | `writeFileSync` called with stringified config |
| 5 | `saveConfig` | creates directory if missing | `mkdirSync` called with `{ recursive: true }` |

~5 tests.

### Phase 2 success criteria
- 4 new test files, ~34 passing tests
- `AuthService.ts` exports the three helper functions
- All 51+ total tests pass (17 existing + 34 new)
- `npm run test` green

---

## Phase 3 — Presentational Components

### Why third
These components are pure data→UI with minimal dependencies. They establish `@testing-library/react` patterns and the `installElectronAPI()` helper usage for all subsequent component tests. Start simple, build confidence.

### 3A. WelcomeScreen — `src/renderer/components/chat/WelcomeScreen.test.tsx`

> `/** @vitest-environment jsdom */`

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | renders when connected | shows starter prompt buttons |
| 2 | renders when disconnected | shows "not connected" message, no prompt buttons |
| 3 | clicking a starter prompt | calls `onSendMessage` with the prompt text |
| 4 | renders Chamber title/branding | title text present |

~4 tests.

### 3B. LandingScreen — `src/renderer/components/genesis/LandingScreen.test.tsx`

> `/** @vitest-environment jsdom */`

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | renders two action buttons | "New Agent" and "Open Existing" visible |
| 2 | clicking New Agent | calls `onNewAgent` |
| 3 | clicking Open Existing | calls `onOpenExisting` |
| 4 | renders title/branding | Chamber title present |

~4 tests.

### 3C. TypeWriter — `src/renderer/components/genesis/TypeWriter.test.tsx`

> `/** @vitest-environment jsdom */`
> Uses `vi.useFakeTimers()`.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | progressively reveals text | after N intervals, shows first N characters |
| 2 | calls onComplete when done | after `text.length * speed` ms, callback fired |
| 3 | shows cursor during animation | cursor character (▊) visible while animating |
| 4 | hides cursor after completion | cursor gone (or `cursor={false}` hides it always) |
| 5 | respects speed prop | faster speed = fewer ticks to complete |
| 6 | text change restarts animation | update `text` prop, animation resets |

~6 tests. Remember `vi.advanceTimersByTime(ms)` and `cleanup` with `vi.useRealTimers()`.

### 3D. ToolBlock — `src/renderer/components/chat/ToolBlock.test.tsx`

> `/** @vitest-environment jsdom */`

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | shows tool name | `screen.getByText('readFile')` |
| 2 | running status shows spinner/badge | status badge text = 'running' |
| 3 | done status shows check icon/badge | status badge text = 'done' |
| 4 | error status shows X icon/badge | status badge text = 'error' |
| 5 | output displayed when present | pre text contains output |
| 6 | error text displayed when present | error content visible |

~6 tests. Use `makeToolCallBlock()` from helpers.

### 3E. ReasoningBlock — `src/renderer/components/chat/ReasoningBlock.test.tsx`

> `/** @vitest-environment jsdom */`

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | streaming shows "Thinking…" label | text present |
| 2 | non-streaming shows "Thought" label | text present |
| 3 | renders reasoning content | content text visible |
| 4 | collapsible toggle works | click expands/collapses |

~4 tests.

### 3F. StreamingMessage — `src/renderer/components/chat/StreamingMessage.test.tsx`

> `/** @vitest-environment jsdom */`
> **Mock `react-markdown`** as a passthrough: `vi.mock('react-markdown', () => ({ default: ({ children }: any) => <div>{children}</div> }))` to avoid jsdom rendering issues.
> Also mock `remark-gfm`: `vi.mock('remark-gfm', () => ({ default: () => {} }))`.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | empty blocks + streaming | shows thinking dots animation |
| 2 | text block renders content | text visible in DOM |
| 3 | tool_call block renders ToolBlock | ToolBlock component renders |
| 4 | reasoning block renders ReasoningBlock | ReasoningBlock component renders |
| 5 | multiple block types render in order | all blocks present |
| 6 | not streaming, no blocks | renders empty (no thinking dots) |
| 7 | streaming after non-text block | shows trailing indicator |

~7 tests.

### 3G. Lens view components

All follow the same pattern: `/** @vitest-environment jsdom */`, receive `data` and optional `schema` props.

#### `LensBriefing.test.tsx` (~5 tests)
| # | Scenario |
|---|----------|
| 1 | renders cards for each data key |
| 2 | numbers display large/bold |
| 3 | schema titles override key names |
| 4 | arrays joined with commas |
| 5 | empty data renders gracefully |

#### `LensTable.test.tsx` (~5 tests)
| # | Scenario |
|---|----------|
| 1 | single-row object renders as table |
| 2 | array data renders multiple rows |
| 3 | columns derived from schema when present |
| 4 | columns derived from first row data keys |
| 5 | empty data shows "No data" message |

#### `LensStatusBoard.test.tsx` (~6 tests)

**Source change recommended:** Export `getStatusVariant` and `getStatusDot` as named exports for direct testing. If not exported, test via rendered output.

| # | Scenario |
|---|----------|
| 1 | 'running' / 'ok' / 'active' → green variant |
| 2 | 'error' / 'fail' / 'down' → red variant |
| 3 | 'warn' / 'pending' → yellow variant |
| 4 | unknown status → default variant |
| 5 | renders status dot emoji matching variant |
| 6 | shows up to 3 metadata fields, truncates |

#### `LensDetail.test.tsx` (~4 tests)
| # | Scenario |
|---|----------|
| 1 | extracts title/description/status |
| 2 | renders metadata key-value pairs |
| 3 | status badge variant logic |
| 4 | schema title overrides data key names |

#### `LensTimeline.test.tsx` (~4 tests)
| # | Scenario |
|---|----------|
| 1 | renders timeline items with dots |
| 2 | field fallback: title→name→event |
| 3 | field fallback: time→timestamp→date→created_at |
| 4 | handles items without optional fields |

#### `LensEditor.test.tsx` (~6 tests)
| # | Scenario |
|---|----------|
| 1 | renders form fields from data |
| 2 | changing input enables Save button |
| 3 | Save button disabled when not dirty |
| 4 | clicking Save calls onSave with updates |
| 5 | enum schema renders select dropdown |
| 6 | boolean schema renders checkbox |

### Phase 3 success criteria
- ~12 new test files, ~61 passing tests
- All lens view components tested
- All chat display components tested
- `react-markdown` mock pattern established
- `vi.useFakeTimers()` pattern established for TypeWriter
- Total: ~112 tests passing
- `npm run test` green

---

## Phase 4 — Interactive Components, Gates & Hooks

### Why fourth
These require the `mockElectronAPI` factory, context providers, and `renderHook` — patterns established in prior phases. They also test async flows (useEffect → API call → state update) which are more complex to get right.

### 4A. ChatInput — `src/renderer/components/chat/ChatInput.test.tsx`

> `/** @vitest-environment jsdom */`

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | typing updates textarea value | `fireEvent.change` → value updated |
| 2 | Enter key submits non-empty text | `onSend` called with text, textarea cleared |
| 3 | Enter on empty text does not submit | `onSend` not called |
| 4 | Shift+Enter inserts newline | `onSend` not called, newline in value |
| 5 | disabled prop disables textarea | textarea has `disabled` attribute |
| 6 | streaming shows stop button | stop icon visible, send icon hidden |
| 7 | clicking stop calls onStop | `onStop` called |
| 8 | model selector renders models | options match `availableModels` prop |

~8 tests.

### 4B. AuthGate — `src/renderer/components/auth/AuthGate.test.tsx`

> `/** @vitest-environment jsdom */`
> Requires `installElectronAPI()`.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | loading state shows blank screen | no children visible initially |
| 2 | authenticated → renders children | `await waitFor(() => screen.getByText('child'))` |
| 3 | not authenticated → renders AuthScreen | `await waitFor(() => screen.getByText(/* auth screen text */))` |
| 4 | API error → handles gracefully | no crash |

~4 tests. Mock `auth.getStatus` to resolve `{ authenticated: true/false }`.

### 4C. GenesisGate — `src/renderer/components/genesis/GenesisGate.test.tsx`

> `/** @vitest-environment jsdom */`
> Requires `installElectronAPI()` and `AppStateProvider` wrapper.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | connected agent → renders children | children visible |
| 2 | not connected + showLanding → renders LandingScreen | landing buttons visible |
| 3 | "New Agent" click → shows GenesisFlow | genesis flow UI appears |
| 4 | "Open Existing" click → triggers file dialog | `selectMindDirectory` called |

~4 tests.

### 4D. ViewRouter — `src/renderer/components/layout/ViewRouter.test.tsx`

> `/** @vitest-environment jsdom */`
> Requires `AppStateProvider` wrapper with controlled state.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | activeView='chat' → renders ChatPanel | ChatPanel content visible |
| 2 | activeView=discovered view id → renders LensViewRenderer | LensViewRenderer rendered |
| 3 | activeView=unknown id → falls back to ChatPanel | ChatPanel as fallback |

~3 tests. May need to mock ChatPanel and LensViewRenderer as simple stubs.

### 4E. useChatStreaming hook — `src/renderer/hooks/useChatStreaming.test.ts`

> `/** @vitest-environment jsdom */`
> Uses `renderHook` from `@testing-library/react` with `AppStateProvider` wrapper.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | sendMessage dispatches ADD_USER_MESSAGE + ADD_ASSISTANT_MESSAGE | check state after call |
| 2 | sendMessage calls electronAPI.chat.send | `chat.send` called with conversationId, content, model |
| 3 | sendMessage no-ops when already streaming | `chat.send` not called |
| 4 | stopStreaming calls electronAPI.chat.stop | `chat.stop` called |
| 5 | isStreaming reflects app state | matches `state.isStreaming` |

~5 tests.

### 4F. useAgentStatus hook — `src/renderer/hooks/useAgentStatus.test.ts`

> `/** @vitest-environment jsdom */`
> Uses `renderHook` with `AppStateProvider` wrapper.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | fetches initial status on mount | `agent.getStatus` called |
| 2 | dispatches SET_AGENT_STATUS with result | state updated |
| 3 | subscribes to onStatusChanged | `agent.onStatusChanged` called |
| 4 | unsubscribes on unmount | cleanup function called |
| 5 | selectMindDirectory triggers dialog + status refresh | `agent.selectMindDirectory` called |

~5 tests.

### Phase 4 success criteria
- 6 new test files, ~29 passing tests
- `renderHook` pattern established for hooks
- `installElectronAPI()` + `AppStateProvider` wrapper pattern validated
- Gate components tested with async auth/status flows
- Total: ~141 tests passing
- `npm run test` green

---

## Phase 5 — ViewDiscovery Service & Polish

### Why last
`ViewDiscovery` has deeper fs dependencies and requires a ChatService mock. It's medium priority and depends on patterns from Phase 2. This phase also covers any remaining gaps and ensures coverage parity.

### 5A. ViewDiscovery — `src/main/services/ViewDiscovery.test.ts`

**Mocks:** `vi.mock('fs')` for `existsSync`, `readdirSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `watch`.
**ChatService mock:** `{ sendPrompt: vi.fn() }` or whatever the interface requires.

| # | Method | Scenario | Assertion |
|---|--------|----------|-----------|
| 1 | `scan` | `.github/lens/` has view dirs with `view.json` | returns parsed manifests with ids |
| 2 | `scan` | no lens dir | returns `[]` |
| 3 | `scan` | empty lens dir | seeds defaults, returns seeded manifests |
| 4 | `scan` | invalid `view.json` | skips bad entries |
| 5 | `getViews` | after scan | returns cached manifests |
| 6 | `getViews` | before scan | returns `[]` |
| 7 | `getViewData` | valid viewId | reads + parses data file |
| 8 | `getViewData` | unknown viewId | returns `null` |
| 9 | `getViewData` | data file missing | returns `null` |
| 10 | `stopWatching` | after startWatching | closes watcher |

~10 tests.

### 5B. Gap sweep

Review coverage report (`npm run test:coverage`) and add tests for any critical gaps discovered. Likely candidates:

- **`getPlainContent` edge cases** — add to existing `store.test.ts` if any new edge cases surfaced
- **`AppStateProvider` integration** — verify context provides state and dispatch correctly (1-2 tests in `store.reducer.test.ts`)

### Phase 5 success criteria
- 1-2 new test files, ~12 passing tests
- ViewDiscovery core logic covered
- Total: ~153+ tests passing
- `npm run test` and `npm run test:coverage` green
- Coverage report shows meaningful improvement over baseline

---

## Summary

| Phase | Focus | New Tests | New Files | Source Changes |
|-------|-------|-----------|-----------|----------------|
| 1 | Test infra + store reducer | ~41 | 3 | Export `handleChatEvent`, `appReducer`, `initialState`, types from `store.tsx` |
| 2 | Main process pure functions | ~34 | 4 | Export 3 helpers from `AuthService.ts` |
| 3 | Presentational components | ~61 | 12 | Optionally export `getStatusVariant`/`getStatusDot` from `LensStatusBoard.tsx` |
| 4 | Interactive + gates + hooks | ~29 | 6 | None |
| 5 | ViewDiscovery + polish | ~12 | 1-2 | None |
| **Total** | | **~177** | **~27** | **3 files touched** |

### Execution notes

- Each phase is independently committable and independently valuable.
- Run `npm run test` after each phase to confirm no regressions.
- The implementer should read the specific source file before writing each test to catch any discrepancies with this plan (functions may have been renamed or refactored since the research was done).
- Mock `react-markdown` and `remark-gfm` in any test that renders markdown content — jsdom doesn't handle them cleanly.
- All renderer test files need `/** @vitest-environment jsdom */` as the first line.
- Use `@/` path alias in imports (configured in vitest config).
