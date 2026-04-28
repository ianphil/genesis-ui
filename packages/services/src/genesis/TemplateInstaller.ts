// TemplateInstaller — installs a canonical mind template from the marketplace into a local directory.
// Unlike MindScaffold.create(), no SDK session is required — files are downloaded deterministically.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { MarketplaceClient } from './MarketplaceClient';
import { GitHubRegistryClient } from './GitHubRegistryClient';
import type { GenesisProgress } from './MindScaffold';

const GENESIS_SOURCE = 'ianphil/genesis';
const GENESIS_CHANNEL = 'main';
const IDEA_FOLDERS = ['inbox', 'domains', 'expertise', 'initiatives', 'Archive'];

export interface TemplateInstallConfig {
  templateId: string;
  basePath: string;
}

export interface TemplateInstallResult {
  success: boolean;
  mindPath?: string;
  error?: string;
}

export class TemplateInstaller {
  private onProgress?: (progress: GenesisProgress) => void;
  private marketplaceClient: MarketplaceClient;
  private registryClient: GitHubRegistryClient;

  constructor(
    marketplaceClient = new MarketplaceClient(),
    registryClient = new GitHubRegistryClient(),
  ) {
    this.marketplaceClient = marketplaceClient;
    this.registryClient = registryClient;
  }

  setProgressHandler(handler: (progress: GenesisProgress) => void): void {
    this.onProgress = handler;
  }

  private emit(step: string, detail: string): void {
    this.onProgress?.({ step, detail });
  }

  static getDefaultBasePath(): string {
    return path.join(os.homedir(), 'agents');
  }

  async install(config: TemplateInstallConfig): Promise<string> {
    // 1. Resolve template metadata
    this.emit('structure', 'Fetching template from marketplace...');
    const templates = this.marketplaceClient.fetchTemplates();
    const template = templates.find(t => t.id === config.templateId);
    if (!template) {
      throw new Error(`Template "${config.templateId}" not found in marketplace`);
    }

    const mindPath = path.join(config.basePath, template.slug);

    // 2. Download and write all template files
    this.emit('soul', `Installing ${template.name}...`);
    const files = this.marketplaceClient.fetchTemplateFiles(template.path);
    for (const file of files) {
      const localPath = path.join(mindPath, file.path);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, file.content);
    }

    // 3. Ensure IDEA folders exist (may not be in template tree)
    for (const folder of IDEA_FOLDERS) {
      fs.mkdirSync(path.join(mindPath, folder), { recursive: true });
    }

    // 4. Validate
    this.emit('validate', 'Validating...');
    if (!fs.existsSync(path.join(mindPath, 'SOUL.md'))) {
      throw new Error(`Template "${config.templateId}" is missing SOUL.md`);
    }

    // 5. Git init
    this.emit('git', 'Initializing...');
    this.initGit(mindPath);

    // 6. Bootstrap capabilities (best-effort — mind works without them)
    this.emit('capabilities', 'Installing capabilities...');
    try {
      this.bootstrapCapabilities(mindPath);
    } catch (err) {
      console.warn('[TemplateInstaller] Capability bootstrap failed (non-fatal):', err);
      this.emit('capabilities', 'Capabilities install failed — run "upgrade from genesis" later.');
    }

    this.emit('complete', 'Installation complete.');
    return mindPath;
  }

  private initGit(mindPath: string): void {
    try {
      execSync('git init', { cwd: mindPath, stdio: 'ignore' });
      execSync('git add -A', { cwd: mindPath, stdio: 'ignore' });
      execSync('git commit -m "Genesis: install from marketplace"', { cwd: mindPath, stdio: 'ignore' });
    } catch (err) {
      console.error('[TemplateInstaller] Git init failed:', err);
    }
  }

  private bootstrapCapabilities(mindPath: string): void {
    const registryPath = path.join(mindPath, '.github', 'registry.json');

    // Seed registry if the template didn't include one
    if (!fs.existsSync(registryPath)) {
      this.emit('capabilities', 'Seeding registry...');
      const seed = {
        version: '0.0.0',
        source: GENESIS_SOURCE,
        channel: GENESIS_CHANNEL,
        extensions: {},
        skills: {},
        prompts: {},
        packages: [],
      };
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, JSON.stringify(seed, null, 2) + '\n');
    }

    // Pull upgrade skill (the bootloader that enables self-upgrade)
    this.emit('capabilities', 'Pulling upgrade skill...');
    const [owner, repo] = GENESIS_SOURCE.split('/');
    const upgradePrefix = '.github/skills/upgrade/';

    const treeEntries = this.registryClient.fetchTree(owner, repo, GENESIS_CHANNEL);
    const upgradeFiles = treeEntries.filter(e => e.type === 'blob' && e.path.startsWith(upgradePrefix));

    if (upgradeFiles.length === 0) {
      throw new Error('Upgrade skill not found in genesis repo');
    }

    for (const file of upgradeFiles) {
      const content = this.registryClient.fetchBlob(owner, repo, file.sha);
      const localPath = path.join(mindPath, file.path);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, content);
    }

    // Record upgrade skill version in local registry
    const remoteRegistry = this.registryClient.fetchJsonContent(
      owner, repo, '.github/registry.json', GENESIS_CHANNEL,
    ) as { skills?: Record<string, { version?: string; description?: string }> };
    const upgradeInfo = remoteRegistry.skills?.upgrade;

    const localReg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    localReg.skills.upgrade = {
      version: upgradeInfo?.version || '0.0.0',
      path: '.github/skills/upgrade',
      description: upgradeInfo?.description || 'Pull updates from genesis template registry',
    };
    fs.writeFileSync(registryPath, JSON.stringify(localReg, null, 2) + '\n');

    // Commit the bootstrapped capabilities
    try {
      execSync('git add -A', { cwd: mindPath, stdio: 'ignore' });
      execSync('git commit -m "feat: bootstrap capabilities from genesis"', { cwd: mindPath, stdio: 'ignore' });
    } catch {
      // Nothing to commit — harmless
    }
  }
}
