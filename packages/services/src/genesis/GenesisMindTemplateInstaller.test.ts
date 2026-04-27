import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenesisMindTemplateInstaller } from './GenesisMindTemplateInstaller';
import type { TreeEntry } from './GitHubRegistryClient';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

class FakeRegistryClient {
  tree: TreeEntry[] = [];
  json = new Map<string, unknown>();
  blobs = new Map<string, Buffer>();

  fetchTree(): TreeEntry[] {
    return this.tree;
  }

  fetchJsonContent(_owner: string, _repo: string, filePath: string): unknown {
    const content = this.json.get(filePath);
    if (!content) throw new Error(`Missing JSON fixture for ${filePath}`);
    return content;
  }

  fetchBlob(_owner: string, _repo: string, sha: string): Buffer {
    const content = this.blobs.get(sha);
    if (!content) throw new Error(`Missing blob fixture for ${sha}`);
    return content;
  }
}

describe('GenesisMindTemplateInstaller', () => {
  let basePath: string;
  let registryClient: FakeRegistryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    basePath = mkdtempSync(path.join(os.tmpdir(), 'chamber-template-install-'));
    registryClient = new FakeRegistryClient();
    seedLucyMarketplace(registryClient);
  });

  afterEach(() => {
    rmSync(basePath, { recursive: true, force: true });
  });

  it('installs the selected template into the local minds directory', async () => {
    const installer = new GenesisMindTemplateInstaller(registryClient);

    const mindPath = await installer.install({ templateId: 'lucy', basePath });

    expect(mindPath).toBe(path.join(basePath, 'lucy'));
    expect(readFileSync(path.join(mindPath, 'SOUL.md'), 'utf8')).toBe('# Lucy\n');
    expect(readFileSync(path.join(mindPath, '.github', 'agents', 'lucy.agent.md'), 'utf8')).toBe('---\nname: lucy\n---\n');
    expect(readFileSync(path.join(mindPath, '.working-memory', 'memory.md'), 'utf8')).toBe('# Memory\n');
    expect(execSync).toHaveBeenCalledWith('git init', { cwd: mindPath, stdio: 'ignore' });
    expect(execSync).toHaveBeenCalledWith('git add -A', { cwd: mindPath, stdio: 'ignore' });
    expect(execSync).toHaveBeenCalledWith('git commit -m "Genesis template install"', { cwd: mindPath, stdio: 'ignore' });
  });

  it('throws when the installed template fails validation', async () => {
    registryClient.tree = registryClient.tree.filter((entry) => entry.path !== 'plugins/genesis-minds/minds/lucy/.working-memory/log.md');

    const installer = new GenesisMindTemplateInstaller(registryClient);

    await expect(installer.install({ templateId: 'lucy', basePath })).rejects.toThrow('Template lucy is missing required file: .working-memory/log.md');
  });

  it('rejects template roots that would escape the marketplace mind folder', async () => {
    registryClient.json.set('plugins/genesis-minds/minds/lucy/mind.json', {
      ...lucyManifest(),
      root: '..',
    });

    const installer = new GenesisMindTemplateInstaller(registryClient);

    await expect(installer.install({ templateId: 'lucy', basePath })).rejects.toThrow('Template lucy has unsafe root path: ..');
  });

  it('does not create a Copilot client or invoke SDK generation', async () => {
    const installer = new GenesisMindTemplateInstaller(registryClient, {
      createClient: vi.fn(async () => {
        throw new Error('SDK generation should not run');
      }),
      destroyClient: vi.fn(),
    });

    await installer.install({ templateId: 'lucy', basePath });

    expect(installer.clientFactory.createClient).not.toHaveBeenCalled();
  });
});

function seedLucyMarketplace(registryClient: FakeRegistryClient): void {
  registryClient.tree = [
    { path: 'marketplace-config.json', type: 'blob', sha: 'marketplace' },
    { path: 'plugins/genesis-minds/plugin.json', type: 'blob', sha: 'plugin' },
    { path: 'plugins/genesis-minds/agency.json', type: 'blob', sha: 'agency' },
    { path: 'plugins/genesis-minds/minds/lucy/mind.json', type: 'blob', sha: 'manifest' },
    { path: 'plugins/genesis-minds/minds/lucy/SOUL.md', type: 'blob', sha: 'soul' },
    { path: 'plugins/genesis-minds/minds/lucy/mind-index.md', type: 'blob', sha: 'index' },
    { path: 'plugins/genesis-minds/minds/lucy/.github/agents/lucy.agent.md', type: 'blob', sha: 'agent' },
    { path: 'plugins/genesis-minds/minds/lucy/.working-memory/memory.md', type: 'blob', sha: 'memory' },
    { path: 'plugins/genesis-minds/minds/lucy/.working-memory/rules.md', type: 'blob', sha: 'rules' },
    { path: 'plugins/genesis-minds/minds/lucy/.working-memory/log.md', type: 'blob', sha: 'log' },
  ];
  registryClient.json.set('plugins/genesis-minds/plugin.json', {
    name: 'genesis-minds',
    minds: [{ id: 'lucy', manifest: 'minds/lucy/mind.json' }],
  });
  registryClient.json.set('plugins/genesis-minds/minds/lucy/mind.json', lucyManifest());
  registryClient.blobs.set('manifest', Buffer.from(JSON.stringify(lucyManifest(), null, 2)));
  registryClient.blobs.set('soul', Buffer.from('# Lucy\n'));
  registryClient.blobs.set('index', Buffer.from('# Mind Index\n'));
  registryClient.blobs.set('agent', Buffer.from('---\nname: lucy\n---\n'));
  registryClient.blobs.set('memory', Buffer.from('# Memory\n'));
  registryClient.blobs.set('rules', Buffer.from('# Rules\n'));
  registryClient.blobs.set('log', Buffer.from('# Log\n'));
}

function lucyManifest(): Record<string, unknown> {
  return {
    id: 'lucy',
    displayName: 'Lucy',
    description: 'A calm Chief of Staff mind.',
    role: 'Chief of Staff',
    voice: 'Vanilla, calm, helpful, and precise',
    templateVersion: '0.1.0',
    root: '.',
    agent: '.github/agents/lucy.agent.md',
    requiredFiles: [
      'SOUL.md',
      'mind-index.md',
      '.github/agents/lucy.agent.md',
      '.working-memory/memory.md',
      '.working-memory/rules.md',
      '.working-memory/log.md',
    ],
  };
}
