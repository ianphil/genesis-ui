---
name: feedback
description: Self-learning feedback system. Tracks user behavior patterns (dismissals, corrections) and adapts Lucy's behavior. Use when user teaches Lucy a preference, dismisses signals repeatedly, or asks Lucy to change behavior.
---

# Feedback / Self-Learning Skill

## Purpose
Lucy learns from user behavior to improve over time:
- Track what signals get dismissed (pattern detection)
- Accept explicit teaching ("ignore emails from X")
- Adapt scanning and triage based on learned preferences

## How to Execute

### Pattern Detection
When a user dismisses a signal:
1. Note the sender, source, and topic
2. Check if 3+ signals from the same sender have been dismissed
3. If pattern detected, ask: "I noticed you've dismissed several messages from {sender}. Should I stop surfacing these?"
4. If yes: save as semantic memory: `memory_remember tier=semantic content="[Preference] Ignore signals from {sender}" tags=preference,filter`

### Explicit Teaching
When user says things like "ignore X" or "stop showing Y":
1. Acknowledge the preference
2. Save to semantic memory: `memory_remember tier=semantic content="[Preference] {what user said}" tags=preference,user-taught`
3. Confirm: "Got it — I'll remember that."

### Behavior Adaptation
Before each scan, check semantic memories with tag "preference":
```
memory_recall query="preference" tier=semantic
```
Apply any filtering rules found in preferences to scan results.

## Guidelines
- Only ask about patterns after 3+ occurrences (not too eager)
- Maximum 1 feedback popup per 10 minutes (not annoying)
- All preferences are reversible (user can say "actually, show those again")
- Be transparent: "I'm ignoring X because you told me to on [date]"
