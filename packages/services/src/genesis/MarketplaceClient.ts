// MarketplaceClient — fetches mind templates from the genesis-minds marketplace repo
import { GitHubRegistryClient } from './GitHubRegistryClient';

const MARKETPLACE_SOURCE = 'ianphil/genesis-minds';
const MARKETPLACE_BRANCH = 'master';
const PLUGIN_PATH = 'plugins/genesis-minds/plugin.json';
const MINDS_PREFIX = 'plugins/genesis-minds/minds/';
const TEAMS_PREFIX = 'plugins/genesis-minds/teams/';

export interface MindTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  voice: string;
  role: string;
  tags: string[];
  slug: string;
  /** Full path within the repo, e.g. plugins/genesis-minds/minds/lucy */
  path: string;
  /** The marketplace source this template was fetched from, e.g. "ianphil/genesis-minds" */
  sourceUrl: string;
}

export interface MindTeam {
  id: string;
  name: string;
  version: string;
  description: string;
  members: string[];
  orchestration: string;
  tags: string[];
  chatroom: {
    mode: string;
    welcomeMessage: string;
  };
  /** Full path within the repo, e.g. plugins/genesis-minds/teams/azure-se-team */
  path: string;
  /** The marketplace source this team was fetched from, e.g. "ianphil/genesis-minds" */
  sourceUrl: string;
}

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  minds: string[];
  teams?: string[];
}

export class MarketplaceClient {
  private registryClient: GitHubRegistryClient;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(
    registryClient = new GitHubRegistryClient(),
    source = MARKETPLACE_SOURCE,
    branch = MARKETPLACE_BRANCH,
  ) {
    this.registryClient = registryClient;
    const [owner, repo] = source.split('/');
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Returns the list of available mind templates from the marketplace.
   * Each template includes its metadata and repo path.
   */
  fetchTemplates(): MindTemplate[] {
    const plugin = this.registryClient.fetchJsonContent(
      this.owner, this.repo, PLUGIN_PATH, this.branch,
    ) as PluginManifest;

    const sourceUrl = `${this.owner}/${this.repo}`;
    return plugin.minds.map(mindRelPath => {
      const fullPath = `${MINDS_PREFIX}${mindRelPath.replace(/^minds\//, '')}`;
      const template = this.registryClient.fetchJsonContent(
        this.owner, this.repo, `${fullPath}/template.json`, this.branch,
      ) as MindTemplate;
      return { ...template, path: fullPath, sourceUrl };
    });
  }

  /**
   * Downloads all files for a given template path.
   * Excludes template.json (metadata only) and returns relative paths within the mind directory.
   */
  fetchTemplateFiles(templatePath: string): Array<{ path: string; content: Buffer }> {
    const tree = this.registryClient.fetchTree(this.owner, this.repo, this.branch);
    const prefix = `${templatePath}/`;

    return tree
      .filter(entry => entry.type === 'blob' && entry.path.startsWith(prefix) && !entry.path.endsWith('/template.json'))
      .map(entry => ({
        path: entry.path.slice(prefix.length),
        content: this.registryClient.fetchBlob(this.owner, this.repo, entry.sha),
      }));
  }

  /**
   * Returns the list of available pre-configured teams from the marketplace.
   * Each team includes its metadata, member IDs, and repo path.
   */
  fetchTeams(): MindTeam[] {
    const plugin = this.registryClient.fetchJsonContent(
      this.owner, this.repo, PLUGIN_PATH, this.branch,
    ) as PluginManifest;

    if (!plugin.teams || plugin.teams.length === 0) return [];

    const sourceUrl = `${this.owner}/${this.repo}`;
    return plugin.teams.map(teamRelPath => {
      const fullPath = `${TEAMS_PREFIX}${teamRelPath.replace(/^teams\//, '')}`;
      const team = this.registryClient.fetchJsonContent(
        this.owner, this.repo, `${fullPath}/team.json`, this.branch,
      ) as MindTeam;
      return { ...team, path: fullPath, sourceUrl };
    });
  }
}
