import React from 'react';
import { useAppState, useAppDispatch } from '../../lib/store';
import type { LensView } from '../../lib/store';
import { cn } from '../../lib/utils';
import { MessageSquare, Zap, MoreHorizontal } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';

const views: { id: LensView; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={20} /> },
  { id: 'hello', label: 'Hello World', icon: <Zap size={20} /> },
];

export function ActivityBar() {
  const { activeView } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="w-12 bg-card border-r border-border flex flex-col items-center py-2 shrink-0">
      <div className="flex flex-col items-center gap-1 flex-1">
        {views.map((view) => (
          <Tooltip key={view.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: view.id })}
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                  activeView === view.id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {view.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {view.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator className="my-2 w-8" />

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
            <MoreHorizontal size={20} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          More views
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
