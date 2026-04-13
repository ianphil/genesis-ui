import { useEffect, useCallback } from 'react';
import { useAppState, useAppDispatch } from '../lib/store';

export function useAgentStatus() {
  const { minds } = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Load minds from MindManager
    window.electronAPI.mind.list().then((loadedMinds) => {
      if (loadedMinds.length > 0) {
        dispatch({ type: 'SET_MINDS', payload: loadedMinds });
        dispatch({ type: 'SET_ACTIVE_MIND', payload: loadedMinds[0].mindId });
      }
      dispatch({ type: 'MINDS_CHECKED' });
    });

    // Subscribe to mind changes
    const unsubMinds = window.electronAPI.mind.onMindChanged((updatedMinds) => {
      dispatch({ type: 'SET_MINDS', payload: updatedMinds });
    });

    return () => {
      unsubMinds();
    };
  }, [dispatch]);

  const selectMindDirectory = useCallback(async () => {
    const dirPath = await window.electronAPI.mind.selectDirectory();
    if (dirPath) {
      await window.electronAPI.mind.add(dirPath);
      const loadedMinds = await window.electronAPI.mind.list();
      dispatch({ type: 'SET_MINDS', payload: loadedMinds });
      const newest = loadedMinds[loadedMinds.length - 1];
      if (newest) dispatch({ type: 'SET_ACTIVE_MIND', payload: newest.mindId });
    }
    return dirPath;
  }, [dispatch]);

  return { minds, selectMindDirectory };
}
