import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import * as fs from 'fs';
import { IdentityLoader } from './IdentityLoader';

describe('IdentityLoader', () => {
  const loader = new IdentityLoader();
  beforeEach(() => vi.clearAllMocks());

  describe('load', () => {
    it('returns null when mindPath is null', () => {
      expect(loader.load(null)).toBeNull();
    });

    it('returns MindIdentity with name and systemMessage', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# Q\nI am an agent.');
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      const result = loader.load('/tmp/test');
      expect(result).toEqual({
        name: 'Q',
        systemMessage: '# Q\nI am an agent.',
      });
    });

    it('extracts name from first H1 heading', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# My Agent Name\nSome content\n# Another heading');
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(loader.load('/tmp/test')?.name).toBe('My Agent Name');
    });

    it('falls back to folder name when no H1 exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('No heading here, just content.');
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(loader.load('/tmp/agents/fox')?.name).toBe('fox');
    });

    it('strips "— Soul" suffix from name', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# The Dude — Soul\nContent');
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(loader.load('/tmp/agents/dude')?.name).toBe('The Dude');
    });

    it('includes agent file content in systemMessage', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('# Soul')
        .mockReturnValueOnce('---\nname: test\n---\nInstructions');
      (vi.mocked(fs.readdirSync) as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(['main.agent.md']);
      const result = loader.load('/tmp/test');
      expect(result?.systemMessage).toContain('Instructions');
      expect(result?.systemMessage).not.toContain('name: test');
    });

    it('returns null when nothing exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(loader.load('/tmp/test')).toBeNull();
    });
  });
});
