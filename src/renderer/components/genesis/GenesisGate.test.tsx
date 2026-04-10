/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GenesisGate } from './GenesisGate';
import { AppStateProvider } from '../../lib/store';
import { installElectronAPI, mockElectronAPI, connectedAgentStatus } from '../../../test/helpers';

function renderWithProvider(ui: React.ReactElement) {
  return render(<AppStateProvider>{ui}</AppStateProvider>);
}

describe('GenesisGate', () => {
  let api: ReturnType<typeof mockElectronAPI>;

  beforeEach(() => {
    api = installElectronAPI();
  });

  it('shows LandingScreen when agent is not connected', () => {
    renderWithProvider(<GenesisGate><div>App</div></GenesisGate>);
    expect(screen.getByText('New Agent', { exact: false })).toBeTruthy();
    expect(screen.getByText('Open Existing', { exact: false })).toBeTruthy();
    expect(screen.queryByText('App')).toBeNull();
  });

  it('clicking Open Existing triggers file dialog', async () => {
    (api.agent.selectMindDirectory as ReturnType<typeof vi.fn>).mockResolvedValue('C:\\test\\mind');
    (api.agent.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue(connectedAgentStatus());

    renderWithProvider(<GenesisGate><div>App</div></GenesisGate>);
    fireEvent.click(screen.getByText('Open Existing', { exact: false }));

    await waitFor(() => {
      expect(api.agent.selectMindDirectory).toHaveBeenCalled();
    });
  });
});
