import React, { useState, useCallback, useRef } from 'react';
import { useAppDispatch } from '../../lib/store';
import { VoidScreen } from './VoidScreen';
import { RoleScreen } from './RoleScreen';
import { VoiceScreen, type VoiceSelection } from './VoiceScreen';
import { BootScreen } from './BootScreen';
import { selectPreferredMind } from '../../lib/mindSelection';

type Stage = 'void' | 'role' | 'voice' | 'boot' | 'done';

type AnyGenesisResult = {
  success: boolean;
  mindId?: string;
  mindPath?: string;
  mindIds?: string[];
  welcomeMessage?: string;
  error?: string;
} | null;

interface Props {
  onComplete: () => void;
}

export function GenesisFlow({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('void');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [voiceDesc, setVoiceDesc] = useState('');
  const creationPromiseRef = useRef<Promise<AnyGenesisResult> | null>(null);
  const dispatch = useAppDispatch();

  const handleBegin = useCallback(() => setStage('voice'), []);

  const handleVoiceSelect = useCallback(async (selection: VoiceSelection) => {
    if (selection.type === 'template') {
      // Predefined marketplace mind — skip RoleScreen, install deterministically
      setName(selection.name);
      setRole(selection.role);
      setStage('boot');

      const defaultPath = await window.electronAPI.genesis.getDefaultPath();
      const installPromise = window.electronAPI.genesis.installTemplate({
        templateId: selection.templateId,
        basePath: defaultPath,
        sourceUrl: selection.sourceUrl,
      }).catch((error: unknown) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      creationPromiseRef.current = installPromise;
      await installPromise;
    } else if (selection.type === 'team') {
      // Pre-configured team — install all members, then open chatroom
      setName(selection.name);
      setRole('Team');
      setStage('boot');

      const defaultPath = await window.electronAPI.genesis.getDefaultPath();
      const installPromise = window.electronAPI.genesis.installTeam({
        teamId: selection.teamId,
        basePath: defaultPath,
        sourceUrl: selection.sourceUrl,
      }).catch((error: unknown) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      creationPromiseRef.current = installPromise;
      await installPromise;
    } else {
      // Custom voice — proceed to RoleScreen then SDK generation
      setName(selection.voice);
      setVoiceDesc(selection.description);
      setTimeout(() => setStage('role'), 300);
    }
  }, []);

  const handleRole = useCallback(async (r: string) => {
    setRole(r);
    setStage('boot');

    const defaultPath = await window.electronAPI.genesis.getDefaultPath();
    const creationPromise = window.electronAPI.genesis.create({
      name: name,
      role: r,
      voice: name,
      voiceDescription: voiceDesc,
      basePath: defaultPath,
    }).catch((error: unknown) => ({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    creationPromiseRef.current = creationPromise;
    await creationPromise;
  }, [name, voiceDesc]);

  const handleBootComplete = useCallback(async () => {
    const result = await creationPromiseRef.current;
    if (!result?.success) {
      if (result?.error) console.error('[Genesis] Failed:', result.error);
      return;
    }

    const loadedMinds = await window.electronAPI.mind.list();
    dispatch({ type: 'SET_MINDS', payload: loadedMinds });

    // For single minds use mindId/mindPath; for team installs use first member
    const primaryMindId = result.mindId ?? result.mindIds?.[0];
    const mindToSelect = selectPreferredMind(loadedMinds, { mindId: primaryMindId, mindPath: result.mindPath });
    if (mindToSelect) {
      dispatch({ type: 'SET_ACTIVE_MIND', payload: mindToSelect.mindId });
    }

    // Only open a new conversation for single-mind installs
    if (!result.mindIds) {
      dispatch({ type: 'NEW_CONVERSATION' });
    }

    setStage('done');
    onComplete();
  }, [dispatch, onComplete]);

  switch (stage) {
    case 'void':
      return <VoidScreen onBegin={handleBegin} />;
    case 'voice':
      return <VoiceScreen onSelect={handleVoiceSelect} />;
    case 'role':
      return <RoleScreen name={name} onSelect={handleRole} />;
    case 'boot':
      return <BootScreen name={name} role={role} onComplete={handleBootComplete} />;
    case 'done':
      return null;
    default:
      return null;
  }
}
