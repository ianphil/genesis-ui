// Lens view discovery — scans minds for view.json manifests, reads view data, handles prompt refresh.
// Per-mind storage: views and watchers keyed by mindPath.

import * as fs from 'fs';
import * as path from 'path';
import type { CanvasLensAction, LensViewManifest } from '@chamber/shared/types';
import type { ChamberToolProvider } from '../chamberTools';
import type { Tool } from '../mind/types';
import { Logger } from '../logger';

const log = Logger.create('ViewDiscovery');

const SUPPORTED_LENS_VIEWS = new Set<LensViewManifest['view']>([
  'form',
  'table',
  'briefing',
  'status-board',
  'list',
  'monitor',
  'detail',
  'timeline',
  'editor',
  'canvas',
]);

export interface ViewRefreshHandler {
  sendBackgroundPrompt(mindPath: string, prompt: string): Promise<void>;
}

interface CreateLensViewInput {
  viewId: string;
  name: string;
  icon: string;
  view: LensViewManifest['view'];
  source: string;
  content: unknown;
  prompt?: string;
  refreshOn?: 'click' | 'interval';
  schema?: Record<string, unknown>;
}

export class ViewDiscovery implements ChamberToolProvider {
  private viewsByMind = new Map<string, LensViewManifest[]>();
  private watchersByMind = new Map<string, fs.FSWatcher[]>();
  private scanTimersByMind = new Map<string, ReturnType<typeof setTimeout>>();
  private refreshHandler: ViewRefreshHandler | null = null;

  constructor(refreshHandler?: ViewRefreshHandler) {
    this.refreshHandler = refreshHandler ?? null;
  }

  setRefreshHandler(handler: ViewRefreshHandler): void {
    this.refreshHandler = handler;
  }

  getToolsForMind(_mindId: string, mindPath: string): Tool[] {
    return [{
      name: 'lens_create',
      description: 'Create or replace a Chamber Lens view. Creates the .github/lens/<viewId>/ directory, view.json manifest, and source file in one safe operation.',
      parameters: {
        type: 'object',
        properties: {
          viewId: {
            type: 'string',
            description: 'Directory id for the Lens view. Use lowercase letters, numbers, hyphens, or underscores.',
          },
          name: { type: 'string', description: 'Display name for the Activity Bar tooltip and view header.' },
          icon: { type: 'string', description: 'Lucide icon name, for example layout, table, newspaper, clock, or zap.' },
          view: {
            type: 'string',
            enum: [...SUPPORTED_LENS_VIEWS],
            description: 'Lens renderer type. Use canvas for rich HTML UI.',
          },
          source: {
            type: 'string',
            description: 'Source filename inside the view folder. Canvas views must use an .html file such as index.html.',
          },
          content: {
            description: 'Source file content. For canvas, provide HTML. For classic JSON views, provide a JSON object/array or a JSON string.',
          },
          prompt: { type: 'string', description: 'Optional refresh prompt.' },
          refreshOn: { type: 'string', enum: ['click', 'interval'], description: 'Optional refresh behavior.' },
          schema: { type: 'object', description: 'Optional JSON schema for classic Lens views.' },
        },
        required: ['viewId', 'name', 'icon', 'view', 'source', 'content'],
      },
      handler: async (args) => {
        const view = await this.createView(mindPath, args as unknown as CreateLensViewInput);
        return {
          ok: true,
          view,
          message: `Created Lens view "${view.name}" at .github/lens/${view.id}/.`,
        };
      },
    }] as Tool[];
  }

