import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockApp,
  mockExistsSync,
  mockGetLocalNodeModulesDir,
  mockIsLocalInstallReady,
} = vi.hoisted(() => ({
  mockApp: { isPackaged: false },
  mockExistsSync: vi.fn(),
  mockGetLocalNodeModulesDir: vi.fn(() => 'C:\\local\\node_modules'),
  mockIsLocalInstallReady: vi.fn(() => false),
}));

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('./SdkBootstrap', () => ({
  getLocalNodeModulesDir: mockGetLocalNodeModulesDir,
  isLocalInstallReady: mockIsLocalInstallReady,
}));

import { resolveNodeModulesDir } from './sdkPaths';

describe('resolveNodeModulesDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp.isPackaged = false;
    mockGetLocalNodeModulesDir.mockReturnValue('C:\\local\\node_modules');
    mockIsLocalInstallReady.mockReturnValue(false);
    mockExistsSync.mockReturnValue(false);
    vi.spyOn(process, 'cwd').mockReturnValue('C:\\src\\chamber');
  });

  it('prefers the project node_modules in dev mode', () => {
    mockExistsSync.mockImplementation((candidate) =>
      String(candidate) === 'C:\\src\\chamber\\node_modules\\@github\\copilot-sdk\\package.json');

    expect(resolveNodeModulesDir()).toBe('C:\\src\\chamber\\node_modules');
  });

  it('throws in dev mode when the project install is missing', () => {
    expect(() => resolveNodeModulesDir()).toThrow(
      'Chamber requires the repo-local @github/copilot-sdk install in dev mode. Run: npm install',
    );
  });

  it('uses the packaged bootstrap install when available', () => {
    mockApp.isPackaged = true;
    mockIsLocalInstallReady.mockReturnValue(true);

    expect(resolveNodeModulesDir()).toBe('C:\\local\\node_modules');
  });

  it('throws in packaged mode when the app-managed install is missing', () => {
    mockApp.isPackaged = true;

    expect(() => resolveNodeModulesDir()).toThrow(
      'Chamber could not find its packaged Copilot SDK install. Reinstall the app or complete first-run setup.',
    );
  });
});
