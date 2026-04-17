import { describe, it, expect, vi } from 'vitest';
import { PushBus } from './pushBus';

describe('PushBus', () => {
  it('fans out to every subscriber', () => {
    const bus = new PushBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);

    bus.publish('mind:changed', { minds: [] });

    expect(a).toHaveBeenCalledWith('mind:changed', { minds: [] }, 'all');
    expect(b).toHaveBeenCalledWith('mind:changed', { minds: [] }, 'all');
  });

  it('subscribe returns an unsubscribe function', () => {
    const bus = new PushBus();
    const sub = vi.fn();
    const off = bus.subscribe(sub);

    bus.publish('x', 1);
    off();
    bus.publish('x', 2);

    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering after a subscriber throws', () => {
    const bus = new PushBus();
    const bad = vi.fn(() => {
      throw new Error('kaboom');
    });
    const good = vi.fn();
    bus.subscribe(bad);
    bus.subscribe(good);

    // Silence the error logged by the bus.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bus.publish('x', 1);
    errSpy.mockRestore();

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith('x', 1, 'all');
  });

  it('defaults scope to "all"', () => {
    const bus = new PushBus();
    const sub = vi.fn();
    bus.subscribe(sub);
    bus.publish('c', { ok: true });
    expect(sub).toHaveBeenCalledWith('c', { ok: true }, 'all');
  });

  it('tracks subscriberCount', () => {
    const bus = new PushBus();
    expect(bus.subscriberCount).toBe(0);
    const off = bus.subscribe(() => undefined);
    expect(bus.subscriberCount).toBe(1);
    off();
    expect(bus.subscriberCount).toBe(0);
  });
});
