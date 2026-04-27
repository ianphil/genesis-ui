import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  outExtensions: () => ({ js: '.mjs' }),
});
