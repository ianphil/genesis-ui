import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const enableMacOSSigning = process.platform === 'darwin' && process.env.ENABLE_MACOS_SIGNING === 'true';
const enableMacOSNotarization =
  enableMacOSSigning &&
  Boolean(process.env.APPLE_ID) &&
  Boolean(process.env.APPLE_ID_PASSWORD) &&
  Boolean(process.env.APPLE_TEAM_ID);

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'genesis-ui',
    extraResource: ['./resources/node'],
    ...(enableMacOSSigning
      ? {
          osxSign: {},
          ...(enableMacOSNotarization
            ? {
                osxNotarize: {
                  appleId: process.env.APPLE_ID!,
                  appleIdPassword: process.env.APPLE_ID_PASSWORD!,
                  teamId: process.env.APPLE_TEAM_ID!,
                },
              }
            : {}),
        }
      : {}),
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'ianphil',
          name: 'genesis-ui',
        },
        prerelease: false,
        draft: false,
      },
    },
  ],
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'genesis-ui',
      shortcutName: 'Genesis UI',
    }),
    new MakerZIP({}, ['darwin', 'linux']),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
