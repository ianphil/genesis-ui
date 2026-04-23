import { ipcMain, BrowserWindow } from 'electron';
import type { EventEmitter } from 'events';
import type { AgentCardRegistry } from '../services/a2a/AgentCardRegistry';
import type { TaskManager } from '../services/a2a/TaskManager';
import type { TaskStatusUpdateEvent, TaskArtifactUpdateEvent, TaskState } from '../services/a2a/types';

const VALID_TASK_STATES: ReadonlySet<TaskState> = new Set([
  'submitted',
  'working',
  'completed',
  'failed',
  'canceled',
  'input-required',
  'rejected',
  'auth-required',
]);

function narrowTaskState(value: unknown): TaskState | undefined {
  return typeof value === 'string' && VALID_TASK_STATES.has(value as TaskState)
    ? (value as TaskState)
    : undefined;
}

export function setupA2AIPC(
  ipcEmitter: EventEmitter,
  agentCardRegistry: AgentCardRegistry,
  taskManager: TaskManager,
): void {
  // Forward a2a:incoming events to all renderer windows
  ipcEmitter.on('a2a:incoming', (payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('a2a:incoming', payload);
    }
  });

  // Forward A2A chat events (streaming from target agent) to all renderer windows
  ipcEmitter.on('a2a:chat-event', (payload: { mindId: string; messageId: string; event: unknown }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('chat:event', payload.mindId, payload.messageId, payload.event);
    }
  });

  // Forward task events to all renderer windows
  ipcEmitter.on('task:status-update', (payload: TaskStatusUpdateEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('a2a:task-status-update', payload);
    }
  });

  ipcEmitter.on('task:artifact-update', (payload: TaskArtifactUpdateEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('a2a:task-artifact-update', payload);
    }
  });

  ipcMain.handle('a2a:listAgents', async () => {
    return agentCardRegistry.getCards();
  });

  // Task query handlers
  ipcMain.handle('a2a:getTask', async (_, taskId: string, historyLength?: number) => {
    return taskManager.getTask(taskId, historyLength);
  });

  ipcMain.handle('a2a:listTasks', async (_, filter?: { contextId?: string; status?: string }) => {
    return taskManager.listTasks(
      filter ? { contextId: filter.contextId, status: narrowTaskState(filter.status) } : undefined,
    );
  });

  ipcMain.handle('a2a:cancelTask', async (_, taskId: string) => {
    return taskManager.cancelTask(taskId);
  });
}
