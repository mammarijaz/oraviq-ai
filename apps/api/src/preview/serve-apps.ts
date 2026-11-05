import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';

/**
 * One-origin test deployment (render.preview.yaml): the API also serves the owner app at /,
 * the widgets at /widgets and proxies the hauler site (Astro, a second process) at /site.
 * Off unless SERVE_WEB_DIR / SERVE_WIDGETS_DIR / SITES_UPSTREAM are set. Production uses
 * separate services (render.yaml) and never sets these.
 *
 * Call before configureApp(): these responses skip the API's helmet headers, because the widgets
 * must stay embeddable on other sites and the SPA and Astro pages bring their own.
 */
export function serveApps(app: NestExpressApplication): string[] {
  const served: string[] = [];
  const isApi = (p: string) => p === '/api' || p.startsWith('/api/') || p.startsWith('/socket.io');

  const sites = process.env.SITES_UPSTREAM?.trim();
  if (sites) {
    const upstream = new URL(sites);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path !== '/site' && !req.path.startsWith('/site/')) return next();
      const up = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          method: req.method,
          path: req.originalUrl,
          headers: { ...req.headers, 'x-forwarded-host': req.headers.host, 'x-forwarded-proto': req.protocol },
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      up.on('error', () => {
        if (!res.headersSent) res.status(502).type('text/plain').send('The hauler site is still starting. Try again in a few seconds.');
        else res.end();
      });
      req.pipe(up);
    });
    served.push(`/site → ${upstream.origin}`);
  }

  const widgets = dir(process.env.SERVE_WIDGETS_DIR);
  if (widgets) {
    // w.js changes with every deploy and is not content-hashed: keep it short-cached.
    app.useStaticAssets(widgets, {
      prefix: '/widgets/',
      setHeaders: (res, path) => res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300'),
    });
    served.push('/widgets');
  }

  const web = dir(process.env.SERVE_WEB_DIR);
  if (web) {
    app.useStaticAssets(web, {
      setHeaders: (res, path) => res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
    // SPA fallback: any other page navigation gets the owner app's index.html.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi(req.path) || req.path.startsWith('/widgets') || req.path.startsWith('/site')) return next();
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(web, 'index.html'));
    });
    served.push('/ (owner app)');
  }
  return served;
}

function dir(p: string | undefined): string | null {
  if (!p?.trim()) return null;
  const abs = resolve(p.trim());
  if (!existsSync(join(abs, 'index.html'))) throw new Error(`Nothing to serve at ${abs} (no index.html). Build the app first.`);
  return abs;
}
