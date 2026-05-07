import React, { useState } from 'react';
import { useAppState, useAppDispatch } from '../../lib/store';
import { useChatStreaming } from '../../hooks/useChatStreaming';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { WelcomeScreen } from './WelcomeScreen';
import { Logger } from '../../lib/logger';

const log = Logger.create('ChatPanel');

export function ChatPanel() {
  const { messagesByMind, activeMindId, minds, availableModels, selectedModel } = useAppState();
  const messages = activeMindId ? (messagesByMind[activeMindId] ?? []) : [];
  const connected = minds.length > 0;
  const dispatch = useAppDispatch();
  const { sendMessage, stopStreaming, isStreaming } = useChatStreaming();
  const [isModelSwitching, setIsModelSwitching] = useState(false);

  const handleModelChange = (model: string) => {
    if (!activeMindId || isModelSwitching) return;
    const previousModel = selectedModel;
    dispatch({ type: 'SET_SELECTED_MODEL', payload: model });
    setIsModelSwitching(true);
    window.electronAPI.mind.setModel(activeMindId, model)
      .then((updatedMind) => {
        if (updatedMind) dispatch({ type: 'SET_MINDS', payload: minds.map((mind) => mind.mindId === updatedMind.mindId ? updatedMind : mind) });
      })
      .catch((error: unknown) => {
        log.error('Failed to switch model:', error);
        dispatch({ type: 'SET_SELECTED_MODEL', payload: previousModel });
      })
      .finally(() => {
        setIsModelSwitching(false);
      });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {messages.length === 0 ? (
        <WelcomeScreen
          onSendMessage={sendMessage}
          connected={connected}
          disabled={isModelSwitching}
        />
      ) : (
        <MessageList />
      )}

      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={!connected || isModelSwitching}
        availableModels={availableModels}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        placeholder={isModelSwitching ? 'Switching model…' : undefined}
      />
    </div>
  );
}
