// Exponential temporal decay: relevance(t) = e^(-ln(2) * age_days / half_life)
// Semantic: no decay (infinite half-life)
// Episodic: 7-day half-life
// Session: 1-day half-life

const HALF_LIFE = { semantic: Infinity, episodic: 7, session: 1 };

export function decayScore(baseScore, lastTouchedAt, tier) {
  const halfLife = HALF_LIFE[tier] ?? 7;
  if (!Number.isFinite(halfLife)) return baseScore;
  const ageDays = (Date.now() - new Date(lastTouchedAt).getTime()) / (1000 * 60 * 60 * 24);
  return baseScore * Math.exp(-Math.LN2 * ageDays / halfLife);
}

export function isStale(entry) {
  return decayScore(1.0, entry.lastTouchedAt, entry.tier) < 0.05;
}
