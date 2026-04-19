import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { decayScore, isStale } from '../lib/decay.mjs';

function getMemoryDir(extDir) { return join(extDir, 'data'); }

function readTier(extDir, tier) {
  const dir = join(getMemoryDir(extDir), tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { return null; }
  }).filter(Boolean);
}

function writeTierEntry(extDir, tier, entry) {
  const dir = join(getMemoryDir(extDir), tier);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify(entry, null, 2));
}

// UUID format validation to prevent path traversal
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deleteTierEntry(extDir, tier, id) {
  if (!UUID_RE.test(id)) return false;
  const filepath = join(getMemoryDir(extDir), tier, `${id}.json`);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
    return true;
  }
  return false;
}

export function createMemoryTools(extDir, state) {
  return [
    {
      name: 'memory_remember',
      description: 'Store a memory entry. Tier: semantic (permanent facts), episodic (daily events, 7d decay), session (task context, 1d decay).',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['semantic', 'episodic', 'session'] },
          content: { type: 'string', description: 'The memory content' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for search' }
        },
        required: ['tier', 'content']
      },
      handler: async ({ tier, content, tags }) => {
        const entry = {
          id: randomUUID(),
          tier,
          content,
          tags: tags || [],
          createdAt: new Date().toISOString(),
          lastTouchedAt: new Date().toISOString()
        };
        writeTierEntry(extDir, tier, entry);
        return JSON.stringify({ stored: true, id: entry.id, tier });
      }
    },
    {
      name: 'memory_recall',
      description: 'Search memory across all tiers. Results are ranked by relevance with temporal decay applied.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          tier: { type: 'string', enum: ['semantic', 'episodic', 'session', 'all'], description: 'Filter by tier' }
        },
        required: ['query']
      },
      handler: async ({ query, tier }) => {
        const tiers = (tier && tier !== 'all') ? [tier] : ['semantic', 'episodic', 'session'];
        const allEntries = tiers.flatMap(t => readTier(extDir, t));
        const q = query.toLowerCase();
        const matched = allEntries
          .filter(e => e.content && (e.content.toLowerCase().includes(q) || (e.tags || []).some(t => t.toLowerCase().includes(q))))
          .map(e => ({ ...e, score: decayScore(1.0, e.lastTouchedAt, e.tier) }))
          .filter(e => e.score > 0.05)
          .sort((a, b) => b.score - a.score);
        return JSON.stringify(matched.slice(0, 20));
      }
    },
    {
      name: 'memory_touch',
      description: 'Refresh a memory entry (resets decay timer). Use when a memory is referenced in conversation.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tier: { type: 'string', enum: ['semantic', 'episodic', 'session'] }
        },
        required: ['id', 'tier']
      },
      handler: async ({ id, tier }) => {
        if (!UUID_RE.test(id)) return JSON.stringify({ error: 'Invalid ID format' });
        const filepath = join(getMemoryDir(extDir), tier, `${id}.json`);
        if (!existsSync(filepath)) return JSON.stringify({ error: 'Not found' });
        const entry = JSON.parse(readFileSync(filepath, 'utf-8'));
        entry.lastTouchedAt = new Date().toISOString();
        writeTierEntry(extDir, tier, entry);
        return JSON.stringify({ touched: true, id });
      }
    },
    {
      name: 'memory_list',
      description: 'List all memories in a tier with decay scores.',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['semantic', 'episodic', 'session'] }
        },
        required: ['tier']
      },
      handler: async ({ tier }) => {
        const entries = readTier(extDir, tier)
          .map(e => ({ ...e, score: decayScore(1.0, e.lastTouchedAt, e.tier) }))
          .sort((a, b) => b.score - a.score);
        return JSON.stringify({ tier, count: entries.length, entries: entries.slice(0, 50) });
      }
    },
    {
      name: 'memory_compact',
      description: 'Remove stale memories (decay score < 0.05). Does NOT affect semantic tier.',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        let removed = 0;
        for (const tier of ['episodic', 'session']) {
          const entries = readTier(extDir, tier);
          for (const e of entries) {
            if (isStale(e)) {
              deleteTierEntry(extDir, tier, e.id);
              removed++;
            }
          }
        }
        return JSON.stringify({ compacted: true, removed });
      }
    }
  ];
}
