import { EventEmitter } from 'events';
import type { AgentCardRegistry } from './AgentCardRegistry';
import type { MindManager } from '../mind/MindManager';
import type { CopilotSession } from '../mind/types';
import type {
  SendMessageRequest,
  Task,
  TaskState,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  ListTasksResponse,
  Message,
} from './types';
import {
  generateTaskId,
  generateContextId,
  createTaskStatus,
  createArtifact,
  createTextMessage,
  serializeMessageToXml,
  generateMessageId,
} from './helpers';

const TERMINAL_STATES: Set<TaskState> = new Set(['completed', 'failed', 'canceled', 'rejected']);

export class TaskManager extends EventEmitter {
  private tasks = new Map<string, Task>();
  private sessions = new Map<string, CopilotSession>();
  private pendingInputs = new Map<string, (answer: { answer: string; wasFreeform: boolean }) => void>();

  constructor(
    private readonly mindManager: MindManager,
    private readonly agentCardRegistry: AgentCardRegistry,
  ) {
    super();
  }

  async sendTask(request: SendMessageRequest): Promise<Task> {
    // 1. Resolve recipient
    const card =
      this.agentCardRegistry.getCard(request.recipient) ??
      this.agentCardRegistry.getCardByName(request.recipient);
    if (!card?.mindId) {
      throw new Error(`Unknown recipient: ${request.recipient}`);
    }
    const targetMindId = card.mindId;

    // 2-3. Generate ids
    const taskId = generateTaskId();
    const contextId = request.message.contextId || generateContextId();

    // 4. Create task
    const task: Task = {
      id: taskId,
      contextId,
      status: createTaskStatus('submitted'),
      artifacts: [],
      history: [{ ...request.message, contextId, taskId }],
    };

    // 5. Store
    this.tasks.set(taskId, task);

    // 6. Emit submitted
    this.emitStatusUpdate(task);

    // 7. Snapshot the submitted state before async processing mutates it
    const snapshot: Task = {
      ...task,
      status: { ...task.status },
      history: task.history ? [...task.history] : [],
      artifacts: task.artifacts ? [...task.artifacts] : [],
    };

    // 8. Async processing (fire-and-forget, deferred so caller gets submitted state)
    Promise.resolve().then(() =>
      this.processTask(task, targetMindId, request.message)
        .catch((err) => {
          this.transitionState(task, 'failed');
          console.error(`[TaskManager] Task ${taskId} failed:`, err);
        }),
    );

    // 9. Return snapshot at submitted state
    return snapshot;
  }

  getTask(id: string, historyLength?: number): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    if (historyLength === undefined) return task;

    return {
      ...task,
      history: historyLength === 0 ? [] : (task.history ?? []).slice(-historyLength),
    };
  }

  listTasks(filter?: { contextId?: string; status?: TaskState }): ListTasksResponse {
    let tasks = [...this.tasks.values()];

    if (filter?.contextId) {
      tasks = tasks.filter((t) => t.contextId === filter.contextId);
    }
    if (filter?.status) {
      tasks = tasks.filter((t) => t.status.state === filter.status);
    }

    return {
      tasks,
      nextPageToken: '',
      pageSize: tasks.length,
      totalSize: tasks.length,
    };
  }

  cancelTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (TERMINAL_STATES.has(task.status.state)) {
      throw new Error(`Cannot cancel task in terminal state: ${task.status.state}`);
    }

    this.transitionState(task, 'canceled');

    // Abort session if exists
    const session = this.sessions.get(id);
    if (session) {
      (session as any).abort?.().catch(() => {});
      this.sessions.delete(id);
    }

    return task;
  }

  resumeTask(id: string, message: Message): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (task.status.state !== 'input-required') {
      throw new Error(`Task ${id} is not in input-required state (current: ${task.status.state})`);
    }

    const resolver = this.pendingInputs.get(id);
    if (!resolver) throw new Error(`No pending input request for task ${id}`);

    // Transition back to working
    task.status = createTaskStatus('working');
    task.history = [...(task.history ?? []), message];
    this.emitStatusUpdate(task);

    // Resolve the pending callback with the user's answer
    const answerText = message.parts.find(p => p.text)?.text ?? '';
    resolver({ answer: answerText, wasFreeform: true });
    this.pendingInputs.delete(id);

    return { ...task };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async processTask(task: Task, targetMindId: string, message: Message): Promise<void> {
    // a. Transition to working
    this.transitionState(task, 'working');

    // b. Create isolated session with input-required callback
    const onUserInputRequest = async (prompt: string): Promise<{ answer: string; wasFreeform: boolean }> => {
      const statusMessage = createTextMessage(targetMindId, prompt, { contextId: task.contextId });
      task.status = createTaskStatus('input-required', statusMessage);
      task.history = [...(task.history ?? []), statusMessage];
      this.emitStatusUpdate(task);

      return new Promise((resolve) => {
        this.pendingInputs.set(task.id, resolve);
      });
    };

    const session = await this.mindManager.createTaskSession(targetMindId, task.id, onUserInputRequest);
    this.sessions.set(task.id, session);

    // c. Serialize message
    const deliveryMessage: Message = { ...message, contextId: task.contextId, taskId: task.id };
    const xmlPrompt = serializeMessageToXml(deliveryMessage);

    // d. Collect response text
    let responseText = '';

    session.on('assistant.message', (event: any) => {
      const content = event?.data?.content ?? '';
      if (content) {
        responseText = content;
        // Add to history
        task.history = task.history ?? [];
        task.history.push({
          messageId: generateMessageId(),
          role: 'agent',
          parts: [{ text: content, mediaType: 'text/plain' }],
          contextId: task.contextId,
          taskId: task.id,
        });
      }
    });

    session.on('session.idle', () => {
      if (TERMINAL_STATES.has(task.status.state)) return;

      // Create artifact
      if (responseText) {
        const artifact = createArtifact('response', responseText);
        task.artifacts = task.artifacts ?? [];
        task.artifacts.push(artifact);

        const artifactEvent: TaskArtifactUpdateEvent = {
          taskId: task.id,
          contextId: task.contextId,
          artifact,
          lastChunk: true,
        };
        this.emit('task:artifact-update', artifactEvent);
      }

      this.transitionState(task, 'completed');
      this.sessions.delete(task.id);
    });

    session.on('session.error', (_event: any) => {
      if (TERMINAL_STATES.has(task.status.state)) return;
      this.transitionState(task, 'failed');
      this.sessions.delete(task.id);
    });

    // e. Send prompt
    await session.send({ prompt: xmlPrompt });
  }

  private transitionState(task: Task, state: TaskState): void {
    task.status = createTaskStatus(state);
    this.emitStatusUpdate(task);
  }

  private emitStatusUpdate(task: Task): void {
    const event: TaskStatusUpdateEvent = {
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
    };
    this.emit('task:status-update', event);
  }
}
