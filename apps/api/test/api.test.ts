import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.ts';

const app = await buildApp({ adminKey: 'secret' });
after(() => app.close());

const cart = {
  channel: 'pos',
  lines: [
    { id: '1', sku: 'cola', category: 'drinks', unitPrice: 4990, quantity: 3 },
    { id: '2', sku: 'chips', category: 'snacks', unitPrice: 5490, quantity: 1 },
  ],
};

test('serves seeded catalog and promotions', async () => {
  const products = (await app.inject('/api/products')).json();
  assert.ok(products.length >= 10);
  const promos = (await app.inject('/api/promotions')).json();
  assert.ok(promos.some((p: { id: string }) => p.id === 'cola-3for2'));
});

test('calculate picks 3-for-2 over -10% and logs the calculation', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/calculate', payload: { basket: cart } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.discount, 4990);
  assert.ok(body.calculationId > 0);
  assert.equal(body.rejected.find((r: { promotionId: string }) => r.promotionId === 'drinks-10').reason, 'BETTER_ALTERNATIVE');

  const log = (await app.inject('/api/calculations?limit=1')).json();
  assert.equal(log[0].id, body.calculationId);
  assert.equal(log[0].discount, 4990);
});

test('compare returns all strategies', async () => {
  const body = (await app.inject({ method: 'POST', url: '/api/compare', payload: { basket: cart } })).json();
  assert.equal(body.priority.discount, 1497);
  assert.equal(body.optimal.discount, 4990);
});

test('what-if promotions are used instead of stored ones and not logged', async () => {
  const before = (await app.inject('/api/calculations?limit=500')).json().length;
  const res = await app.inject({
    method: 'POST',
    url: '/api/calculate',
    payload: { basket: cart, promotions: [{ id: 'x', name: 'x', kind: 'amount_off', target: { skus: ['chips'] }, amount: 1000 }] },
  });
  assert.equal(res.json().discount, 1000);
  assert.equal(res.json().calculationId, null);
  assert.equal((await app.inject('/api/calculations?limit=500')).json().length, before);
});

test('validation rejects bad input', async () => {
  const fractional = await app.inject({
    method: 'POST',
    url: '/api/calculate',
    payload: { basket: { lines: [{ id: '1', sku: 'a', unitPrice: 9.99, quantity: 1 }] } },
  });
  assert.equal(fractional.statusCode, 400);
  const unknownKind = await app.inject({
    method: 'POST',
    url: '/api/promotions',
    headers: { 'x-api-key': 'secret' },
    payload: { id: 'z', name: 'z', kind: 'mystery' },
  });
  assert.equal(unknownKind.statusCode, 400);
});

test('promotion CRUD requires the admin key', async () => {
  const promo = { id: 'bread-5', name: '-5 грн на хліб', kind: 'amount_off', target: { skus: ['bread'] }, amount: 500 };
  assert.equal((await app.inject({ method: 'POST', url: '/api/promotions', payload: promo })).statusCode, 401);

  const headers = { 'x-api-key': 'secret' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/promotions', headers, payload: promo })).statusCode, 201);
  assert.equal((await app.inject({ method: 'POST', url: '/api/promotions', headers, payload: promo })).statusCode, 409);
  const updated = { ...promo, amount: 700 };
  assert.equal((await app.inject({ method: 'PUT', url: '/api/promotions/bread-5', headers, payload: updated })).json().amount, 700);
  assert.equal((await app.inject('/api/promotions/bread-5')).json().amount, 700);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/promotions/bread-5', headers })).statusCode, 204);
  assert.equal((await app.inject('/api/promotions/bread-5')).statusCode, 404);
});

test('OpenAPI document is published', async () => {
  const doc = (await app.inject('/docs/json')).json();
  assert.ok(doc.paths['/api/calculate']);
});
