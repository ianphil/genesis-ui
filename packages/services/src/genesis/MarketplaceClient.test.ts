import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubRegistryClient } from './GitHubRegistryClient';
import { MarketplaceClient } from './MarketplaceClient';

describe('MarketplaceClient', () => {
  const fakeExec = vi.fn();
  let registryClient: GitHubRegistryClient;
  let client: MarketplaceClient;

  const makePluginManifest = () => ({
    id: 'genesis-minds',
    name: 'Genesis Minds',
    version: '1.0.0',
    description: 'Test',
    minds: ['minds/lucy', 'minds/maple'],
  });

  const makeLucyTemplate = () => ({
    id: 'lucy',
    name: 'Lucy',
    version: '1.0.0',
    description: 'Flagship mind',
    voice: 'Lucy',
    role: 'Chief of Staff',
    tags: ['chief-of-staff'],
    slug: 'lucy',
  });

  const makeMapleTemplate = () => ({
    id: 'maple',
    name: 'Maple',
    version: '1.0.0',
    description: 'Research partner',
    voice: 'Maple',
    role: 'Research Partner',
    tags: ['research'],
    slug: 'maple',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    registryClient = new GitHubRegistryClient(fakeExec);
    client = new MarketplaceClient(registryClient, 'ianphil/genesis-minds', 'master');
  });

  describe('fetchTemplates', () => {
    it('fetches plugin manifest and returns templates with resolved paths', () => {
      fakeExec
        // plugin.json
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makePluginManifest())).toString('base64'),
        }))
        // lucy template.json
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makeLucyTemplate())).toString('base64'),
        }))
        // maple template.json
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makeMapleTemplate())).toString('base64'),
        }));

      const templates = client.fetchTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0].id).toBe('lucy');
      expect(templates[0].path).toBe('plugins/genesis-minds/minds/lucy');
      expect(templates[1].id).toBe('maple');
      expect(templates[1].path).toBe('plugins/genesis-minds/minds/maple');
    });

    it('includes all template fields plus resolved path', () => {
      fakeExec
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makePluginManifest())).toString('base64'),
        }))
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makeLucyTemplate())).toString('base64'),
        }))
        .mockReturnValueOnce(JSON.stringify({
          content: Buffer.from(JSON.stringify(makeMapleTemplate())).toString('base64'),
        }));

      const [lucy] = client.fetchTemplates();
      expect(lucy.name).toBe('Lucy');
      expect(lucy.role).toBe('Chief of Staff');
      expect(lucy.slug).toBe('lucy');
      expect(lucy.tags).toContain('chief-of-staff');
    });
  });

  describe('fetchTemplateFiles', () => {
    const makeTree = () => ({
      tree: [
        { path: 'plugins/genesis-minds/minds/lucy/template.json', type: 'blob', sha: 'sha-template' },
        { path: 'plugins/genesis-minds/minds/lucy/SOUL.md', type: 'blob', sha: 'sha-soul' },
        { path: 'plugins/genesis-minds/minds/lucy/.github/agents/lucy.agent.md', type: 'blob', sha: 'sha-agent' },
        { path: 'plugins/genesis-minds/minds/lucy/.working-memory/memory.md', type: 'blob', sha: 'sha-memory' },
        { path: 'plugins/genesis-minds/minds/maple/SOUL.md', type: 'blob', sha: 'sha-maple-soul' },
      ],
    });

    it('returns files under the template path with stripped prefix', () => {
      // fetchTree call
      fakeExec.mockReturnValueOnce(JSON.stringify(makeTree()));
      // fetchBlob calls for SOUL.md, agent.md, memory.md (3 files, template.json excluded)
      fakeExec.mockReturnValue(JSON.stringify({
        content: Buffer.from('file content').toString('base64'),
        encoding: 'base64',
      }));

      const files = client.fetchTemplateFiles('plugins/genesis-minds/minds/lucy');

      expect(files).toHaveLength(3);
      expect(files.map(f => f.path)).toContain('SOUL.md');
      expect(files.map(f => f.path)).toContain('.github/agents/lucy.agent.md');
      expect(files.map(f => f.path)).toContain('.working-memory/memory.md');
    });

    it('excludes template.json from returned files', () => {
      fakeExec.mockReturnValueOnce(JSON.stringify(makeTree()));
      fakeExec.mockReturnValue(JSON.stringify({
        content: Buffer.from('content').toString('base64'),
        encoding: 'base64',
      }));

      const files = client.fetchTemplateFiles('plugins/genesis-minds/minds/lucy');
      expect(files.map(f => f.path)).not.toContain('template.json');
    });

    it('excludes files from other mind directories', () => {
      fakeExec.mockReturnValueOnce(JSON.stringify(makeTree()));
      fakeExec.mockReturnValue(JSON.stringify({
        content: Buffer.from('content').toString('base64'),
        encoding: 'base64',
      }));

      const files = client.fetchTemplateFiles('plugins/genesis-minds/minds/lucy');
      expect(files.map(f => f.path).some(p => p.includes('maple'))).toBe(false);
    });

    it('excludes tree entries with type other than blob', () => {
      fakeExec.mockReturnValueOnce(JSON.stringify({
        tree: [
          { path: 'plugins/genesis-minds/minds/lucy', type: 'tree', sha: 'sha-dir' },
          { path: 'plugins/genesis-minds/minds/lucy/SOUL.md', type: 'blob', sha: 'sha-soul' },
        ],
      }));
      fakeExec.mockReturnValue(JSON.stringify({
        content: Buffer.from('soul content').toString('base64'),
        encoding: 'base64',
      }));

      const files = client.fetchTemplateFiles('plugins/genesis-minds/minds/lucy');
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('SOUL.md');
    });
  });

  describe('constructor', () => {
    it('accepts injected registry client and custom source', () => {
      const customClient = new MarketplaceClient(registryClient, 'myorg/my-minds', 'main');
      expect(customClient).toBeDefined();
    });
  });
});
