import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, spread, scenario, rng } from '../src/index.ts';
import type { Basket, Promotion, Result } from '../src/index.ts';

const cola = { id: 'l1', sku: 'cola', category: 'drinks', unitPrice: 7999, quantity: 3 };
const chips = { id: 'l2', sku: 'chips', category: 'snacks', unitPrice: 5999, quantity: 1 };
const basket: Basket = { lines: [cola, chips], channel: 'pos', at: '2026-10-25T12:00:00Z' };

const drinks10: Promotion = { id: 'drinks10', name: '-10% drinks', kind: 'percent_off', target: { categories: ['drinks'] }, percent: 10, priority: 10 };
const cola3for2: Promotion = { id: 'cola3for2', name: 'Cola 3 for 2', kind: 'buy_x_get_y', target: { skus: ['cola'] }, buy: 2, get: 1, percent: 100, priority: 5 };

const reason = (r: Result, id: string) => r.rejected.find((x) => x.promotionId === id)?.reason;

test('spread keeps every cent', () => {
  assert.deepEqual(spread(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(spread(5, [0, 0]), [5, 0]);
  assert.equal(spread(999, [7, 13, 29]).reduce((a, b) => a + b), 999);
});

test('percent off discounts every matching unit', () => {
  const r = calculate(basket, [drinks10]);
  assert.equal(r.discount, 3 * 800);
  assert.equal(r.total, 3 * 7999 + 5999 - 2400);
  assert.deepEqual(r.lines[0].adjustments, [{ promotionId: 'drinks10', amount: 2400 }]);
  assert.equal(r.lines[1].discount, 0);
});

test('priority order leaves money on the table, optimal does not', () => {
  const byPriority = calculate(basket, [drinks10, cola3for2], { strategy: 'priority' });
  assert.equal(byPriority.discount, 2400);
  assert.equal(reason(byPriority, 'cola3for2'), 'BETTER_ALTERNATIVE');

  const best = calculate(basket, [drinks10, cola3for2]);
  assert.equal(best.discount, 7999);
  assert.equal(best.stats.optimal, true);
  assert.deepEqual(best.applied.map((a) => a.promotionId), ['cola3for2']);
  assert.equal(reason(best, 'drinks10'), 'BETTER_ALTERNATIVE');
});

test('buy-x-get-y discounts the cheapest units of each set', () => {
  const b: Basket = { lines: [{ id: 'a', sku: 'a', category: 'x', unitPrice: 1000, quantity: 2 }, { id: 'b', sku: 'b', category: 'x', unitPrice: 400, quantity: 2 }] };
  const r = calculate(b, [{ id: 'bogo', name: 'BOGO 50%', kind: 'buy_x_get_y', target: { categories: ['x'] }, buy: 1, get: 1, percent: 50 }]);
  // sets: (1000, 1000) and (400, 400): half of one unit in each set
  assert.equal(r.discount, 500 + 200);
});

test('bundle price discount is spread across its components', () => {
  const b: Basket = {
    lines: [
      { id: 'l1', sku: 'burger', category: 'food', unitPrice: 1599, quantity: 1 },
      { id: 'l2', sku: 'fries', category: 'food', unitPrice: 799, quantity: 1 },
      { id: 'l3', sku: 'soda', category: 'drinks', unitPrice: 699, quantity: 1 },
    ],
  };
  const menu: Promotion = {
    id: 'menu', name: 'Menu 24.99', kind: 'bundle_price', price: 2499,
    components: [{ target: { skus: ['burger'] }, quantity: 1 }, { target: { skus: ['fries'] }, quantity: 1 }, { target: { categories: ['drinks'] }, quantity: 1 }],
  };
  const r = calculate(b, [menu]);
  assert.equal(r.discount, 1599 + 799 + 699 - 2499);
  assert.equal(r.lines.reduce((a, l) => a + l.discount, 0), r.discount);
  assert.ok(r.lines.every((l) => l.discount > 0));
});

test('basket threshold is checked after item discounts and explained', () => {
  const spend = { id: 'spend', name: '-500 from 290', kind: 'basket_threshold', minSubtotal: 29000, amount: 500 } as const;
  const alone = calculate(basket, [spend]);
  assert.equal(alone.discount, 500);

  const r = calculate(basket, [{ ...cola3for2, combinable: true }, spend]);
  // 29996 gross qualifies, but after 3-for-2 only 21997 is left
  assert.equal(reason(r, 'spend'), 'MIN_SUBTOTAL');
  assert.equal(r.discount, 7999);
});

test('groups allow one member, the better one', () => {
  const a: Promotion = { ...drinks10, group: 'weekly' };
  const b: Promotion = { ...cola3for2, group: 'weekly' };
  const r = calculate(basket, [a, b]);
  assert.deepEqual(r.applied.map((x) => x.promotionId), ['cola3for2']);
  assert.equal(reason(r, 'drinks10'), 'GROUP_CONFLICT');
});

test('non-combinable promotion wins only when it beats the combination', () => {
  const everything20: Promotion = { id: 'all20', name: '-20% everything', kind: 'percent_off', target: {}, percent: 20, combinable: false };
  const r = calculate(basket, [drinks10, everything20, { id: 'chips', name: '-1 chips', kind: 'amount_off', target: { skus: ['chips'] }, amount: 100 }]);
  assert.deepEqual(r.applied.map((x) => x.promotionId), ['all20']);
  assert.equal(r.discount, 3 * 1600 + 1200);
  assert.equal(reason(r, 'drinks10'), 'NOT_COMBINABLE');

  const r2 = calculate(basket, [cola3for2, { ...everything20, percent: 5 }]);
  assert.deepEqual(r2.applied.map((x) => x.promotionId), ['cola3for2']);
  assert.equal(reason(r2, 'all20'), 'NOT_COMBINABLE');
});

test('conditions reject with a reason', () => {
  const ps: Promotion[] = [
    { ...drinks10, id: 'off', active: false },
    { ...drinks10, id: 'gold', conditions: { customerTiers: ['gold'] } },
    { ...drinks10, id: 'web', conditions: { channels: ['web'] } },
    { ...drinks10, id: 'old', conditions: { validTo: '2026-01-01T00:00:00Z' } },
    { ...drinks10, id: 'big', conditions: { minSubtotal: 100000 } },
    { id: 'milk', name: 'milk', kind: 'percent_off', target: { skus: ['milk'] }, percent: 10 },
    { id: 'six', name: '5+1 cola', kind: 'buy_x_get_y', target: { skus: ['cola'] }, buy: 5, get: 1, percent: 100 },
  ];
  const r = calculate(basket, ps);
  assert.equal(r.discount, 0);
  assert.deepEqual(
    Object.fromEntries(r.rejected.map((x) => [x.promotionId, x.reason])),
    { off: 'INACTIVE', gold: 'CUSTOMER_TIER', web: 'CHANNEL', old: 'OUTSIDE_VALIDITY', big: 'MIN_SUBTOTAL', milk: 'NO_ELIGIBLE_ITEMS', six: 'NOT_ENOUGH_ITEMS' },
  );
});

test('max applications caps a promotion', () => {
  const r = calculate(basket, [{ ...drinks10, maxApplications: 1 }]);
  assert.equal(r.discount, 800);
});

test('invariants hold on random scenarios', () => {
  const r = rng(42);
  for (let i = 0; i < 400; i++) {
    const { basket: b, promotions } = scenario(r, { lines: 1 + (i % 8), promotions: 1 + (i % 10) });
    const best = calculate(b, promotions);
    const prio = calculate(b, promotions, { strategy: 'priority' });
    const greedy = calculate(b, promotions, { strategy: 'greedy' });
    for (const res of [best, prio, greedy]) {
      assert.equal(res.total, res.subtotal - res.discount);
      assert.equal(res.lines.reduce((a, l) => a + l.discount, 0), res.discount);
      assert.ok(res.lines.every((l) => l.net >= 0 && l.net === l.gross - l.discount));
      assert.equal(res.applied.length + res.rejected.length, promotions.length);
    }
    assert.ok(best.discount >= prio.discount, `scenario ${i}: optimal below priority`);
    assert.ok(best.discount >= greedy.discount, `scenario ${i}: optimal below greedy`);
    assert.deepEqual({ ...calculate(b, promotions), stats: null }, { ...best, stats: null }, 'deterministic');
  }
});

test('pruning never loses the optimum (compared with full enumeration)', () => {
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const { basket: b, promotions } = scenario(r, { lines: 2 + (i % 5), promotions: 2 + (i % 6), maxQty: 3 });
    const pruned = calculate(b, promotions, { nodeBudget: Infinity });
    const full = calculate(b, promotions, { nodeBudget: Infinity, exhaustive: true });
    assert.equal(pruned.discount, full.discount, `scenario ${i}`);
    assert.ok(pruned.stats.nodes <= full.stats.nodes);
  }
});

test('node budget returns the best answer found so far', () => {
  const { basket: b, promotions } = scenario(rng(3), { lines: 30, promotions: 25, maxQty: 6 });
  const r = calculate(b, promotions, { nodeBudget: 10 });
  assert.equal(r.stats.optimal, false);
  assert.ok(r.discount >= calculate(b, promotions, { strategy: 'greedy' }).discount);
});

test('rejects fractional prices', () => {
  assert.throws(() => calculate({ lines: [{ id: 'x', sku: 'x', unitPrice: 9.99, quantity: 1 }] }, []), RangeError);
});
