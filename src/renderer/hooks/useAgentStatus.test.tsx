/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AppStateProvider, useAppDispatch, useAppState } from '../lib/store';
import { installElectronAPI, mockElectronAPI, connectedAgentStatus } from '../../test/helpers';
import { useAgentStatus } from './useAgentStatus';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}

describe('useAgentStatus', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('fetches initial status on mount', async () => {
    const status = connectedAgentStatus();
    (api.agent.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue(status);

    const { result } = renderHook(() => useAgentStatus(), { wrapper });

    await waitFor(() => {
      expect(api.agent.getStatus).toHaveBeenCalled();
    });
  });

  it('subscribes to onStatusChanged', () => {
    renderHook(() => useAgentStatus(), { wrapper });
    expect(api.agent.onStatusChanged).toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const unsub = vi.fn();
    (api.agent.onStatusChanged as ReturnType<typeof vi.fn>).mockReturnValue(unsub);

    const { unmount } = renderHook(() => useAgentStatus(), { wrapper });
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it('selectMindDirectory triggers dialog and refreshes status', async () => {
    (api.agent.selectMindDirectory as ReturnType<typeof vi.fn>).mockResolvedValue('C:\\test\\mind');
    (api.agent.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue(connectedAgentStatus());

    const { result } = renderHook(() => useAgentStatus(), { wrapper });

    await act(async () => {
      await result.current.selectMindDirectory();
    });

    expect(api.agent.selectMindDirectory).toHaveBeenCalled();
  });
});