  async scan(mindPath: string): Promise<LensViewManifest[]> {
    const views: LensViewManifest[] = [];
    const lensDir = path.join(mindPath, '.github', 'lens');

    if (fs.existsSync(lensDir)) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(lensDir, { withFileTypes: true });
      } catch (err) {
        log.warn(`Failed to read ${lensDir}:`, err);
        this.viewsByMind.set(mindPath, views);
        return views;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const viewJsonPath = path.join(lensDir, entry.name, 'view.json');
        if (!fs.existsSync(viewJsonPath)) continue;

        try {
          const raw = fs.readFileSync(viewJsonPath, 'utf-8');
          const basePath = path.join(lensDir, entry.name);
          const manifest = parseLensViewManifest(JSON.parse(raw), entry.name, basePath);
          if (manifest) {
            views.push(manifest);
          } else {
            log.warn(`Skipping invalid Lens manifest ${viewJsonPath}`);
          }
        } catch (err) {
          log.error(`Failed to parse ${viewJsonPath}:`, err);
        }
      }
    }

    this.viewsByMind.set(mindPath, views);
    return views;
  }

  getViews(mindPath?: string): LensViewManifest[] {
    if (mindPath) return this.viewsByMind.get(mindPath) ?? [];
    // Return all views across all minds
    const all: LensViewManifest[] = [];
    for (const views of this.viewsByMind.values()) all.push(...views);
    return all;
  }

  getViewData(viewId: string, mindPath?: string): Record<string, unknown> | null {
    const views = mindPath ? this.getViews(mindPath) : this.getViews();
    const view = views.find(v => v.id === viewId);
    if (!view || !view._basePath) return null;
    if (view.view === 'canvas') return null;

    const dataPath = path.join(view._basePath, view.source);
    if (!fs.existsSync(dataPath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      return isRecord(data) ? data : null;
    } catch {
      return null;
    }
  }

  getViewSourcePath(viewId: string, mindPath: string): string | null {
    const view = this.getViews(mindPath).find(v => v.id === viewId);
    if (!view || !view._basePath) return null;
    return path.join(view._basePath, view.source);
  }

  async createView(mindPath: string, input: CreateLensViewInput): Promise<LensViewManifest> {
    const viewId = parseViewId(input.viewId);
    const source = parseSource(input.source, input.view);
    if (typeof input.name !== 'string' || input.name.trim() === '') {
      throw new Error('lens_create requires a non-empty name');
    }
    if (typeof input.icon !== 'string' || input.icon.trim() === '') {
      throw new Error('lens_create requires a non-empty icon');
    }
    if (!isLensViewType(input.view)) {
      throw new Error(`Unsupported Lens view type: ${String(input.view)}`);
    }

    const lensDir = path.join(mindPath, '.github', 'lens');
    const viewDir = path.join(lensDir, viewId);
    fs.mkdirSync(viewDir, { recursive: true });

    const manifest = {
      name: input.name,
      icon: input.icon,
      view: input.view,
      source,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.refreshOn ? { refreshOn: input.refreshOn } : {}),
      ...(input.schema ? { schema: input.schema } : {}),
    };

    fs.writeFileSync(path.join(viewDir, 'view.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(viewDir, source), formatSourceContent(input.content, input.view), 'utf-8');

    await this.scan(mindPath);
    return this.getViews(mindPath).find(view => view.id === viewId)
      ?? parseLensViewManifest(manifest, viewId, viewDir)
      ?? {
        ...manifest,
        id: viewId,
        _basePath: viewDir,
      };
  }

  async refreshView(viewId: string, mindPath: string): Promise<Record<string, unknown> | null> {
    const views = this.getViews(mindPath);
    const view = views.find(v => v.id === viewId);
    if (!view || !view.prompt || !view._basePath) return this.getViewData(viewId, mindPath);

    const dataPath = path.join(view._basePath, view.source);
    const outputInstruction = view.view === 'canvas'
      ? `Write the Chamber-branded HTML output to: ${dataPath}`
      : `Write the JSON output to: ${dataPath}`;
    const fullPrompt = `${view.prompt}\n\n${outputInstruction}`;

    try {
      await this.refreshHandler?.sendBackgroundPrompt(mindPath, fullPrompt);
      return this.getViewData(viewId, mindPath);
    } catch {
      return this.getViewData(viewId, mindPath);
    }
  }

  async sendAction(viewId: string, action: string, mindPath: string): Promise<Record<string, unknown> | null> {
    const views = this.getViews(mindPath);
    const view = views.find(v => v.id === viewId);
    if (!view || !view._basePath) return this.getViewData(viewId, mindPath);

    const dataPath = path.join(view._basePath, view.source);
    const fullPrompt = `The user is viewing "${view.name}" (source: ${dataPath}).\n\nAction requested: ${action}\n\nMake the requested change and write the updated JSON to: ${dataPath}`;

    try {
      await this.refreshHandler?.sendBackgroundPrompt(mindPath, fullPrompt);
      return this.getViewData(viewId, mindPath);
    } catch {
      return this.getViewData(viewId, mindPath);
    }
  }

  async sendCanvasAction(viewId: string, action: CanvasLensAction, mindPath: string): Promise<void> {
    const views = this.getViews(mindPath);
    const view = views.find(v => v.id === viewId);
    if (!view || view.view !== 'canvas' || !view._basePath) return;

    const sourcePath = path.join(view._basePath, view.source);
    const fullPrompt = [
      `The user interacted with the Canvas Lens view "${view.name}" (source: ${sourcePath}).`,
      '',
      `Action: ${action.action}`,
      action.intent ? `Intent: ${action.intent}` : null,
      action.correlationId ? `Correlation ID: ${action.correlationId}` : null,
      `Data: ${JSON.stringify(action.data ?? {})}`,
      '',
      'Use your normal Chamber tools and context to satisfy the action. If the UI should change, update the Canvas Lens HTML source file at the path above.',
    ].filter((line): line is string => line !== null).join('\n');

    await this.refreshHandler?.sendBackgroundPrompt(mindPath, fullPrompt);
  }

  startWatching(mindPath: string, onChanged: () => void): void {
    this.stopWatching(mindPath);
    const lensDir = path.join(mindPath, '.github', 'lens');

    if (fs.existsSync(lensDir)) {
      this.watchLensDir(mindPath, lensDir, onChanged);
    } else {
      // lens/ doesn't exist yet — watch .github/ for its creation
      const githubDir = path.join(mindPath, '.github');
      if (!fs.existsSync(githubDir)) return;

      const watchers: fs.FSWatcher[] = [];
      try {
        const parentWatcher = fs.watch(githubDir, (_eventType, filename) => {
          if (filename === 'lens' && fs.existsSync(lensDir)) {
            parentWatcher.close();
            this.watchLensDir(mindPath, lensDir, onChanged);
            this.scheduleScan(mindPath, onChanged);
          }
        });
        watchers.push(parentWatcher);
      } catch { /* watch not supported */ }
      this.watchersByMind.set(mindPath, watchers);
    }
  }

  private watchLensDir(mindPath: string, lensDir: string, onChanged: () => void): void {
    const watchers: fs.FSWatcher[] = [];
    try {
      const watcher = fs.watch(lensDir, { recursive: true }, (_eventType, filename) => {
        if (filename) this.scheduleScan(mindPath, onChanged);
      });
      watchers.push(watcher);
    } catch { /* watch not supported */ }
    this.watchersByMind.set(mindPath, watchers);
  }

  private scheduleScan(mindPath: string, onChanged: () => void): void {
    const existingTimer = this.scanTimersByMind.get(mindPath);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.scanTimersByMind.delete(mindPath);
      void this.scan(mindPath).then(onChanged).catch((err: unknown) => {
        log.warn(`Failed to rescan lens views for ${mindPath}:`, err);
      });
    }, 300);
    this.scanTimersByMind.set(mindPath, timer);
  }

  stopWatching(mindPath?: string): void {
    if (mindPath) {
      const watchers = this.watchersByMind.get(mindPath) ?? [];
      for (const w of watchers) w.close();
      this.watchersByMind.delete(mindPath);
      const timer = this.scanTimersByMind.get(mindPath);
      if (timer) clearTimeout(timer);
      this.scanTimersByMind.delete(mindPath);
    } else {
      for (const watchers of this.watchersByMind.values()) {
        for (const w of watchers) w.close();
      }
      this.watchersByMind.clear();
      for (const timer of this.scanTimersByMind.values()) clearTimeout(timer);
      this.scanTimersByMind.clear();
    }
  }

  removeMind(mindPath: string): void {
    this.stopWatching(mindPath);
    this.viewsByMind.delete(mindPath);
  }
}

