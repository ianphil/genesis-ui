import { ChamberClient } from '@chamber/client';
import type { ElectronAPI, LensViewManifest, MindContext, ModelInfo } from './shared/types';
import type { AgentCard, ListTasksResponse, Task } from './shared/a2a-types';
import type { ChatroomAPI, ChatroomMessage, TaskLedgerItem } from './shared/chatroom-types';

const noopUnsubscribe = () => undefined;
const emptyList = async <T>(): Promise<T[]> => [];

function createClient(): ChamberClient {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  return new ChamberClient({ baseUrl: window.location.origin, token, origin: window.location.origin });
}

function createBrowserChatroomApi(): ChatroomAPI {
  return {
    send: async () => undefined,
    history: async (): Promise<ChatroomMessage[]> => [],
    taskLedger: async (): Promise<TaskLedgerItem[]> => [],
    clear: async () => undefined,
    stop: async () => undefined,
    setOrchestration: async () => undefined,
    getOrchestration: async () => ({ mode: 'concurrent', config: null }),
    onEvent: () => noopUnsubscribe,
  };
}

export function installBrowserApi(): void {
  if (window.electronAPI) return;

  const client = createClient();
  const api: ElectronAPI = {
    chat: {
      send: async () => undefined,
      stop: async (_mindId, messageId) => {
        await client.cancelChat(messageId);
      },
      newConversation: async () => undefined,
      listModels: async (): Promise<ModelInfo[]> => [],
      onEvent: () => noopUnsubscribe,
    },
    mind: {
      add: async (mindPath): Promise<MindContext> => {
        throw new Error(`Adding minds is desktop-only in browser mode: ${mindPath}`);
      },
      remove: async () => undefined,
      list: () => client.listMinds() as Promise<MindContext[]>,
      setActive: async () => undefined,
      selectDirectory: async () => null,
      openWindow: async (mindId) => {
        window.open(`/?mindId=${encodeURIComponent(mindId)}`, '_blank', 'noopener,noreferrer');
      },
      onMindChanged: () => noopUnsubscribe,
    },
    lens: {
      getViews: async (): Promise<LensViewManifest[]> => [],
      getViewData: async () => null,
      refreshView: async () => null,
      sendAction: async () => null,
      onViewsChanged: () => noopUnsubscribe,
    },
    auth: {
      getStatus: async () => ({ authenticated: false }),
      listAccounts: emptyList,
      startLogin: async () => ({ success: false }),
      switchAccount: async () => undefined,
      logout: async () => undefined,
      onProgress: () => noopUnsubscribe,
      onAccountSwitchStarted: () => noopUnsubscribe,
      onAccountSwitched: () => noopUnsubscribe,
      onLoggedOut: () => noopUnsubscribe,
    },
    genesis: {
      getDefaultPath: async () => '',
      pickPath: async () => null,
      create: async () => ({ success: false, error: 'Genesis setup is desktop-only in browser mode.' }),
      onProgress: () => noopUnsubscribe,
    },
    chatroom: createBrowserChatroomApi(),
    a2a: {
      onIncoming: () => noopUnsubscribe,
      listAgents: async (): Promise<AgentCard[]> => [],
      onTaskStatusUpdate: () => noopUnsubscribe,
      onTaskArtifactUpdate: () => noopUnsubscribe,
      getTask: async (): Promise<Task | null> => null,
      listTasks: async (): Promise<ListTasksResponse> => ({ tasks: [], nextPageToken: '', pageSize: 0, totalSize: 0 }),
      cancelTask: async (taskId) => ({ error: `Task cancellation is unavailable in browser mode: ${taskId}` }),
    },
    window: {
      minimize: () => undefined,
      maximize: () => undefined,
      close: () => window.close(),
    },
  };
  window.electronAPI = api;
  if (!window.desktop) {
    window.desktop = {
      pickFolder: api.mind.selectDirectory,
      openMindWindow: api.mind.openWindow,
    };
  }
}
