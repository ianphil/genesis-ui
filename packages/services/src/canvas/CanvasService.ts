import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ChamberToolProvider } from '../chamberTools';
import type { Tool } from '../mind/types';
import type { ExternalOpener } from '../ports';
import { CanvasServer } from './CanvasServer';
import { buildCanvasTools } from './tools';
import type {
  CanvasAction,
  CanvasCloseInput,
  CanvasEntry,
  CanvasServerLike,
  CanvasShowInput,
  CanvasUpdateInput,
} from './types';

const CANVAS_DIR = path.join('.chamber', 'canvas');
const VALID_CANVAS_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface CanvasServiceOptions {
  onAction?: (action: CanvasAction) => void;
  openExternal?: ExternalOpener;
  server?: CanvasServerLike;
}

function validateCanvasName(name: string): void {
  if (name === 'all') {
    throw new Error('"all" is reserved for canvas_close and cannot be used as a canvas name');
  }

  if (!VALID_CANVAS_NAME.test(name)) {
    throw new Error(`Invalid canvas name "${name}". Use letters, numbers, dots, underscores, or hyphens.`);
  }
}

function wrapHtml(name: string, html: string, title?: string): string {
  const lowerCaseHtml = html.toLowerCase();
  if (!lowerCaseHtml.includes('<!doctype') && !lowerCaseHtml.includes('<html')) {
    const pageTitle = title ?? name;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
</head>
<body>
${html}
</body>
</html>`;
  }

  if (title && !lowerCaseHtml.includes('<title>')) {
    return html.replace('</head>', `  <title>${title}</title>\n</head>`);
  }

  return html;
}

export class CanvasService implements ChamberToolProvider {
  private readonly mindPaths = new Map<string, string>();
  private readonly canvases = new Map<string, Map<string, CanvasEntry>>();
  private readonly server: CanvasServerLike;
  private readonly openExternal: ExternalOpener;

  constructor(options: CanvasServiceOptions = {}) {
    const onAction = options.onAction ?? ((action: CanvasAction) => {
      console.log('[canvas] Action received:', action);
    });

    this.server = options.server ?? new CanvasServer({
      resolveContentDir: (mindId) => this.getContentDirForMind(mindId),
      onAction,
    });
    this.openExternal = options.openExternal ?? {
      open: () => {
        throw new Error('CanvasService requires an ExternalOpener adapter');
      },
    };
  }

  getToolsForMind(mindId: string, mindPath: string): Tool[] {
    return buildCanvasTools(mindId, mindPath, this) as Tool[];
  }

  async activateMind(mindId: string, mindPath: string): Promise<void> {
    this.ensureMind(mindId, mindPath);
  }

  async releaseMind(mindId: string): Promise<void> {
    this.server.closeClients(mindId);
    this.canvases.delete(mindId);
    this.mindPaths.delete(mindId);
    await this.stopServerIfIdle();
  }

  async showCanvas(mindId: string, mindPath: string, input: CanvasShowInput): Promise<string> {
    validateCanvasName(input.name);
    if (!input.html && !input.file) {
      throw new Error('canvas_show requires either "html" or "file"');
    }

    const contentDir = this.ensureMind(mindId, mindPath);
    const filename = `${input.name}.html`;
    const targetPath = path.join(contentDir, filename);

    if (input.file) {
      if (!path.isAbsolute(input.file)) {
        throw new Error('canvas_show file must be an absolute path');
      }
      if (!fs.existsSync(input.file)) {
        throw new Error(`Canvas source file not found: ${input.file}`);
      }
      fs.copyFileSync(input.file, targetPath);
    } else {
      fs.writeFileSync(targetPath, wrapHtml(input.name, input.html ?? '', input.title), 'utf8');
    }

    const port = await this.server.start();
    const url = this.buildCanvasUrl(mindId, filename, port);
    this.upsertCanvas(mindId, {
      filename,
      name: input.name,
      url,
    });

    if (input.open_browser !== false) {
      await this.openExternal.open(url);
      return `Canvas **${input.name}** is live at ${url} (opened in browser)`;
    }

    return `Canvas **${input.name}** is live at ${url}`;
  }

  updateCanvas(mindId: string, mindPath: string, input: CanvasUpdateInput): string {
    validateCanvasName(input.name);
    const contentDir = this.ensureMind(mindId, mindPath);
    const existing = this.requireCanvas(mindId, input.name);
    fs.writeFileSync(
      path.join(contentDir, existing.filename),
      wrapHtml(input.name, input.html, input.title),
      'utf8',
    );
    this.server.reload(mindId, existing.filename);
    return `Canvas **${input.name}** updated. Browser will auto-reload.`;
  }

  async closeCanvas(mindId: string, mindPath: string, input: CanvasCloseInput): Promise<string> {
    this.ensureMind(mindId, mindPath);
    if (input.name === 'all') {
      return this.closeAllCanvases(mindId);
    }

    validateCanvasName(input.name);
    const existing = this.requireCanvas(mindId, input.name);
    this.server.closeClients(mindId, existing.filename);

    const canvases = this.canvases.get(mindId);
    canvases?.delete(input.name);
    if (canvases && canvases.size === 0) {
      this.canvases.delete(mindId);
    }

    this.deleteCanvasFile(mindId, existing.filename);
    const remaining = this.totalCanvasCount();
    if (remaining === 0) {
      await this.server.stop();
      return `Canvas **${input.name}** closed. Server stopped (no remaining canvases).`;
    }

    return `Canvas **${input.name}** closed. ${remaining} canvas(es) still active.`;
  }

  listCanvases(mindId: string, mindPath: string): string {
    this.ensureMind(mindId, mindPath);
    const canvases = this.canvases.get(mindId);
    if (!canvases || canvases.size === 0) {
      return 'No canvases are open.';
    }

    const lines = [...canvases.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => `- **${entry.name}** - ${entry.url}`);

    const status = this.server.isRunning()
      ? `Server running on port ${this.server.getPort()}`
      : 'Server not running';

    return `${lines.join('\n')}\n\n${status}`;
  }

  private async closeAllCanvases(mindId: string): Promise<string> {
    const canvases = this.canvases.get(mindId);
    if (!canvases || canvases.size === 0) {
      return 'No canvases are open.';
    }

    this.server.closeClients(mindId);
    const count = canvases.size;
    for (const entry of canvases.values()) {
      this.deleteCanvasFile(mindId, entry.filename);
    }
    this.canvases.delete(mindId);

    const remaining = this.totalCanvasCount();
    if (remaining === 0) {
      await this.server.stop();
      return `Closed ${count} canvas(es) and stopped the server.`;
    }

    return `Closed ${count} canvas(es). ${remaining} canvas(es) still active.`;
  }

  private ensureMind(mindId: string, mindPath: string): string {
    this.mindPaths.set(mindId, mindPath);
    const contentDir = path.join(mindPath, CANVAS_DIR);
    fs.mkdirSync(contentDir, { recursive: true });
    return contentDir;
  }

  private requireCanvas(mindId: string, name: string): CanvasEntry {
    const existing = this.canvases.get(mindId)?.get(name);
    if (!existing) {
      throw new Error(`Canvas "${name}" not found. Use canvas_show to create it first.`);
    }
    return existing;
  }

  private getContentDirForMind(mindId: string): string | null {
    const mindPath = this.mindPaths.get(mindId);
    return mindPath ? path.join(mindPath, CANVAS_DIR) : null;
  }

  private upsertCanvas(mindId: string, entry: CanvasEntry): void {
    const canvases = this.canvases.get(mindId) ?? new Map<string, CanvasEntry>();
    canvases.set(entry.name, entry);
    this.canvases.set(mindId, canvases);
  }

  private buildCanvasUrl(mindId: string, filename: string, port: number): string {
    return `http://127.0.0.1:${port}/${encodeURIComponent(mindId)}/${encodeURIComponent(filename)}`;
  }

  private deleteCanvasFile(mindId: string, filename: string): void {
    const contentDir = this.getContentDirForMind(mindId);
    if (!contentDir) {
      return;
    }

    fs.rmSync(path.join(contentDir, filename), { force: true });
  }

  private totalCanvasCount(): number {
    let count = 0;
    for (const canvases of this.canvases.values()) {
      count += canvases.size;
    }
    return count;
  }

  private async stopServerIfIdle(): Promise<void> {
    if (this.totalCanvasCount() === 0 && this.server.isRunning()) {
      await this.server.stop();
    }
  }
}
