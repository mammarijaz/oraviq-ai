import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The owner app: Vue 3 SPA, installable as a PWA. Port 5173.
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/sw.ts): precache + web push (incl. Declarative Web Push payloads).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Oraviq AI',
        short_name: 'Oraviq',
        description: 'The AI front desk and unified inbox for your dumpster rental business.',
        id: '/',
        start_url: '/inbox',
        scope: '/',
        display: 'standalone',
        background_color: '#FAFAFA',
        theme_color: '#40454D',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/oraviq-app-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
});
