import { describe, it, expect } from 'vitest';
import { MindScaffold } from './MindScaffold';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { CopilotClientFactory } from '../sdk/CopilotClientFactory';
import type { GitHubRegistryClient } from './GitHubRegistryClient';

describe('MindScaffold.slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(MindScaffold.slugify('My Agent')).toBe('my-agent');
  });

  it('strips special characters', () => {
    expect(MindScaffold.slugify('Hello World!')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(MindScaffold.slugify('--test--')).toBe('test');
  });

  it('collapses consecutive hyphens', () => {
    expect(MindScaffold.slugify('a---b')).toBe('a-b');
  });

  it('strips non-ascii characters', () => {
    expect(MindScaffold.slugify('café ☕')).toBe('caf');
  });

  it('returns empty string for empty input', () => {
    expect(MindScaffold.slugify('')).toBe('');
  });

  it('handles all-special-char input', () => {
    expect(MindScaffold.slugify('!@#$%')).toBe('');
  });

  it('caps the slug at 40 characters', () => {
    const long = 'a'.repeat(60);
    expect(MindScaffold.slugify(long)).toHaveLength(40);
  });

  it('trims trailing hyphens left by truncation', () => {
    // 39 a's + ' z' → 'a*39-z' (41 chars) → slice(0,40) lands a trailing dash
    // that should be cleaned up so we don't ship a path ending in '-'.
    expect(MindScaffold.slugify('a'.repeat(39) + ' z')).toBe('a'.repeat(39));
  });
});

describe('MindScaffold.create', () => {
  it('throws when the target mind directory already exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chamber-mindscaffold-'));
    try {
      const slug = MindScaffold.slugify('Existing Mind');
      fs.mkdirSync(path.join(tmpDir, slug), { recursive: true });

      const scaffold = new MindScaffold(
        {} as unknown as GitHubRegistryClient,
        {} as unknown as CopilotClientFactory,
      );

      await expect(
        scaffold.create({
          name: 'Existing Mind',
          role: 'tester',
          voice: 'plain',
          voiceDescription: 'plain',
          basePath: tmpDir,
        }),
      ).rejects.toThrow(/already exists/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('MindScaffold.getDefaultBasePath', () => {
  it('returns homedir/agents', () => {
    expect(MindScaffold.getDefaultBasePath()).toBe(path.join(os.homedir(), 'agents'));
  });
});

describe('MindScaffold constructor', () => {
  it('accepts an injected CopilotClientFactory', () => {
    const fakeFactory = { createClient: async () => ({}), destroyClient: async () => { /* noop */ } } as unknown as CopilotClientFactory;
    const scaffold = new MindScaffold(undefined, fakeFactory);
    expect(scaffold).toBeDefined();
  });
});
