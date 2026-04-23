// Runtime globals injected by @electron-forge/plugin-vite.
// We declare them directly here instead of using `/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />`
// because that ambient reference transitively imports from the plugin's source `.ts` under node_modules,
// which TS 6 (moduleResolution: bundler) type-checks and fails on a vite typings mismatch.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
