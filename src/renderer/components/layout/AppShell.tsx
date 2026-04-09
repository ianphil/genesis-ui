import React from 'react';
import { useAppState } from '../../lib/store';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { useAppSubscriptions } from '../../hooks/useAppSubscriptions';
import { TooltipProvider } from '../ui/tooltip';
import { ActivityBar } from './ActivityBar';
import { SidePanel } from './SidePanel';
import { ViewRouter } from './ViewRouter';

export function AppShell() {
  const { activeView } = useAppState();
  useAgentStatus();
  useAppSubscriptions();

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen bg-background text-foreground">
        {/* Titlebar drag region */}
        <div className="titlebar-drag h-9 shrink-0" />

        {/* Main layout: activity bar | side panel | content */}
        <div className="flex flex-1 min-h-0">
          <ActivityBar />
          <SidePanel />
          <main className="flex-1 flex flex-col min-w-0">
            <ViewRouter activeView={activeView} />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
