/**
 * Transport-agnostic fan-out for outbound (server-initiated) events.
 *
 * Unlike {@link InvocationReply.emit}, which is scoped to a single caller,
 * pushBus broadcasts to every connected transport subscriber. The IPC
 * adapter subscribes once and fans out to every BrowserWindow; the WS
 * adapter subscribes once and fans out to every live socket.
 *
 * Scope is currently always `'all'`. Future scopes (`'mind'`, `'session'`)
 * will add filtering without changing the subscriber protocol.
 */
export type PushScope = 'all';

export type PushSubscriber = (
  channel: string,
  payload: unknown,
  scope: PushScope,
) => void;

export class PushBus {
  private readonly subscribers = new Set<PushSubscriber>();

  subscribe(sub: PushSubscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  publish(channel: string, payload: unknown, scope: PushScope = 'all'): void {
    for (const sub of this.subscribers) {
      try {
        sub(channel, payload, scope);
      } catch (err) {
        // One subscriber failing must not stop delivery to others.
        console.error(`[pushBus] subscriber threw for channel=${channel}:`, err);
      }
    }
  }

  /** Number of active subscribers. Intended for tests / diagnostics. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