function parseLensViewManifest(value: unknown, id: string, basePath: string): LensViewManifest | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== 'string' || typeof value.icon !== 'string') return null;
  if (!isLensViewType(value.view)) return null;
  if (!isSafeRelativeSource(value.source)) return null;
  if (value.view === 'canvas' && !isHtmlSource(value.source)) return null;

  return {
    ...value,
    id,
    name: value.name,
    icon: value.icon,
    view: value.view,
    source: value.source,
    _basePath: basePath,
  };
}

function isLensViewType(value: unknown): value is LensViewManifest['view'] {
  return typeof value === 'string' && SUPPORTED_LENS_VIEWS.has(value as LensViewManifest['view']);
}

function isSafeRelativeSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/).includes('..');
}

function isHtmlSource(value: string): boolean {
  return path.extname(value).toLowerCase() === '.html';
}

function parseViewId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    throw new Error('lens_create viewId must use letters, numbers, hyphens, or underscores');
  }
  return value;
}

function parseSource(value: unknown, view: LensViewManifest['view']): string {
  if (!isSafeRelativeSource(value)) {
    throw new Error('lens_create source must be a safe relative filename');
  }
  if (view === 'canvas' && !isHtmlSource(value)) {
    throw new Error('Canvas Lens sources must be .html files');
  }
  return value;
}

function formatSourceContent(content: unknown, view: LensViewManifest['view']): string {
  if (typeof content === 'string') {
    return content.endsWith('\n') ? content : `${content}\n`;
  }
  if (view === 'canvas') {
    throw new Error('Canvas Lens content must be an HTML string');
  }
  return `${JSON.stringify(content, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
