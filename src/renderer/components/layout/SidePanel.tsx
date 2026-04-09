import React from 'react';
import { useAppState, useAppDispatch } from '../../lib/store';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import type { LensView } from '../../lib/store';
import { cn } from '../../lib/utils';

function ChatSideContent() {
  const { conversationId } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="px-3 py-3 space-y-1">
      <button
        onClick={async () => {
          await window.electronAPI.chat.newConversation(conversationId);
          dispatch({ type: 'NEW_CONVERSATION' });
        }}
        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2"
      >
        <span className="text-muted-foreground">+</span>
        New conversation
      </button>
    </div>
  );
}

function HelloSideContent() {
  const { agentStatus, availableModels, selectedModel } = useAppState();

  return (
    <div className="px-3 py-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Mind Path</p>
        <p className="text-xs truncate" title={agentStatus.mindPath ?? ''}>
          {agentStatus.mindPath?.split(/[\\/]/).pop() ?? 'None'}
        </p>
      </div>
      {agentStatus.extensions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Extensions ({agentStatus.extensions.length})
          </p>
          {agentStatus.extensions.map((ext) => (
            <p key={ext} className="text-xs truncate">{ext}</p>
          ))}
        </div>
      )}
      {selectedModel && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Model</p>
          <p className="text-xs">{availableModels.find(m => m.id === selectedModel)?.name ?? selectedModel}</p>
        </div>
      )}
    </div>
  );
}

const sideContent: Record<LensView, React.FC> = {
  chat: ChatSideContent,
  hello: HelloSideContent,
};

export function SidePanel() {
  const { agentStatus, activeView } = useAppState();
  const { selectMindDirectory } = useAgentStatus();
  const Content = sideContent[activeView] ?? sideContent.chat;

  return (
    <aside className="w-56 border-r border-border flex flex-col bg-card shrink-0">
      {/* Header: logo + status — always visible */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-genesis flex items-center justify-center text-sm font-bold text-primary-foreground">
            G
          </div>
          <div>
            <h1 className="text-sm font-semibold">Genesis</h1>
            <p className="text-xs text-muted-foreground">Mind Interface</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <div className={cn(
            'w-2 h-2 rounded-full',
            agentStatus.connected ? 'bg-genesis' : 'bg-destructive-foreground'
          )} />
          <span className="text-muted-foreground">
            {agentStatus.connected ? 'Mind loaded' : 'No mind selected'}
          </span>
        </div>
        {agentStatus.mindPath && (
          <p className="text-xs text-muted-foreground mt-1 truncate" title={agentStatus.mindPath}>
            {agentStatus.mindPath.split(/[\\/]/).pop()}
          </p>
        )}
      </div>

      {/* Middle: contextual content — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Content />
      </div>

      {/* Footer: mind selector — always visible */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={selectMindDirectory}
          className="w-full px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-left"
        >
          {agentStatus.connected ? 'Change mind directory…' : 'Select mind directory…'}
        </button>
      </div>
    </aside>
  );
}
