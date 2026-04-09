---
name: lens
description: Create and manage Lens views — declarative UI panels that appear in the Genesis UI activity bar. Use when the user asks to "create a view", "show me X in the UI", "add a dashboard", "make a panel for", or wants to visualize data, config, or status in the desktop app.
---

# Lens — Declarative UI Views

Create `view.json` manifests in `.github/lens/<view-name>/` to add views to the Genesis UI activity bar.

## Creating a View

1. Create `.github/lens/<view-name>/view.json`
2. The UI discovers it automatically — a new icon appears
3. For prompt-driven views, you write the data file when the user clicks Refresh

## view.json Reference

```json
{
  "name": "Display Name",
  "icon": "lucide-icon-name",
  "view": "form | table | briefing",
  "source": "data.json",
  "prompt": "Optional: what to gather when user clicks Refresh",
  "refreshOn": "click"
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name in tooltip and header |
| `icon` | Yes | Lucide icon: `zap`, `newspaper`, `users`, `clock`, `settings`, `layout` |
| `view` | Yes | `form` (key-value), `table` (rows), or `briefing` (card grid) |
| `source` | Yes | Data filename, relative to view folder |
| `prompt` | No | Prompt sent to you on Refresh. Describe what data to gather. |
| `refreshOn` | No | `"click"` — manual refresh only |
| `schema` | No | JSON Schema for field/column labels |

## View Types

### `form` — Key-Value Pairs
Data: flat JSON object. Each key becomes a row.
```json
{ "agent": "Q", "status": "Online", "extensions": 5 }
```

### `briefing` — Card Grid  
Data: flat JSON object. Numbers render large, strings render normal.
```json
{ "inbox_items": 12, "initiatives": 3, "top_priority": "Ship Lens" }
```

### `table` — Data Table
Data: JSON array of objects. Each object is a row.
```json
[
  { "name": "Kent", "role": "PM" },
  { "name": "Michael", "role": "SWE" }
]
```

For table column headers, use `schema.items.properties`:
```json
{
  "schema": {
    "items": {
      "properties": {
        "name": { "type": "string", "title": "Name" },
        "role": { "type": "string", "title": "Role" }
      }
    }
  }
}
```

## Prompt-Driven Views

When `prompt` is set, the UI sends the prompt to you with the output path appended. You gather data and write ONLY valid JSON to that path. No markdown, no explanation — just the JSON.

## Static Views

When `prompt` is not set, the `source` file must already exist. Create it alongside the `view.json`. The UI re-reads it when the file changes on disk.

## Deleting a View

Delete the folder from `.github/lens/`. The UI removes the icon automatically.

## Examples

Quick status view:
```json
{
  "name": "Status",
  "icon": "zap",
  "view": "form",
  "source": "data.json",
  "prompt": "Report your name, mind path, extension count, and model. Write as flat JSON.",
  "refreshOn": "click"
}
```

Contacts table (static):
```json
{
  "name": "Contacts",
  "icon": "users",
  "view": "table",
  "source": "contacts.json",
  "schema": { "items": { "properties": { "name": { "title": "Name" }, "url": { "title": "URL" } } } }
}
```
