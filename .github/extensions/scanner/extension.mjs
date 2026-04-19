// Scanner Extension — M365 signal scanner via WorkIQ
// Scans email + Teams periodically, extracts actionable signals, deduplicates

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIGNALS_PATH = join(__dirname, 'data', 'signals.json');

export function getSignals() {
  if (!existsSync(SIGNALS_PATH)) return [];
  try { return JSON.parse(readFileSync(SIGNALS_PATH, 'utf-8')); } catch { return []; }
}

export function saveSignals(signals) {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  writeFileSync(SIGNALS_PATH, JSON.stringify(signals, null, 2));
}

// Composite dedup key: title + sender + source to avoid false matches
export function deduplicateSignals(newSignals, existing) {
  const key = s => `${s.title?.toLowerCase()}|${s.sender?.toLowerCase()}|${s.source}`;
  const existingKeys = new Set(existing.map(key));
  return newSignals.filter(s => !existingKeys.has(key(s)));
}
