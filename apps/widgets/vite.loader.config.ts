import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The embed loader: one small IIFE served as /w.js. Built after the iframe apps (does not empty dist).
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/loader.ts'), name: 'OraviqWidgetsLoader', formats: ['iife'], fileName: () => 'w.js' },
    minify: 'esbuild',
  },
});
