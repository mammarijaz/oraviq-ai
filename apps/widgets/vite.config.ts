import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';

// The two iframe apps (chat, booking) plus a demo host page for local development.
/** Dev only: serve the loader at /w.js as a classic script, compiled from src/loader.ts on each request. */
const devLoader = (): Plugin => ({
  name: 'oraviq-dev-loader',
  configureServer(server) {
    server.middlewares.use('/w.js', async (_req, res) => {
      const r = await server.transformRequest('/src/loader.ts');
      res.setHeader('content-type', 'text/javascript');
      res.end((r?.code ?? '').replace(/^\/\/# sourceMappingURL=.*$/m, ''));
    });
  },
});

export default defineConfig({
  // WIDGETS_BASE=/widgets/ when the widgets are served from a sub-path (the one-origin test deployment).
  base: process.env.WIDGETS_BASE ?? '/',
  plugins: [devLoader()],
  server: { port: 5175, host: true },
  preview: { port: 5175 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        chat: resolve(__dirname, 'chat.html'),
        book: resolve(__dirname, 'book.html'),
        demo: resolve(__dirname, 'index.html'),
      },
    },
  },
});
