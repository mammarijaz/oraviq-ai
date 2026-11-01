import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// `pnpm --filter @oraviq/ui dev` runs `vite playground --port 5174`, so this file is the config.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: { port: 5174, strictPort: true, host: true, fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
});
