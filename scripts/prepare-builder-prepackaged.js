/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const prepackagedDir = path.join(repoRoot, 'out', 'Chamber-win32-x64');
const resourcesDir = path.join(prepackagedDir, 'resources');
const appUpdatePath = path.join(resourcesDir, 'app-update.yml');

function requireDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Expected directory to exist: ${dir}`);
  }
}

function resolveAppUpdateConfig() {
  const genericUrl = process.env.CHAMBER_BUILDER_UPDATE_URL?.trim();
  if (genericUrl) {
    return [
      'provider: generic',
      `url: ${genericUrl}`,
      'updaterCacheDirName: chamber-updater',
      '',
    ].join('\n');
  }

  return [
    'provider: github',
    'owner: ianphil',
    'repo: chamber',
    'updaterCacheDirName: chamber-updater',
    '',
  ].join('\n');
}

requireDir(prepackagedDir);
requireDir(resourcesDir);

fs.writeFileSync(appUpdatePath, resolveAppUpdateConfig(), 'utf8');
console.log(`Wrote ${path.relative(repoRoot, appUpdatePath)}`);
