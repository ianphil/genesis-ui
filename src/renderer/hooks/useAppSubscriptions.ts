import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../lib/store';

/**
 * App-level subscriptions that must survive view switches.
 * Mount once in AppShell — never in a view component.
 */
export function useAppSubscriptions() {
  const { agentStatus } = useAppState();
  const dispatch = useAppDispatch();
  const modelsLoaded = useRef(false);

  // Chat event listener — must stay alive regardless of active view
  useEffect(() => {
    const unsub = window.electronAPI.chat.onEvent((messageId, event) => {
      dispatch({ type: 'CHAT_EVENT', payload: { messageId, event } });
    });
    return () => { unsub(); };
  }, [dispatch]);

  // Fetch models when agent connects
  useEffect(() => {
    if (!agentStatus.connected) {
      modelsLoaded.current = false;
      return;
    }
    if (modelsLoaded.current) return;

    const loadModels = async () => {
      try {
        const models = await window.electronAPI.chat.listModels();
        dispatch({ type: 'SET_AVAILABLE_MODELS', payload: models });
        modelsLoaded.current = true;

        const persisted = localStorage.getItem('genesis-ui:selectedModel');
        const valid = persisted && models.some(m => m.id === persisted);
        if (!valid && models.length > 0) {
          dispatch({ type: 'SET_SELECTED_MODEL', payload: models[0].id });
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      }
    };
    loadModels();
  }, [agentStatus.connected, dispatch]);
}
