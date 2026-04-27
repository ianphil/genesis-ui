import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cdpPort = Number(process.env.CHAMBER_E2E_CDP_PORT ?? 9333);
const cdpUrl = process.env.CHAMBER_E2E_CDP_URL ?? `http://127.0.0.1:${cdpPort}`;
const logs: string[] = [];

test.describe('electron app boot', () => {
  test.setTimeout(180_000);

  let child: ChildProcessWithoutNullStreams | undefined;
  let browser: Browser | undefined;

  test.beforeAll(async () => {
    if (!process.env.CHAMBER_E2E_CDP_URL) {
      child = spawnNpmStart({
        cwd: repoRoot,
        env: {
          ...process.env,
          CHAMBER_DISABLE_SINGLE_INSTANCE_LOCK: '1',
          CHAMBER_E2E: '1',
          CHAMBER_E2E_CDP_PORT: String(cdpPort),
        },
        windowsHide: true,
      });
      child.stdout.on('data', (chunk) => logs.push(String(chunk)));
      child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    }

    await waitForCdp(cdpUrl);
    browser = await chromium.connectOverCDP(cdpUrl);
  });

  test.afterAll(async () => {
    await browser?.close();
    if (child && !child.killed) {
      child.kill();
    }
  });

  test('exposes preload bridges and renders non-empty content', async () => {
    const page = await findRendererPage(browser);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#root')).not.toBeEmpty();

    await expect(page.evaluate(() => typeof window.electronAPI)).resolves.toBe('object');
    await expect(page.evaluate(() => typeof window.desktop)).resolves.toBe('object');
    expect(logs.join('\n')).not.toMatch(/Pre-transform error|Cannot assign to read only property|Failed to load url/i);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});

function spawnNpmStart(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  windowsHide: boolean;
}): ChildProcessWithoutNullStreams {
  const command = 'npm start';
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], options);
  }
  return spawn('sh', ['-lc', command], options);
}

async function waitForCdp(url: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) return;
    } catch {
      // Keep polling until Electron enables the debugging endpoint.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Electron CDP endpoint at ${url}.\n${logsPreview()}`);
}

async function findRendererPage(browser: Browser | undefined): Promise<Page> {
  if (!browser) throw new Error('Browser was not connected.');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /localhost|127\.0\.0\.1/.test(candidate.url()));
      if (page) return page;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron renderer page.\n${logsPreview()}`);
}

function logsPreview(): string {
  return logs.slice(-80).join('\n');
}
