/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match?.[1]) {
      args.set(match[1], match[2] ?? '');
    }
  }
  return args;
}

function readManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const version = raw.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const url = raw.match(/^  - url:\s*(.+)$/m)?.[1]?.trim();
  const sha512 = raw.match(/^    sha512:\s*(.+)$/m)?.[1]?.trim();
  const sizeText = raw.match(/^    size:\s*(\d+)$/m)?.[1]?.trim();

  if (!version || !url || !sha512 || !sizeText) {
    throw new Error(`Invalid update manifest: ${manifestPath}`);
  }

  return {
    version: version.replace(/^['"]|['"]$/g, ''),
    url: url.replace(/^['"]|['"]$/g, ''),
    sha512: sha512.replace(/^['"]|['"]$/g, ''),
    size: Number(sizeText),
  };
}

function computeSha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function assertSigned(filePath) {
  if (process.platform !== 'win32') {
    throw new Error('Windows signature validation must run on Windows.');
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    `$sig = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(filePath)}`,
    '$sig | Select-Object Status, StatusMessage, @{Name="Subject";Expression={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`Authenticode validation failed:\n${result.stdout}${result.stderr}`.trim());
  }

  const signature = JSON.parse(result.stdout);
  if (signature.Status !== 0 && signature.Status !== 'Valid') {
    throw new Error(
      `Expected a valid Authenticode signature for ${filePath}; got ${signature.Status}: ${signature.StatusMessage}`,
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifactsDir = path.resolve(repoRoot, args.get('artifacts-dir') ?? 'out/builder');
  const expectedVersion = args.get('version') ?? require(path.join(repoRoot, 'package.json')).version;
  const manifestPath = path.join(artifactsDir, 'latest.yml');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing update manifest: ${manifestPath}`);
  }

  const manifest = readManifest(manifestPath);
  if (manifest.version !== expectedVersion) {
    throw new Error(`Manifest version mismatch. Expected ${expectedVersion}, found ${manifest.version}.`);
  }

  const installerPath = path.join(artifactsDir, manifest.url);
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Manifest references missing installer: ${installerPath}`);
  }

  const installerStat = fs.statSync(installerPath);
  if (installerStat.size !== manifest.size) {
    throw new Error(
      `Installer size mismatch. Manifest=${manifest.size}, actual=${installerStat.size}.`,
    );
  }

  const actualSha512 = computeSha512Base64(installerPath);
  if (actualSha512 !== manifest.sha512) {
    throw new Error('Installer SHA-512 does not match latest.yml.');
  }

  const blockmapPath = `${installerPath}.blockmap`;
  if (!fs.existsSync(blockmapPath)) {
    throw new Error(`Missing installer blockmap: ${blockmapPath}`);
  }

  if (process.env.CHAMBER_REQUIRE_WINDOWS_SIGNATURE === 'true') {
    assertSigned(installerPath);
  }

  console.log(`Validated electron-builder release artifacts for ${expectedVersion}.`);
}

main();
