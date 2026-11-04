import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { env } from './config/env';

/** HTTP setup shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean; logger?: boolean } = {}): void {
  const e = env();
  if (opts.logger !== false) app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const allow = new Set([e.WEB_URL, e.WIDGETS_URL].map((u) => u.replace(/\/$/, '')));
  // Authenticated routes: the owner app and widgets origins. /public: any origin (widgets on hauler sites).
  app.enableCors((req: { url?: string; headers: Record<string, string | undefined> }, cb: (err: Error | null, o: object) => void) => {
    const origin = req.headers.origin;
    const isPublic = (req.url ?? '').startsWith('/api/v1/public');
    cb(null, {
      origin: isPublic ? true : !origin || allow.has(origin) ? origin ?? false : false,
      credentials: !isPublic,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      maxAge: 600,
    });
  });
  app.enableShutdownHooks();
  // API docs: always in development; in production only when ENABLE_SWAGGER=true.
  if (opts.swagger !== false && (!e.isProduction || e.ENABLE_SWAGGER)) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Oraviq API')
        .setDescription('The AI front desk and unified inbox for dumpster rental companies. Contract: docs/api-contract.md; types: @oraviq/shared.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
}
