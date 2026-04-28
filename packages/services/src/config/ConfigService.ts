import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateMindId } from '../mind';
import type { AppConfig, AppConfigV1, MindRecord } from '@chamber/shared/types';

const CONFIG_DIR = path.join(os.homedir(), '.chamber');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = { version: 2, minds: [], activeMindId: null, activeLogin: null, theme: 'dark', marketplaceSources: [] };

export class ConfigService {
  /** @deprecated Use generateMindId() from mind/generateMindId instead */
  static generateMindId = generateMindId;

  private readonly configDir: string;
  private readonly configPath: string;

  constructor(configDir = process.env.CHAMBER_E2E_USER_DATA ?? CONFIG_DIR) {
    this.configDir = configDir;
    this.configPath = configDir === CONFIG_DIR ? CONFIG_PATH : path.join(configDir, 'config.json');
  }

  load(): AppConfig {
    try {
      const data = fs.readFileSync(this.configPath, 'utf-8');
      const raw = JSON.parse(data);
      return this.normalize(raw);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  save(config: AppConfig): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private normalize(raw: Record<string, unknown>): AppConfig {
    if (raw.version === 2) {
      return this.normalizeV2(raw);
    }
    return this.migrateV1(raw as unknown as AppConfigV1);
  }

  private normalizeV2(raw: Record<string, unknown>): AppConfig {
    const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system'
      ? raw.theme
      : 'dark';
    const minds = Array.isArray(raw.minds) ? raw.minds as MindRecord[] : [];
    const marketplaceSources = Array.isArray(raw.marketplaceSources) ? raw.marketplaceSources : [];
    return this.deduplicateMinds({
      version: 2,
      minds,
      activeMindId: typeof raw.activeMindId === 'string' ? raw.activeMindId : null,
      activeLogin: typeof raw.activeLogin === 'string' ? raw.activeLogin : null,
      theme,
      marketplaceSources,
    });
  }

  private migrateV1(v1: AppConfigV1): AppConfig {
    if (!v1.mindPath) {
      return { ...DEFAULT_CONFIG, theme: v1.theme ?? 'dark' };
    }
    const id = ConfigService.generateMindId(v1.mindPath);
    return {
      version: 2,
      minds: [{ id, path: v1.mindPath }],
      activeMindId: id,
      activeLogin: null,
      theme: v1.theme ?? 'dark',
      marketplaceSources: [],
    };
  }

  private deduplicateMinds(config: AppConfig): AppConfig {
    const seen = new Set<string>();
    const deduped: MindRecord[] = [];
    for (const mind of config.minds) {
      if (!seen.has(mind.path)) {
        seen.add(mind.path);
        deduped.push(mind);
      }
    }
    return { ...config, minds: deduped };
  }
}
