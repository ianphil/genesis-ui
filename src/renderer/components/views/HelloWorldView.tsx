import React from 'react';
import { useAppState } from '../../lib/store';
import { Zap } from 'lucide-react';

export function HelloWorldView() {
  const { agentStatus, availableModels, selectedModel } = useAppState();
  const modelName = availableModels.find(m => m.id === selectedModel)?.name ?? 'None';

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Zap size={20} className="text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Lens — Hello World</h2>
            <p className="text-sm text-muted-foreground">View framework is working</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <Row label="Status" value={agentStatus.connected ? '🟢 Mind loaded' : '🔴 No mind selected'} />
          <Row label="Mind" value={agentStatus.mindPath?.split(/[\\/]/).pop() ?? 'None'} />
          <Row label="Model" value={modelName} />
          <Row label="Extensions" value={agentStatus.extensions.length > 0 ? agentStatus.extensions.join(', ') : 'None'} />
          <Row label="Active View" value="hello" />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          This is a placeholder view. Lens Phase 1 is complete — the activity bar and view routing work.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate ml-4 text-right">{value}</span>
    </div>
  );
}
