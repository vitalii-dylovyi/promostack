import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { calculate } from '@promostack/engine';
import type { Basket, Promotion, Strategy } from '@promostack/engine';
import * as db from './db.ts';
import * as schemas from './schemas.ts';

export interface AppOptions {
  dbFile?: string;
  /** When set, creating, updating and deleting promotions requires the `x-api-key` header. */
  adminKey?: string;
  logger?: boolean;
}

const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp(opts: AppOptions = {}) {
  const store = db.openDb(opts.dbFile);
  const app = Fastify({ logger: opts.logger ?? false, ajv: { customOptions: { discriminator: true } } });

  await app.register(swagger, {
    openapi: { info: { title: 'PromoStack API', version: '0.1.0', description: 'Promotion calculation service' } },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  for (const s of [schemas.target, schemas.line, schemas.basket, schemas.promotion]) app.addSchema(s);

  const adminOnly = async (req: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => {
    if (opts.adminKey && req.headers['x-api-key'] !== opts.adminKey) reply.code(401).send({ error: 'invalid or missing x-api-key' });
  };

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/api/products', { schema: { tags: ['catalog'] } }, async () => db.listProducts(store));

  app.get('/api/promotions', { schema: { tags: ['promotions'] } }, async () => db.listPromotions(store));

  app.get<{ Params: { id: string } }>('/api/promotions/:id', { schema: { tags: ['promotions'] } }, async (req, reply) => {
    return db.getPromotion(store, req.params.id) ?? reply.code(404).send({ error: 'not found' });
  });

  app.post<{ Body: Promotion }>(
    '/api/promotions',
    { preHandler: adminOnly, schema: { tags: ['promotions'], body: { $ref: 'Promotion#' } } },
    async (req, reply) => {
      if (db.getPromotion(store, req.body.id)) return reply.code(409).send({ error: `promotion ${req.body.id} already exists` });
      db.savePromotion(store, req.body);
      return reply.code(201).send(req.body);
    },
  );

  app.put<{ Params: { id: string }; Body: Promotion }>(
    '/api/promotions/:id',
    { preHandler: adminOnly, schema: { tags: ['promotions'], body: { $ref: 'Promotion#' } } },
    async (req, reply) => {
      if (req.body.id !== req.params.id) return reply.code(400).send({ error: 'id in body must match the URL' });
      if (!db.getPromotion(store, req.params.id)) return reply.code(404).send({ error: 'not found' });
      db.savePromotion(store, req.body);
      return req.body;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/promotions/:id',
    { preHandler: adminOnly, schema: { tags: ['promotions'] } },
    async (req, reply) => (db.deletePromotion(store, req.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'not found' })),
  );

  const calcBody = {
    type: 'object',
    additionalProperties: false,
    required: ['basket'],
    properties: {
      basket: { $ref: 'Basket#' },
      strategy: schemas.strategy,
      /** What-if mode: calculate against these promotions instead of the stored ones. Not logged. */
      promotions: { type: 'array', items: { $ref: 'Promotion#' }, maxItems: 200 },
    },
  } as const;

  app.post<{ Body: { basket: Basket; strategy?: Strategy; promotions?: Promotion[] } }>(
    '/api/calculate',
    { schema: { tags: ['calculation'], body: calcBody } },
    async (req) => {
      const { basket, strategy, promotions } = req.body;
      const result = calculate(basket, promotions ?? db.listPromotions(store), { strategy });
      const calculationId = promotions ? null : Number(db.logCalculation(store, req.body, basket.channel, result));
      return { calculationId, ...result };
    },
  );

  app.post<{ Body: { basket: Basket; promotions?: Promotion[] } }>(
    '/api/compare',
    { schema: { tags: ['calculation'], body: { ...calcBody, properties: { basket: calcBody.properties.basket, promotions: calcBody.properties.promotions } } } },
    async (req) => {
      const promotions = req.body.promotions ?? db.listPromotions(store);
      return Object.fromEntries(
        (['priority', 'greedy', 'optimal'] as const).map((strategy) => [strategy, calculate(req.body.basket, promotions, { strategy })]),
      );
    },
  );

  app.get<{ Querystring: { limit?: number } }>(
    '/api/calculations',
    { schema: { tags: ['audit'], querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 } } } } },
    async (req) => db.listCalculations(store, req.query.limit ?? 50),
  );

  if (existsSync(WEB_DIST)) await app.register(fastifyStatic, { root: WEB_DIST });

  app.addHook('onClose', async () => store.close());
  return app;
}

if (import.meta.main) {
  const adminKey = process.env.ADMIN_KEY;
  const app = await buildApp({ dbFile: process.env.DB_FILE ?? 'promostack.db', adminKey, logger: true });
  if (!adminKey) app.log.warn('ADMIN_KEY is not set: promotion changes are not protected');
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
}
