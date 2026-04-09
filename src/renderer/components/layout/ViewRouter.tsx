import React from 'react';
import type { LensView } from '../../lib/store';
import { ChatPanel } from '../chat/ChatPanel';
import { HelloWorldView } from '../views/HelloWorldView';

interface Props {
  activeView: LensView;
}

export function ViewRouter({ activeView }: Props) {
  switch (activeView) {
    case 'chat':
      return <ChatPanel />;
    case 'hello':
      return <HelloWorldView />;
    default:
      return <ChatPanel />;
  }
}
