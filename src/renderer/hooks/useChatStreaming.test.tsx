/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AppStateProvider } from '../lib/store';
import { installElectronAPI, mockElectronAPI } from '../../test/helpers';
import { useChatStreaming } from './useChatStreaming';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}

describe('useChatStreaming', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('sendMessage calls electronAPI.chat.send', async () => {
    const { result } = renderHook(() => useChatStreaming(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(api.chat.send).toHaveBeenCalled();
    const args = (api.chat.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1]).toBe('Hello');
  });

  it('sendMessage no-ops on empty string', async () => {
    const { result } = renderHook(() => useChatStreaming(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(api.chat.send).not.toHaveBeenCalled();
  });

  it('stopStreaming calls electronAPI.chat.stop', async () => {
    const { result } = renderHook(() => useChatStreaming(), { wrapper });

    // First send a message to set currentMessageId
    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(api.chat.stop).toHaveBeenCalled();
  });

  it('isStreaming reflects state', () => {
    const { result } = renderHook(() => useChatStreaming(), { wrapper });
    expect(result.current.isStreaming).toBe(false);
  });
});
