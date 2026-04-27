/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GenesisFlow } from './GenesisFlow';
import { AppStateProvider, useAppState } from '../../lib/store';
import { installElectronAPI, mockElectronAPI } from '../../../test/helpers';
import type { MindContext } from '../../../shared/types';

vi.mock('./VoidScreen', () => ({
  VoidScreen: ({ onBegin }: { onBegin: () => void }) => <button onClick={onBegin}>Begin</button>,
}));

vi.mock('./VoiceScreen', () => ({
  VoiceScreen: ({ onSelect }: { onSelect: (voice: string, description: string) => void }) => (
    <button onClick={() => onSelect('Test Agent', 'Test voice')}>Choose voice</button>
  ),
}));

vi.mock('./RoleScreen', () => ({
  RoleScreen: ({ onSelect }: { onSelect: (role: string) => void }) => (
    <button onClick={() => onSelect('Chief of Staff')}>Choose role</button>
  ),
}));

vi.mock('./BootScreen', () => ({
  BootScreen: ({ onComplete }: { onComplete: () => void }) => <button onClick={onComplete}>Boot complete</button>,
}));

const createdMind: MindContext = {
  mindId: 'test-agent-1234',
  mindPath: 'C:\\agents\\test-agent',
  identity: { name: 'Test Agent', systemMessage: '# Test Agent' },
  status: 'ready',
};

const otherMind: MindContext = {
  mindId: 'other-agent-1234',
  mindPath: 'C:\\agents\\other-agent',
  identity: { name: 'Other Agent', systemMessage: '# Other Agent' },
  status: 'ready',
};

function ActiveMindProbe() {
  const { activeMindId } = useAppState();
  return <div data-testid="active-mind-id">{activeMindId}</div>;
}

describe('GenesisFlow', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('waits for genesis.create to load the new mind before completing', async () => {
    let resolveCreate: (value: { success: true; mindPath: string }) => void = () => {};
    (api.genesis.create as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([createdMind]);
    const onComplete = vi.fn();

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={onComplete} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose voice'));
    fireEvent.click(await screen.findByText('Choose role'));
    fireEvent.click(await screen.findByText('Boot complete'));

    expect(api.mind.list).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    resolveCreate({ success: true, mindPath: createdMind.mindPath });

    await waitFor(() => {
      expect(api.mind.list).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('selects the mind path returned by genesis.create instead of the last listed mind', async () => {
    let resolveCreate: (value: { success: true; mindPath: string }) => void = () => {};
    (api.genesis.create as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([createdMind, otherMind]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
        <ActiveMindProbe />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose voice'));
    fireEvent.click(await screen.findByText('Choose role'));
    fireEvent.click(await screen.findByText('Boot complete'));

    resolveCreate({ success: true, mindPath: createdMind.mindPath.toUpperCase() });

    await waitFor(() => {
      expect(screen.getByTestId('active-mind-id').textContent).toBe(createdMind.mindId);
    });
  });
});
