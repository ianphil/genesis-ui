export interface GenesisMindTemplateSource {
  owner: string;
  repo: string;
  ref: string;
  plugin: string;
  manifestPath: string;
  rootPath: string;
}

export interface GenesisMindTemplate {
  id: string;
  displayName: string;
  description: string;
  role: string;
  voice: string;
  templateVersion: string;
  agent: string;
  requiredFiles: string[];
  source: GenesisMindTemplateSource;
}

export interface GenesisMindTemplateMarketplaceSource {
  owner: string;
  repo: string;
  ref: string;
  plugin: string;
}
