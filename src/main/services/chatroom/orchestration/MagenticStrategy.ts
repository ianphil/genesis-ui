import { randomUUID } from 'node:crypto';
import type { MindContext } from '../../../../shared/types';
import type {
  MagenticConfig,
  TaskLedgerItem,
} from '../../../../shared/chatroom-types';
import type { OrchestrationContext } from './types';
import { BaseStrategy } from './types';
import { ObservabilityEmitter } from './observability';
import { textContent, extractJsonObject } from './shared';
import { sendToAgentWithRetry } from './stream-agent';

/** Max characters stored in task.result (safe summary only) */
const MAX_RESULT_LENGTH = 500;

/** Mark a task as failed and emit observability event */
function failTask(
  task: TaskLedgerItem,
  err: unknown,
  obs: ObservabilityEmitter,
  extra: Record<string, unknown>,
): void {
  task.status = 'failed';
  task.result = String(err);
  obs.failure(task.result, extra);
}

/** Format manager's JSON response into human-readable text for display */
function formatManagerResponse(raw: string): string {
  const json = extractJsonObject(raw);
  if (!json) return raw;

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const action = parsed.action as string;

    if (action === 'update-plan' && Array.isArray(parsed.plan)) {
      const tasks = parsed.plan as Array<{ id: string; description: string }>;
      const lines = ['**Planning:** Breaking this into tasks:\n'];
      for (const t of tasks) {
        lines.push(`${t.id}. ${t.description}`);
      }
      return lines.join('\n');
    }

    if (action === 'assign') {
      const assignments = Array.isArray(parsed.assignments)
        ? (parsed.assignments as Array<{ assignee: string; task_description?: string }>)
        : parsed.assignee
          ? [{ assignee: parsed.assignee as string, task_description: parsed.task_description as string | undefined }]
          : [];
      if (assignments.length === 0) return raw;
      const lines = ['**Assigning tasks:**\n'];
      for (const a of assignments) {
        lines.push(`- **${a.assignee}**: ${a.task_description ?? 'assigned task'}`);
      }
      return lines.join('\n');
    }

    if (action === 'complete') {
      return `**Summary:** ${(parsed.summary as string) ?? 'All tasks completed.'}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Manager response parsing
// ---------------------------------------------------------------------------

interface ManagerDecision {
  action: 'assign' | 'complete' | 'update-plan';
  assignments?: Array<{ assignee: string; taskId?: string; taskDescription?: string }>;
  assignee?: string;
  taskDescription?: string;
  taskId?: string;
  planUpdate?: Array<{ id: string; description: string }>;
  summary?: string;
}

function parseManagerResponse(text: string): ManagerDecision | null {
  const json = extractJsonObject(text);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const action = (['assign', 'complete', 'update-plan'] as const).includes(
      parsed.action as 'assign' | 'complete' | 'update-plan',
    )
      ? (parsed.action as 'assign' | 'complete' | 'update-plan')
      : 'assign';
    return {
      action,
      assignments: Array.isArray(parsed.assignments)
        ? (parsed.assignments as Array<{ assignee: string; taskId?: string; taskDescription?: string }>)
        : undefined,
      assignee: typeof parsed.assignee === 'string' ? parsed.assignee : undefined,
      taskDescription: typeof parsed.task_description === 'string' ? parsed.task_description : undefined,
      taskId: typeof parsed.task_id === 'string' ? parsed.task_id : undefined,
      planUpdate: Array.isArray(parsed.plan)
        ? (parsed.plan as Array<{ id: string; description: string }>)
        : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MagenticStrategy — manager-driven dynamic collaboration with task ledger
// ---------------------------------------------------------------------------

/**
 * Magentic-One inspired orchestration:
 * - A manager agent maintains a shared task ledger (plan with status)
 * - Manager selects agents from a known allowlist
 * - Step budget + termination criteria enforced
 * - Each agent is a full Copilot SDK session with complete tool access
 *
 * v2 improvements:
 * - Clean worker prompts (natural language, not XML directives)
 * - Parallel task execution via A2A when multiple tasks are assigned
 * - Control JSON stripped from history to prevent prompt injection warnings
 */
export class MagenticStrategy extends BaseStrategy {
  readonly mode = 'magentic' as const;
  private readonly config: MagenticConfig;

  constructor(config: MagenticConfig) {
    super();
    this.config = config;
  }

  async execute(
    userMessage: string,
    participants: MindContext[],
    roundId: string,
    context: OrchestrationContext,
  ): Promise<void> {
    if (participants.length === 0) return;

    this.begin();

    const obs = new ObservabilityEmitter('magentic');
    obs.start({ participantCount: participants.length, maxSteps: this.config.maxSteps });

    // Resolve manager
    const manager = participants.find((p) => p.mindId === this.config.managerMindId);
    if (!manager) {
      console.error('[Chatroom:Magentic] Manager mind not found among participants');
      obs.failure('Manager mind not found');
      obs.end({ terminationReason: 'ERROR' });
      return;
    }

    // Build allowlist
    const allowedIds = new Set(
      this.config.allowedMindIds ?? participants.map((p) => p.mindId),
    );
    const workers = participants.filter(
      (p) => p.mindId !== this.config.managerMindId && allowedIds.has(p.mindId),
    );

    if (workers.length === 0) {
      obs.failure('No workers available');
      obs.end({ terminationReason: 'ERROR' });
      return;
    }

    // Task ledger
    const ledger: TaskLedgerItem[] = [];
    let step = 0;

    // ── Phase 1: Manager creates initial plan ──

    const planPrompt = this.buildPlanPrompt(userMessage, workers);

    context.emitEvent({
      mindId: manager.mindId,
      mindName: manager.identity.name,
      messageId: '',
      roundId,
      event: {
        type: 'orchestration:manager-plan',
        data: { phase: 'initial-planning' },
      },
    });

    let planRawContent: string;
    try {
      ({ rawContent: planRawContent } = await sendToAgentWithRetry({
        mind: manager,
        prompt: planPrompt,
        roundId,
        context,
        abortSignal: this.abortController!.signal,
        unsubs: this.currentUnsubs,
        orchestrationMode: 'magentic',
        silent: true,
      }));
    } catch (err) {
      obs.failure(`Planning failed: ${err instanceof Error ? err.message : String(err)}`);
      obs.end({ terminationReason: 'ERROR' });
      return;
    }
    const planDecision = parseManagerResponse(planRawContent);

    // Populate ledger from plan
    if (planDecision?.planUpdate) {
      for (const item of planDecision.planUpdate) {
        ledger.push({
          id: item.id || randomUUID().slice(0, 8),
          description: item.description,
          status: 'pending',
        });
      }
    } else {
      // Fallback: single task
      ledger.push({
        id: randomUUID().slice(0, 8),
        description: userMessage,
        status: 'pending',
      });
    }

    this.emitLedgerUpdate(manager, roundId, ledger, context);

    // Emit a formatted plan message so the user sees what the manager decided
    const planSummary = formatManagerResponse(planRawContent);
    if (planSummary !== planRawContent) {
      context.persistMessage({
        id: randomUUID(),
        role: 'assistant',
        blocks: [{ type: 'text', content: planSummary }],
        timestamp: Date.now(),
        sender: { mindId: manager.mindId, name: manager.identity.name },
        roundId,
        orchestrationMode: 'magentic',
      });
      context.emitEvent({
        mindId: manager.mindId,
        mindName: manager.identity.name,
        messageId: '',
        roundId,
        event: { type: 'done' },
      });
    }

    // ── Phase 2: Manager-driven execution loop ──

    for (step = 0; step < this.config.maxSteps; step++) {
      if (this.isAborted) break;

      // Check if all tasks are completed
      const allDone = ledger.every(
        (t) => t.status === 'completed' || t.status === 'failed',
      );
      if (allDone) {
        obs.terminationReason('ALL_TASKS_COMPLETE', { step });
        break;
      }

      // Ask manager to assign next task
      const assignPrompt = this.buildAssignPrompt(userMessage, workers, ledger);

      let assignRawContent: string;
      try {
        ({ rawContent: assignRawContent } = await sendToAgentWithRetry({
          mind: manager,
          prompt: assignPrompt,
          roundId,
          context,
          abortSignal: this.abortController!.signal,
          unsubs: this.currentUnsubs,
          orchestrationMode: 'magentic',
          silent: true,
        }));
      } catch (err) {
        obs.failure(`Assignment failed: ${err instanceof Error ? err.message : String(err)}`, { step });
        break;
      }
      const assignDecision = parseManagerResponse(assignRawContent);

      if (!assignDecision) {
        // Manager didn't produce a valid decision — treat as complete
        obs.terminationReason('MANAGER_NO_DECISION', { step });
        break;
      }

      if (assignDecision.action === 'complete') {
        obs.terminationReason('MANAGER_COMPLETE', { step, summary: assignDecision.summary });

        // Emit synthesis
        context.emitEvent({
          mindId: manager.mindId,
          mindName: manager.identity.name,
          messageId: '',
          roundId,
          event: {
            type: 'orchestration:synthesis',
            data: { synthesizer: manager.identity.name, summary: assignDecision.summary },
          },
        });
        break;
      }

      if (assignDecision.action === 'assign') {
        // Normalize to assignments array (support both single and batch)
        const assignments = assignDecision.assignments
          ?? (assignDecision.assignee
            ? [{ assignee: assignDecision.assignee, taskId: assignDecision.taskId, taskDescription: assignDecision.taskDescription }]
            : []);

        if (assignments.length === 0) {
          obs.failure('Manager assigned with no assignee', { step });
          continue;
        }

        // Resolve workers and tasks for each assignment
        const resolved: Array<{ worker: MindContext; task: TaskLedgerItem }> = [];
        for (const a of assignments) {
          const worker = workers.find(
            (w) => w.identity.name.toLowerCase() === a.assignee.toLowerCase(),
          );
          if (!worker) {
            obs.failure(`Manager selected unknown agent: ${a.assignee}`, { step });
            continue;
          }

          let task = a.taskId
            ? ledger.find((t) => t.id === a.taskId)
            : ledger.find((t) => t.status === 'pending');

          if (!task) {
            task = {
              id: a.taskId || randomUUID().slice(0, 8),
              description: a.taskDescription || 'Task assigned by manager',
              status: 'pending',
            };
            ledger.push(task);
          }

          task.status = 'in-progress';
          task.assignee = worker.mindId;
          resolved.push({ worker, task });
        }

        this.emitLedgerUpdate(manager, roundId, ledger, context);

        // Emit formatted assignment message
        const assignSummary = formatManagerResponse(assignRawContent);
        if (assignSummary !== assignRawContent) {
          context.persistMessage({
            id: randomUUID(),
            role: 'assistant',
            blocks: [{ type: 'text', content: assignSummary }],
            timestamp: Date.now(),
            sender: { mindId: manager.mindId, name: manager.identity.name },
            roundId,
            orchestrationMode: 'magentic',
          });
          context.emitEvent({
            mindId: manager.mindId,
            mindName: manager.identity.name,
            messageId: '',
            roundId,
            event: { type: 'done' },
          });
        }

        // Execute: parallel via A2A if available + multiple tasks, else sequential.
        // If parallel dispatch fails for all tasks (e.g. minds lack AgentCard
        // entries), reset and fall back to sequential transparently.
        const canTryA2A = resolved.length > 1
          && typeof context.dispatchTask === 'function'
          && typeof context.pollTask === 'function';

        let usedParallel = false;
        if (canTryA2A) {
          const anyDispatched = await this.executeParallel(resolved, roundId, context, obs, step);
          if (anyDispatched) {
            usedParallel = true;
          } else {
            // All dispatches failed — reset tasks to in-progress for sequential retry
            for (const { task } of resolved) {
              if (task.status === 'failed') {
                task.status = 'in-progress';
                task.result = undefined;
              }
            }
          }
        }

        if (!usedParallel) {
          await this.executeSequential(resolved, userMessage, participants, ledger, roundId, context, obs, step);
        }

        this.emitLedgerUpdate(manager, roundId, ledger, context);
      }
    }

    // Step budget exhausted
    if (step >= this.config.maxSteps) {
      obs.terminationReason('STEP_BUDGET_EXHAUSTED', { maxSteps: this.config.maxSteps });

      context.emitEvent({
        mindId: manager.mindId,
        mindName: manager.identity.name,
        messageId: '',
        roundId,
        event: {
          type: 'orchestration:magentic-terminated',
          data: { reason: 'STEP_BUDGET_EXHAUSTED', maxSteps: this.config.maxSteps },
        },
      });
    }

    obs.end({ totalSteps: step, ledgerSize: ledger.length });
  }

  // -------------------------------------------------------------------------
  // Task ledger emission (non-sensitive)
  // -------------------------------------------------------------------------

  private emitLedgerUpdate(
    manager: MindContext,
    roundId: string,
    ledger: TaskLedgerItem[],
    context: OrchestrationContext,
  ): void {
    // Persist a safe view of the ledger — no chain-of-thought, only metadata
    const safeLedger = ledger.map((t) => {
      let desc = t.description;
      if (desc.length > 80) {
        const cut = desc.lastIndexOf(' ', 80);
        desc = desc.slice(0, cut > 20 ? cut : 80) + '…';
      }
      return { id: t.id, description: desc, status: t.status, assignee: t.assignee };
    });

    context.emitEvent({
      mindId: manager.mindId,
      mindName: manager.identity.name,
      messageId: '',
      roundId,
      event: {
        type: 'orchestration:task-ledger-update',
        data: { ledger: safeLedger },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Task execution — parallel (A2A) and sequential (fallback)
  // -------------------------------------------------------------------------

  /** Returns true if at least one task was dispatched successfully */
  private async executeParallel(
    resolved: Array<{ worker: MindContext; task: TaskLedgerItem }>,
    roundId: string,
    context: OrchestrationContext,
    obs: ObservabilityEmitter,
    step: number,
  ): Promise<boolean> {
    const contextId = `magentic-${roundId}`;
    const POLL_INTERVAL_MS = 2_000;
    const POLL_TIMEOUT_MS = 300_000;

    // Dispatch all tasks concurrently via A2A
    const dispatched = await Promise.all(
      resolved.map(async ({ worker, task }) => {
        if (this.isAborted) {
          return { worker, task, a2aTaskId: null as string | null };
        }

        this.emitTurnStart(worker, roundId, context, step, true);
        obs.agentStep(worker.mindId, { step, taskId: task.id, parallel: true });

        try {
          const a2aTask = await context.dispatchTask!(worker.mindId, task.description, contextId);
          return { worker, task, a2aTaskId: a2aTask.id };
        } catch (err) {
          failTask(task, err, obs, { step, mindId: worker.mindId, taskId: task.id });
          return { worker, task, a2aTaskId: null as string | null };
        }
      }),
    );

    // Poll for completion
    const pending = dispatched.filter((d) => d.a2aTaskId !== null);
    const startTime = Date.now();

    while (pending.length > 0 && !this.isAborted) {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        for (const d of pending) {
          d.task.status = 'failed';
          d.task.result = 'Timed out waiting for A2A task completion';
        }
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      for (let i = pending.length - 1; i >= 0; i--) {
        const d = pending[i];
        try {
          const polled = await context.pollTask!(d.a2aTaskId!);
          if (!polled) continue;

          if (polled.status.state === 'completed') {
            const resultText = polled.artifacts?.[0]?.parts?.find((p) => p.text)?.text ?? '';
            d.task.status = 'completed';
            d.task.result = resultText.slice(0, MAX_RESULT_LENGTH);
            pending.splice(i, 1);
          } else if (polled.status.state === 'failed' || polled.status.state === 'canceled') {
            d.task.status = 'failed';
            d.task.result = polled.status.message?.parts?.[0]?.text ?? polled.status.state;
            obs.failure(d.task.result, { step, mindId: d.worker.mindId, taskId: d.task.id });
            pending.splice(i, 1);
          }
        } catch {
          // Poll error — will retry next cycle
        }
      }
    }

    // Return true if any task was dispatched (even if some failed)
    return dispatched.some((d) => d.a2aTaskId !== null);
  }

  private async executeSequential(
    resolved: Array<{ worker: MindContext; task: TaskLedgerItem }>,
    userMessage: string,
    participants: MindContext[],
    ledger: TaskLedgerItem[],
    roundId: string,
    context: OrchestrationContext,
    obs: ObservabilityEmitter,
    step: number,
  ): Promise<void> {
    for (const { worker, task } of resolved) {
      if (this.isAborted) break;

      this.emitTurnStart(worker, roundId, context, step, false);
      obs.agentStep(worker.mindId, { step, taskId: task.id });

      const workerPrompt = this.buildWorkerPrompt(userMessage, participants, task, ledger, context, worker);

      try {
        const { message: workerResponse } = await sendToAgentWithRetry({
          mind: worker,
          prompt: workerPrompt,
          roundId,
          context,
          abortSignal: this.abortController!.signal,
          unsubs: this.currentUnsubs,
          orchestrationMode: 'magentic',
        });
        const workerText = workerResponse ? textContent(workerResponse) : '';
        task.status = 'completed';
        task.result = workerText.slice(0, MAX_RESULT_LENGTH);
      } catch (err) {
        failTask(task, err, obs, { step, mindId: worker.mindId, taskId: task.id });
      }
    }
  }

  private emitTurnStart(
    worker: MindContext, roundId: string, context: OrchestrationContext,
    step: number, parallel: boolean,
  ): void {
    context.emitEvent({
      mindId: worker.mindId,
      mindName: worker.identity.name,
      messageId: '',
      roundId,
      event: {
        type: 'orchestration:turn-start',
        data: { speaker: worker.identity.name, speakerMindId: worker.mindId, step, ...(parallel ? { parallel: true } : {}) },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Prompt building
  // -------------------------------------------------------------------------

  private buildPlanPrompt(userMessage: string, workers: MindContext[]): string {
    const workerList = workers.map((w) => `  - ${w.identity.name}`).join('\n');

    // This prompt must be strong enough to override the agent's natural helpfulness.
    // The agent has tools and will try to answer directly — we must prevent that.
    return [
      `You are acting as a COORDINATOR in a multi-agent system. You do NOT answer questions yourself.`,
      `Your ONLY job is to break the user's request into tasks and output a JSON plan.`,
      ``,
      `DO NOT use any tools. DO NOT answer the question. DO NOT provide analysis.`,
      `DO NOT write files, search, or run commands. ONLY output the JSON below.`,
      ``,
      `User request: ${userMessage}`,
      ``,
      `Available agents who will do the actual work:`,
      workerList,
      ``,
      `Break the request into 2-5 concrete tasks. Each task should be a self-contained unit of work`,
      `that one agent can complete independently.`,
      ``,
      `Output ONLY this JSON, nothing else:`,
      `{"action": "update-plan", "plan": [{"id": "1", "description": "first task"}, {"id": "2", "description": "second task"}]}`,
      ``,
      `Example for "Compare Redis vs Memcached and write a recommendation":`,
      `{"action": "update-plan", "plan": [{"id": "1", "description": "Research Redis features, performance, and use cases"}, {"id": "2", "description": "Research Memcached features, performance, and use cases"}, {"id": "3", "description": "Write a comparison and recommendation based on the research"}]}`,
    ].join('\n');
  }

  private buildAssignPrompt(
    userMessage: string,
    workers: MindContext[],
    ledger: TaskLedgerItem[],
  ): string {
    const workerList = workers.map((w) => `  - ${w.identity.name}`).join('\n');
    const ledgerLines = ledger.map(
      (t) => `  [${t.id}] ${t.status}${t.assignee ? ` (${t.assignee})` : ''}: ${t.description}${t.result ? ` -> ${t.result.slice(0, 80)}` : ''}`,
    ).join('\n');

    return [
      `You are acting as a COORDINATOR. You do NOT answer questions or use tools.`,
      `Your ONLY job is to assign the next task(s) or declare completion.`,
      ``,
      `DO NOT use any tools. DO NOT answer the question. ONLY output JSON.`,
      ``,
      `User request: ${userMessage}`,
      ``,
      `Available agents:`,
      workerList,
      ``,
      `Task ledger:`,
      ledgerLines,
      ``,
      `If there are pending tasks, assign them. If all tasks are completed/failed, provide a summary.`,
      `You may assign multiple independent tasks at once for parallel execution.`,
      ``,
      `Output ONLY one of these JSON formats:`,
      ``,
      `To assign: {"action": "assign", "assignments": [{"assignee": "agent name", "task_id": "1", "task_description": "what to do"}]}`,
      `To complete: {"action": "complete", "summary": "brief summary of all results"}`,
    ].join('\n');
  }

  private buildWorkerPrompt(
    userMessage: string,
    participants: MindContext[],
    task: TaskLedgerItem,
    ledger: TaskLedgerItem[],
    context: OrchestrationContext,
    forMind?: MindContext,
  ): string {
    const basePrompt = context.buildBasePrompt(userMessage, participants, forMind);

    // Natural language context — no XML directives that trigger injection warnings
    const completedTasks = ledger.filter((t) => t.status === 'completed' && t.result);
    const parts: string[] = [];

    if (completedTasks.length > 0) {
      parts.push('Other team members have completed these related tasks:');
      for (const t of completedTasks) {
        parts.push(`- ${t.description}: ${t.result!.slice(0, 200)}`);
      }
      parts.push('');
    }

    parts.push(`Your task: ${task.description}`);
    parts.push('');

    return parts.join('\n') + basePrompt;
  }
}
