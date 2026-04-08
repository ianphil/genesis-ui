/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const targetDir = path.join(repoRoot, 'resources', 'node');
const markerPath = path.join(targetDir, 'version.txt');

function readNvmrcVersion() {
  try {
    const content = fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf-8').trim();
    if (content) return content;
  } catch {
    // ignore
  }
  return '20';
}

function resolveVersion() {
  const raw = process.env.GENESIS_NODE_VERSION || readNvmrcVersion();
  if (/^\d+$/.test(raw)) {
    return `${raw}.19.2`;
  }
  return raw.replace(/^v/, '');
}

function resolveDist(version) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  switch (process.platform) {
    case 'win32':
      return { dist: `node-v${version}-win-${arch}`, ext: 'zip' };
    case 'darwin':
      return { dist: `node-v${version}-darwin-${arch}`, ext: 'tar.gz' };
    case 'linux':
      return { dist: `node-v${version}-linux-${arch}`, ext: 'tar.gz' };
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyIntegrity(filePath, version, filename) {
  const shasumsUrl = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`;
  console.log(`Fetching checksums from ${shasumsUrl}`);
  const shasums = await downloadText(shasumsUrl);

  const expectedLine = shasums.split('\n').find((line) => line.includes(filename));
  if (!expectedLine) {
    throw new Error(`Could not find checksum for ${filename} in SHASUMS256.txt`);
  }
  const expectedHash = expectedLine.trim().split(/\s+/)[0];

  console.log('Verifying download integrity...');
  const actualHash = await computeFileHash(filePath);

  if (actualHash !== expectedHash) {
    throw new Error(
      `Integrity check failed for ${filename}.\n` +
      `  Expected: ${expectedHash}\n` +
      `  Actual:   ${actualHash}`
    );
  }
  console.log('Integrity check passed.');
}

async function main() {
  const version = resolveVersion();
  const { dist, ext } = resolveDist(version);
  const nodeBinary = process.platform === 'win32'
    ? path.join(targetDir, 'node.exe')
    : path.join(targetDir, 'bin', 'node');

  if (fs.existsSync(markerPath) && fs.existsSync(nodeBinary)) {
    const existing = fs.readFileSync(markerPath, 'utf-8').trim();
    if (existing === version) {
      console.log(`Bundled Node runtime already present (v${version}).`);
      return;
    }
  }

  const url = `https://nodejs.org/dist/v${version}/${dist}.${ext}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-node-'));
  try {
    const archivePath = path.join(tempDir, `${dist}.${ext}`);

    console.log(`Downloading ${url}`);
    await downloadFile(url, archivePath);

    const archiveFilename = `${dist}.${ext}`;
    await verifyIntegrity(archivePath, version, archiveFilename);

    console.log('Extracting Node runtime...');
    if (ext === 'zip') {
      runCommand('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${tempDir}" -Force`,
      ]);
    } else {
      runCommand('tar', ['-xzf', archivePath, '-C', tempDir]);
    }

    const extractedDir = path.join(tempDir, dist);
    if (!fs.existsSync(extractedDir)) {
      throw new Error(`Extracted Node directory not found: ${extractedDir}`);
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    try {
      fs.renameSync(extractedDir, targetDir);
    } catch (error) {
      if (error && error.code === 'EXDEV') {
        fs.cpSync(extractedDir, targetDir, { recursive: true });
        fs.rmSync(extractedDir, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
    fs.writeFileSync(markerPath, version, 'utf-8');

    console.log(`Bundled Node runtime ready at ${targetDir}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
