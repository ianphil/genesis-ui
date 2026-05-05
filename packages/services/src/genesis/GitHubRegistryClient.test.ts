import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubRegistryClient } from './GitHubRegistryClient';

describe('GitHubRegistryClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: GitHubRegistryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubRegistryClient({ fetch: fetchMock });
  });

  describe('fetchTree', () => {
    it('fetches the GitHub REST tree endpoint without requiring gh', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ tree: [] }));

      await client.fetchTree('ianphil', 'genesis', 'main');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/ianphil/genesis/git/trees/main?recursive=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github+json',
            'User-Agent': expect.any(String),
          }),
        }),
      );
    });

    it('returns parsed tree entries', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        tree: [{ path: '.github/skills/upgrade/SKILL.md', type: 'blob', sha: 'abc123' }],
      }));

      const result = await client.fetchTree('ianphil', 'genesis', 'main');

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('abc123');
    });

    it('falls back to stored credentials when anonymous access fails', async () => {
      client = new GitHubRegistryClient({
        fetch: fetchMock,
        credentialProvider: async () => [{ login: 'ianphil_microsoft', token: 'secret-token' }],
      });
      fetchMock
        .mockResolvedValueOnce(new Response('not found', { status: 404, statusText: 'Not Found' }))
        .mockResolvedValueOnce(jsonResponse({ tree: [] }));

      await client.fetchTree('agency-microsoft', 'genesis-minds', 'main');

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://api.github.com/repos/agency-microsoft/genesis-minds/git/trees/main?recursive=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer secret-token',
          }),
        }),
      );
    });
  });

  describe('fetchBlob', () => {
    it('decodes base64 content', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        content: Buffer.from('Hello World').toString('base64'),
        encoding: 'base64',
      }));

      const content = await client.fetchBlob('ianphil', 'genesis', 'abc123');

      expect(content.toString()).toBe('Hello World');
    });
  });

  describe('fetchJsonContent', () => {
    it('fetches and parses JSON from repo contents API', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        content: Buffer.from(JSON.stringify({ version: '1.0.0' })).toString('base64'),
      }));

      const result = await client.fetchJsonContent('ianphil', 'genesis', '.github/registry.json', 'main');

      expect(result).toEqual({ version: '1.0.0' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/ianphil/genesis/contents/.github/registry.json?ref=main',
        expect.any(Object),
      );
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
