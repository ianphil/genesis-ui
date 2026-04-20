import React from 'react';
import type { TaskLedgerItem } from '../../../shared/chatroom-types';

interface TaskLedgerPanelProps {
  ledger: TaskLedgerItem[];
  minds: Array<{ mindId: string; identity: { name: string } }>;
}

const STATUS_ICONS: Record<string, string> = {
  'pending': '○',
  'in-progress': '◉',
  'completed': '✓',
  'failed': '✗',
};

const STATUS_COLORS: Record<string, string> = {
  'pending': 'text-zinc-500',
  'in-progress': 'text-blue-400',
  'completed': 'text-green-400',
  'failed': 'text-red-400',
};

export function TaskLedgerPanel({ ledger, minds }: TaskLedgerPanelProps) {
  if (ledger.length === 0) return null;

  const resolveName = (mindId?: string): string => {
    if (!mindId) return 'Unassigned';
    return minds.find((m) => m.mindId === mindId)?.identity.name ?? mindId;
  };

  return (
    <div className="border border-zinc-800 rounded-md p-3 mb-3 bg-zinc-900/50 overflow-hidden">
      <div className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
        Task Ledger
      </div>
      <div className="space-y-1.5">
        {ledger.map((task) => (
          <div key={task.id} className="flex items-start gap-2 text-sm">
            <span className={`${STATUS_COLORS[task.status] ?? 'text-zinc-500'} font-mono text-xs mt-0.5 shrink-0`}>
              {STATUS_ICONS[task.status] ?? '?'}
            </span>
            <div className="flex-1 min-w-0 overflow-hidden">
              <span className="text-zinc-200 block overflow-hidden text-ellipsis whitespace-nowrap" title={task.description}>
                {task.description}
              </span>
              {task.assignee && (
                <span className="text-zinc-500 text-xs">
                  {resolveName(task.assignee)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
