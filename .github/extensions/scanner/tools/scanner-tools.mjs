import { randomUUID } from 'crypto';
// Scanner tools exposed to the Copilot agent
import { getSignals, saveSignals, deduplicateSignals } from '../extension.mjs';

export function createScannerTools(extDir, state) {
  return [
    {
      name: 'scanner_get_signals',
      description: 'Get all stored signals from the M365 scanner. Returns actionable items from email and Teams.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new', 'reviewed', 'dismissed', 'all'], description: 'Filter by status' },
          limit: { type: 'number', description: 'Max signals to return' }
        }
      },
      handler: async ({ status, limit }) => {
        let signals = getSignals();
        if (status && status !== 'all') signals = signals.filter(s => s.status === status);
        if (limit) signals = signals.slice(0, limit);
        return JSON.stringify(signals);
      }
    },
    {
      name: 'scanner_save_scan_results',
      description: 'Save new scan results from WorkIQ. Deduplicates against existing signals. Each signal needs: source, title, summary, sender, priority, context, suggestedAction, receivedAt.',
      parameters: {
        type: 'object',
        properties: {
          signals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', enum: ['email', 'teams'] },
                title: { type: 'string' },
                summary: { type: 'string' },
                sender: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                context: { type: 'string' },
                suggestedAction: { type: 'string' },
                receivedAt: { type: 'string' }
              }
            }
          }
        },
        required: ['signals']
      },
      handler: async ({ signals }) => {
        const existing = getSignals();
        const newOnes = deduplicateSignals(signals, existing);
        const timestamped = newOnes.map(s => ({
          ...s,
          id: randomUUID(),
          status: 'new',
          scannedAt: new Date().toISOString()
        }));
        saveSignals([...timestamped, ...existing]);
        return JSON.stringify({ added: timestamped.length, deduplicated: signals.length - timestamped.length, total: existing.length + timestamped.length });
      }
    },
    {
      name: 'scanner_update_signal',
      description: 'Update a signal status (reviewed, dismissed, acted).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Signal ID' },
          status: { type: 'string', enum: ['new', 'reviewed', 'dismissed', 'acted'] }
        },
        required: ['id', 'status']
      },
      handler: async ({ id, status }) => {
        const signals = getSignals();
        const idx = signals.findIndex(s => s.id === id);
        if (idx === -1) return JSON.stringify({ error: 'Signal not found' });
        signals[idx].status = status;
        signals[idx].updatedAt = new Date().toISOString();
        saveSignals(signals);
        return JSON.stringify({ ok: true, signal: signals[idx] });
      }
    },
    {
      name: 'scanner_get_stats',
      description: 'Get scanner statistics: signal counts by status and priority.',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const signals = getSignals();
        const byStatus = { new: 0, reviewed: 0, dismissed: 0, acted: 0 };
        const byPriority = { high: 0, medium: 0, low: 0 };
        signals.forEach(s => {
          if (s.status in byStatus) byStatus[s.status]++;
          if (s.priority in byPriority) byPriority[s.priority]++;
        });
        return JSON.stringify({ total: signals.length, byStatus, byPriority });
      }
    }
  ];
}
