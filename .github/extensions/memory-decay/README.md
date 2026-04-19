# Memory Decay Extension

3-tier temporal memory system inspired by Genesis, with exponential decay.

## Memory Tiers

| Tier | Half-Life | Purpose |
|------|-----------|---------|
| Semantic | ∞ (never decays) | Permanent facts: user identity, preferences, contacts |
| Episodic | 7 days | Daily events: conversations, decisions, meeting notes |
| Session | 1 day | Task context: current work state, checkpoints |

## Decay Algorithm

```
relevance(t) = e^(-ln(2) × age_days / half_life)
```

At half-life, score = 0.5. At 2× half-life, score = 0.25. Entries below 0.05 are eligible for compaction.

`memory_touch` resets the decay timer (mimics human rehearsal — frequently recalled memories stay fresh).

## Tools

| Tool | Description |
|------|-------------|
| `memory_remember` | Store a new memory (specify tier + content + tags) |
| `memory_recall` | Search across tiers with decay-weighted ranking |
| `memory_touch` | Refresh a memory (reset decay timer) |
| `memory_list` | List memories in a tier with scores |
| `memory_compact` | Remove stale entries (score < 0.05) |
