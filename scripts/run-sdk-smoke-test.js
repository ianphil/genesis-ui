const path = require('node:path');
const { spawnSync } = require('node:child_process');

const vitestBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
);

const result = spawnSync(
  vitestBin,
  ['run', 'src/main/integration/sdk-session.smoke.test.ts'],
  {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: {
      ...process.env,
      CHAMBER_REAL_SDK_SMOKE: '1',
    },
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
