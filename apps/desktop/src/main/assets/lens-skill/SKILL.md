---
name: lens
version: 2.0.0
description: Create and manage Chamber Lens views, including structured JSON views and rich Canvas-backed Chamber-native UI. Use when the user asks to create a view, dashboard, panel, report, form, command center, or app-like screen inside Chamber.
---

# Lens — Chamber Views

Create views in `.github/lens/<view-name>/` to add panels to the Chamber activity bar. Lens is the navigation and discovery model. Use the right renderer for the job:

- Use classic JSON Lens views for simple structured data.
- Use Canvas Lens views for rich dashboards, workflows, reports, forms, and app-like UI.

## Creating Views

Prefer the `lens_create` tool whenever it is available. It creates the Lens directory, `view.json`, and source file in one operation, so you do not need shell access or a separate mkdir step.

Example Canvas Lens creation:

```json
{
  "viewId": "cron-jobs",
  "name": "Cron Jobs",
  "icon": "clock",
  "view": "canvas",
  "source": "index.html",
  "content": "<!doctype html><html><body class=\"ch-page\"><section class=\"ch-card\"><h1>Cron Jobs</h1></section></body></html>"
}
```

Example classic JSON Lens creation:

```json
{
  "viewId": "cron-table",
  "name": "Cron Table",
  "icon": "clock",
  "view": "table",
  "source": "data.json",
  "content": [{ "name": "Daily smoke", "status": "enabled" }]
}
```

Only fall back to direct file creation when `lens_create` is not available and the parent directory already exists.

## Canvas Lens Views

Canvas Lens is the preferred renderer for expressive UI. Create an HTML file and a `view.json` manifest:

```json
{
  "name": "Command Center",
  "icon": "layout",
  "view": "canvas",
  "source": "index.html",
  "prompt": "Build a Chamber-native dashboard for the user's current priorities.",
  "refreshOn": "click"
}
```

`source` must be an HTML file inside the same view folder. Chamber renders it in-app inside a sandboxed frame, injects Chamber theme styles, and provides a bridge at `window.canvas`.

### Chamber Design Kit

Use the injected classes so your UI feels native:

- `ch-page` — full page wrapper
- `ch-grid` — responsive card grid
- `ch-card` — Chamber card surface
- `ch-button` — primary button
- `ch-button-secondary` — secondary button
- `ch-input` — text/input control
- `ch-table` — table styling
- `ch-badge` — compact status badge
- `ch-muted` — muted text

Use CSS variables when custom styling is needed:

```css
color: var(--ch-foreground);
background: var(--ch-card);
border-color: var(--ch-border);
accent-color: var(--ch-genesis);
```

Do not hard-code a separate visual theme unless the user explicitly asks. Default to dark Chamber-native UI.

### Canvas Actions

Canvas HTML does not get direct SDK access. Send user intent back to Chamber:

```html
<button class="ch-button" onclick="window.canvas.sendAction('approve', { id: 'task-123' })">
  Approve
</button>
```

Chamber routes actions to the active mind. Use your normal tools and context to satisfy the action, then update the HTML source file if the UI should change.

## Classic JSON Lens Views

Classic views still work well for simple structured data.

```json
{
  "name": "Display Name",
  "icon": "layout",
  "view": "form | table | briefing | detail | status-board | timeline | editor",
  "source": "data.json",
  "prompt": "Optional: what to gather when user clicks Refresh",
  "refreshOn": "click"
}
```

When `prompt` is set, Chamber sends it to you with an output path appended. For classic JSON views, write only valid JSON to that path.

### View Types

- `form` — flat JSON object as key/value rows.
- `briefing` — flat JSON object as card grid.
- `table` — JSON array of objects.
- `detail` — single object detail card.
- `status-board` — array of status objects.
- `timeline` — chronological array.
- `editor` — editable flat object with schema-driven fields.

## Examples

Canvas dashboard:

```html
<!doctype html>
<html>
  <body class="ch-page">
    <section class="ch-grid">
      <article class="ch-card">
        <p class="ch-muted">Top priority</p>
        <h1>Ship Canvas Lens</h1>
        <button class="ch-button" onclick="window.canvas.sendAction('start', { item: 'canvas-lens' })">
          Start
        </button>
      </article>
    </section>
  </body>
</html>
```

Classic briefing:

```json
{
  "name": "Newspaper",
  "icon": "newspaper",
  "view": "briefing",
  "source": "briefing.json",
  "prompt": "Generate a morning briefing. Write a flat JSON object.",
  "refreshOn": "click"
}
```

## Rules

- Keep all Lens files inside `.github/lens/<view-name>/`.
- Never write credentials into Lens files.
- Canvas UI sends intent; the mind uses SDK tools through Chamber.
- Prefer Canvas Lens for rich UI, but keep simple data views as classic JSON Lens.
- Delete the view folder to remove a view from Chamber.
