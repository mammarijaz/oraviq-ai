import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Server-rendered hauler sites. One deployment serves every tenant: the Host header picks the tenant.
// Cloudflare caches the HTML in front; the API purges a tenant's URLs when prices, zones or reviews change.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321, host: true },
  security: { checkOrigin: true },
});
