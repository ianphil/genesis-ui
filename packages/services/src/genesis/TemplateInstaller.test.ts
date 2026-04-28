import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process (used by initGit / bootstrapCapabilities)
vi.mock('child_process', () => ({ execSync: vi.fn() }));

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({
    version: '0.0.0',
    source: 'ianphil/genesis',
    channel: 'main',
    extensions: {},
    skills: {},
    prompts: {},
    packages: [],
  })),
}));

import * as fs from 'fs';
import { execSync } from 'child_process';
import { TemplateInstaller } from './TemplateInstaller';
import type { MarketplaceClient } from './MarketplaceClient';
import type { GitHubRegistryClient } from './GitHubRegistryClient';

const makeLucyTemplate = () => ({
  id: 'lucy',
  name: 'Lucy',
  version: '1.0.0',
  description: 'Flagship mind',
  voice: 'Lucy',
  role: 'Chief of Staff',
  tags: ['chief-of-staff'],
  slug: 'lucy',
  path: 'plugins/genesis-minds/minds/lucy',
});

const makeFakeMarketplace = (templates = [makeLucyTemplate()]): MarketplaceClient => ({
  fetchTemplates: vi.fn(() => templates),
  fetchTemplateFiles: vi.fn(() => [
    { path: 'SOUL.md', content: Buffer.from('# SOUL') },
    { path: '.github/agents/lucy.agent.md', content: Buffer.from('---\nname: lucy\n---') },
    { path: '.working-memory/memory.md', content: Buffer.from('# Memory') },
    { path: '.working-memory/rules.md', content: Buffer.from('# Rules') },
    { path: '.working-memory/log.md', content: Buffer.from('# Log') },
    { path: 'mind-index.md', content: Buffer.from('# Index') },
  ]),
} as unknown as MarketplaceClient);

const makeFakeRegistry = (): GitHubRegistryClient => ({
  fetchTree: vi.fn(() => [
    { path: '.github/skills/upgrade/upgrade.js', type: 'blob', sha: 'sha-upgrade' },
  ]),
  fetchBlob: vi.fn(() => Buffer.from('upgrade script')),
  fetchJsonContent: vi.fn(() => ({
    skills: { upgrade: { version: '1.2.3', description: 'Upgrade skill' } },
  })),
} as unknown as GitHubRegistryClient);

describe('TemplateInstaller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      version: '0.0.0',
      source: 'ianphil/genesis',
      channel: 'main',
      extensions: {},
      skills: {},
      prompts: {},
      packages: [],
    }));
  });

  describe('install — happy path', () => {
    it('returns the mind path on success', async () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      const result = await installer.install({ templateId: 'lucy', basePath: '/agents' });
      expect(result).toContain('lucy');
    });

    it('writes all template files to the mind directory', async () => {
      const marketplace = makeFakeMarketplace();
      const installer = new TemplateInstaller(marketplace, makeFakeRegistry());
      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      const writtenPaths = vi.mocked(fs.writeFileSync).mock.calls.map(([p]) => String(p));
      expect(writtenPaths.some(p => p.includes('SOUL.md'))).toBe(true);
      expect(writtenPaths.some(p => p.includes('lucy.agent.md'))).toBe(true);
      expect(writtenPaths.some(p => p.includes('memory.md'))).toBe(true);
    });

    it('creates IDEA folders', async () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls.map(([p]) => String(p));
      expect(mkdirCalls.some(p => p.includes('inbox'))).toBe(true);
      expect(mkdirCalls.some(p => p.includes('domains'))).toBe(true);
      expect(mkdirCalls.some(p => p.includes('Archive'))).toBe(true);
    });

    it('runs git init in the mind directory', async () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      const execCalls = vi.mocked(execSync).mock.calls.map(([cmd]) => String(cmd));
      expect(execCalls.some(cmd => cmd === 'git init')).toBe(true);
      expect(execCalls.some(cmd => cmd.includes('Genesis: install from marketplace'))).toBe(true);
    });

    it('pulls the upgrade skill from genesis', async () => {
      const registry = makeFakeRegistry();
      const installer = new TemplateInstaller(makeFakeMarketplace(), registry);
      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      expect(registry.fetchTree).toHaveBeenCalledWith('ianphil', 'genesis', 'main');
      expect(registry.fetchBlob).toHaveBeenCalledWith('ianphil', 'genesis', 'sha-upgrade');
    });

    it('records upgrade skill version in local registry', async () => {
      const registry = makeFakeRegistry();
      const installer = new TemplateInstaller(makeFakeMarketplace(), registry);
      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      const writtenContents = vi.mocked(fs.writeFileSync).mock.calls
        .map(([, content]) => String(content))
        .filter(c => c.includes('"upgrade"'));
      expect(writtenContents.length).toBeGreaterThan(0);
      expect(writtenContents.some(c => c.includes('"1.2.3"'))).toBe(true);
    });

    it('emits progress events through the handler', async () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      const progressSteps: string[] = [];
      installer.setProgressHandler(({ step }) => progressSteps.push(step));

      await installer.install({ templateId: 'lucy', basePath: '/agents' });

      expect(progressSteps).toContain('structure');
      expect(progressSteps).toContain('soul');
      expect(progressSteps).toContain('validate');
      expect(progressSteps).toContain('git');
      expect(progressSteps).toContain('complete');
    });
  });

  describe('install — error cases', () => {
    it('throws when the requested templateId is not found in marketplace', async () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      await expect(
        installer.install({ templateId: 'nonexistent', basePath: '/agents' }),
      ).rejects.toThrow('not found in marketplace');
    });

    it('throws when SOUL.md is missing after file write', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      await expect(
        installer.install({ templateId: 'lucy', basePath: '/agents' }),
      ).rejects.toThrow('missing SOUL.md');
    });
  });

  describe('custom mind path still uses MindScaffold, not TemplateInstaller', () => {
    it('TemplateInstaller has no create() method (wrong type guards enforce path separation)', () => {
      const installer = new TemplateInstaller(makeFakeMarketplace(), makeFakeRegistry());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((installer as any).create).toBeUndefined();
    });
  });
});
