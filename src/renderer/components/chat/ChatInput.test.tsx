/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';
import type { ModelInfo } from '../../../shared/types';

const defaultProps = {
  onSend: vi.fn(),
  onStop: vi.fn(),
  isStreaming: false,
  disabled: false,
  availableModels: [] as ModelInfo[],
  selectedModel: null,
  onModelChange: vi.fn(),
};

describe('ChatInput', () => {
  it('typing updates textarea value', () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('Hello');
  });

  it('Enter key submits non-empty text', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('Enter on empty text does not submit', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Shift+Enter does not submit', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disabled prop disables textarea', () => {
    render(<ChatInput {...defaultProps} disabled={true} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveProperty('disabled', true);
  });

  it('streaming shows stop button, clicking calls onStop', () => {
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps} isStreaming={true} onStop={onStop} />);
    // The emoji trigger has aria-label "Insert emoji"; the stop button is the only other button.
    const buttons = screen.getAllByRole('button');
    const stop = buttons.find((b) => b.getAttribute('aria-label') !== 'Insert emoji');
    expect(stop).toBeTruthy();
    fireEvent.click(stop!);
    expect(onStop).toHaveBeenCalled();
  });

  it('shows Loading models when no models available and not disabled', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByText('Loading models…')).toBeTruthy();
  });

  describe('emoji picker', () => {
    it('renders an emoji trigger button with aria-label', () => {
      render(<ChatInput {...defaultProps} />);
      const trigger = screen.getByRole('button', { name: 'Insert emoji' });
      expect(trigger).toBeTruthy();
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('disables emoji trigger when disabled prop is true', () => {
      render(<ChatInput {...defaultProps} disabled={true} />);
      const trigger = screen.getByRole('button', { name: 'Insert emoji' });
      expect((trigger as HTMLButtonElement).disabled).toBe(true);
    });

    it('emoji trigger remains enabled while streaming', () => {
      render(<ChatInput {...defaultProps} isStreaming={true} />);
      const trigger = screen.getByRole('button', { name: 'Insert emoji' });
      expect((trigger as HTMLButtonElement).disabled).toBe(false);
    });

    it('emoji trigger toggles aria-expanded on click', () => {
      render(<ChatInput {...defaultProps} />);
      const trigger = screen.getByRole('button', { name: 'Insert emoji' });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('preserves textarea selection when emoji trigger is mousedown', () => {
      render(<ChatInput {...defaultProps} />);
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'hello world' } });
      textarea.setSelectionRange(5, 5);
      const trigger = screen.getByRole('button', { name: 'Insert emoji' });
      const evt = fireEvent.mouseDown(trigger);
      // preventDefault means default action of moving focus is suppressed
      expect(evt).toBe(false); // fireEvent returns false when preventDefault was called
    });
  });
});
