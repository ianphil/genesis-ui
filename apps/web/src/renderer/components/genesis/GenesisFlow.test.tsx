/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GenesisFlow } from './GenesisFlow';
import { AppStateProvider, useAppState } from '../../lib/store';
import { installElectronAPI, mockElectronAPI } from '../../../test/helpers';
import type { MindContext } from '../../../shared/types';

vi.mock('./VoidScreen', () => ({
  VoidScreen: ({ onBegin }: { onBegin: () => void }) => <button onClick={onBegin}>Begin</button>,
}));

// VoiceScreen mock exposes all three paths: custom mind, marketplace template, and team
vi.mock('./VoiceScreen', () => ({
  VoiceScreen: ({ onSelect }: { onSelect: (s: { type: string; [key: string]: unknown }) => void }) => (
    <>
      <button onClick={() => onSelect({ type: 'custom', voice: 'Test Agent', description: 'Test voice' })}>Choose voice</button>
      <button onClick={() => onSelect({ type: 'template', templateId: 'lucy', name: 'Lucy', role: 'Chief of Staff', sourceUrl: 'ianphil/genesis-minds' })}>Choose Lucy</button>
      <button onClick={() => onSelect({ type: 'team', teamId: 'azure-se-team', name: 'Azure Solutions Engineers', sourceUrl: 'ianphil/genesis-minds' })}>Choose Team</button>
    </>
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

const lucyMind: MindContext = {
  mindId: 'lucy-1234',
  mindPath: 'C:\\agents\\lucy',
  identity: { name: 'Lucy', systemMessage: '# Lucy' },
  status: 'ready',
};

const otherMind: MindContext = {
  mindId: 'other-agent-1234',
  mindPath: 'C:\\agents\\other-agent',
  identity: { name: 'Other Agent', systemMessage: '# Other Agent' },
  status: 'ready',
};

const teamMindA: MindContext = {
  mindId: 'kai-1234',
  mindPath: 'C:\\agents\\kai',
  identity: { name: 'Kai', systemMessage: '# Kai' },
  status: 'ready',
};

const teamMindB: MindContext = {
  mindId: 'river-1234',
  mindPath: 'C:\\agents\\river',
  identity: { name: 'River', systemMessage: '# River' },
  status: 'ready',
};

function ActiveMindProbe() {
  const { activeMindId } = useAppState();
  return <div data-testid="active-mind-id">{activeMindId}</div>;
}

afterEach(() => cleanup());

describe('GenesisFlow — custom mind path', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('waits for genesis.create to load the new mind before completing', async () => {
    let resolveCreate: (value: { success: true; mindId: string; mindPath: string }) => void = () => {};
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

    resolveCreate({ success: true, mindId: createdMind.mindId, mindPath: createdMind.mindPath });

    await waitFor(() => {
      expect(api.mind.list).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('selects the mind path returned by genesis.create instead of the last listed mind', async () => {
    let resolveCreate: (value: { success: true; mindId?: string; mindPath: string }) => void = () => {};
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

  it('routes through RoleScreen when a custom voice is selected', async () => {
    (api.genesis.create as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, mindId: createdMind.mindId, mindPath: createdMind.mindPath });
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([createdMind]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose voice'));

    // RoleScreen must appear before BootScreen
    expect(await screen.findByText('Choose role')).toBeDefined();
  });
});

describe('GenesisFlow — marketplace template path', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('calls genesis.installTemplate (not genesis.create) when a predefined template is selected', async () => {
    (api.genesis.installTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, mindId: lucyMind.mindId, mindPath: lucyMind.mindPath });
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([lucyMind]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Lucy'));
    fireEvent.click(await screen.findByText('Boot complete'));

    await waitFor(() => {
      expect(api.genesis.installTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 'lucy' }),
      );
      expect(api.genesis.create).not.toHaveBeenCalled();
    });
  });

  it('skips RoleScreen when a predefined template is selected', async () => {
    let resolveInstall: (value: { success: true; mindId: string; mindPath: string }) => void = () => {};
    (api.genesis.installTemplate as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => {
      resolveInstall = resolve;
    }));
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([lucyMind]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Lucy'));

    // Should show BootScreen directly — no RoleScreen
    expect(await screen.findByText('Boot complete')).toBeDefined();
    expect(screen.queryByText('Choose role')).toBeNull();

    resolveInstall({ success: true, mindId: lucyMind.mindId, mindPath: lucyMind.mindPath });
  });

  it('activates the installed template mind after boot completes', async () => {
    (api.genesis.installTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, mindId: lucyMind.mindId, mindPath: lucyMind.mindPath });
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([lucyMind, otherMind]);
    const onComplete = vi.fn();

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={onComplete} />
        <ActiveMindProbe />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Lucy'));
    fireEvent.click(await screen.findByText('Boot complete'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
      expect(screen.getByTestId('active-mind-id').textContent).toBe(lucyMind.mindId);
    });
  });
});

describe('GenesisFlow — team path', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('calls genesis.installTeam (not genesis.create or installTemplate) when a team is selected', async () => {
    (api.genesis.installTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, mindIds: [teamMindA.mindId, teamMindB.mindId] });
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([teamMindA, teamMindB]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Team'));
    fireEvent.click(await screen.findByText('Boot complete'));

    await waitFor(() => {
      expect(api.genesis.installTeam).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'azure-se-team' }),
      );
      expect(api.genesis.create).not.toHaveBeenCalled();
      expect(api.genesis.installTemplate).not.toHaveBeenCalled();
    });
  });

  it('skips RoleScreen when a team is selected', async () => {
    let resolveInstallTeam: (value: { success: boolean; mindIds: string[] }) => void = () => {};
    (api.genesis.installTeam as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => {
      resolveInstallTeam = resolve;
    }));
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([teamMindA]);

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={vi.fn()} />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Team'));

    // BootScreen must appear directly — no RoleScreen
    expect(await screen.findByText('Boot complete')).toBeDefined();
    expect(screen.queryByText('Choose role')).toBeNull();

    resolveInstallTeam({ success: true, mindIds: [teamMindA.mindId] });
  });

  it('activates the first team member after boot completes', async () => {
    (api.genesis.installTeam as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, mindIds: [teamMindA.mindId, teamMindB.mindId] });
    (api.mind.list as ReturnType<typeof vi.fn>).mockResolvedValue([teamMindA, teamMindB, otherMind]);
    const onComplete = vi.fn();

    render(
      <AppStateProvider>
        <GenesisFlow onComplete={onComplete} />
        <ActiveMindProbe />
      </AppStateProvider>,
    );

    fireEvent.click(screen.getByText('Begin'));
    fireEvent.click(screen.getByText('Choose Team'));
    fireEvent.click(await screen.findByText('Boot complete'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
      expect(screen.getByTestId('active-mind-id').textContent).toBe(teamMindA.mindId);
    });
  });
});
