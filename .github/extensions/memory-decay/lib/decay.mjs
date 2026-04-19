// Exponential temporal decay: relevance(t) = e^(-ln(2) * age_days / half_life)
// Semantic: no decay (infinite half-life)
// Episodic: 7-day half-life
// Session: 1-day half-life

const HALF_LIFE = { semantic: Infinity, episodic: 7, session: 1 };

export function decayScore(baseScore, lastTouchedAt, tier) {
  const halfLife = HALF_LIFE[tier] ?? 7;
  if (!Number.isFinite(halfLife)) return baseScore;
  const touchedMs = new Date(lastTouchedAt).getTime();
  if (Number.isNaN(touchedMs)) return 0; // invalid date → treat as fully decayed
  const ageDays = Math.max(0, (Date.now() - touchedMs) / (1000 * 60 * 60 * 24));
  return Math.min(baseScore, baseScore * Math.exp(-Math.LN2 * ageDays / halfLife));
}

export function isStale(entry) {
  if (!entry?.lastTouchedAt) return true; // missing timestamp → stale
  return decayScore(1.0, entry.lastTouchedAt, entry.tier) < 0.05;
}
