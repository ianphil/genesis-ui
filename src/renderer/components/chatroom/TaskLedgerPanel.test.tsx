/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { TaskLedgerPanel } from './TaskLedgerPanel';

describe('TaskLedgerPanel', () => {
  const minds = [
    { mindId: 'a', identity: { name: 'Alpha' } },
    { mindId: 'b', identity: { name: 'Beta' } },
  ];

  it('renders nothing when ledger is empty', () => {
    const { container } = render(<TaskLedgerPanel ledger={[]} minds={minds} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders task descriptions', () => {
    const ledger = [
      { id: '1', description: 'Research AI safety', status: 'completed', assignee: 'a' },
      { id: '2', description: 'Write summary', status: 'in-progress', assignee: 'b' },
    ];
    render(<TaskLedgerPanel ledger={ledger} minds={minds} />);
    expect(screen.getByText('Research AI safety')).toBeDefined();
    expect(screen.getByText('Write summary')).toBeDefined();
  });

  it('resolves assignee names from minds', () => {
    const ledger = [
      { id: '1', description: 'Task', status: 'completed', assignee: 'a' },
    ];
    render(<TaskLedgerPanel ledger={ledger} minds={minds} />);
    expect(screen.getByText('Alpha')).toBeDefined();
  });

  it('shows Unassigned for tasks without assignee', () => {
    const ledger = [
      { id: '1', description: 'Pending task', status: 'pending' },
    ];
    render(<TaskLedgerPanel ledger={ledger} minds={minds} />);
    expect(screen.queryByText('Unassigned')).toBeNull(); // No assignee = no label
  });

  it('shows status icons for each state', () => {
    const ledger = [
      { id: '1', description: 'Pending', status: 'pending' },
      { id: '2', description: 'Working', status: 'in-progress' },
      { id: '3', description: 'Done', status: 'completed' },
      { id: '4', description: 'Broken', status: 'failed' },
    ];
    render(<TaskLedgerPanel ledger={ledger} minds={minds} />);
    expect(screen.getByText('○')).toBeDefined();
    expect(screen.getByText('◉')).toBeDefined();
    expect(screen.getByText('✓')).toBeDefined();
    expect(screen.getByText('✗')).toBeDefined();
  });

  it('renders Task Ledger heading', () => {
    const ledger = [{ id: '1', description: 'Task', status: 'pending' }];
    render(<TaskLedgerPanel ledger={ledger} minds={minds} />);
    expect(screen.getByText('Task Ledger')).toBeDefined();
  });
});
