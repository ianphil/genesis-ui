---
name: dig-deep
description: Deep investigation of a signal — finds full thread context, related memories, and drafts a copy-pastable reply. Use when user clicks "dig deep" on a signal or asks to investigate a specific email/Teams message in detail.
---

# Dig Deep Skill

## Purpose
When a user wants to understand a signal deeply:
1. Search working memory for related context
2. Query WorkIQ for the full email/Teams thread
3. Identify all participants and what's being discussed
4. Draft a professional, copy-pastable reply

## How to Execute

### Step 1: Identify the signal
Ask the user which signal to dig into, or use the one they specified.

### Step 2: Search memory
Use `memory_recall` (from memory-decay extension) to find related memories:
```
memory_recall query="{signal title} {signal sender}"
```

### Step 3: Get thread context via WorkIQ
```
workiq ask -q "Find the full conversation thread for the email/Teams message from {sender} about '{title}'. Include all replies, participants, decisions made, and action items. Be thorough."
```

### Step 4: Draft reply
Based on the thread context, draft a professional reply:
- Under 150 words
- Warm but direct tone
- Reference specific details from the thread
- Include clear next steps
- Ready to copy-paste into Outlook or Teams

### Step 5: Present results
Format the output as:

```
## 🔍 Deep Context: {signal title}

### 🧠 Memory Context
{related memories from recall, or "No prior context found"}

### 📧 Thread Context
{full thread summary from WorkIQ}

### ✏️ Suggested Reply
---
{copy-pastable reply text}
---

💡 Copy the reply above and paste into {Outlook/Teams}.
```

### Step 6: Save to memory
Use `memory_remember` to save this dig-deep as an episodic memory:
```
memory_remember tier=episodic content="[Dig Deep] Investigated '{title}' from {sender}. Key finding: {one-sentence summary}" tags=dig-deep,{source}
```
