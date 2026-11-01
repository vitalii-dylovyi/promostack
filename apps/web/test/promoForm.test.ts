import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, toKop, fromKop, toInputDate, fromInputDate } from '../src/promoForm.ts';

test('money converts between hryvnias and kopiyky', () => {
  assert.equal(toKop('49,90'), 4990);
  assert.equal(toKop('0.1'), 10);
  assert.equal(toKop('19.999'), 2000);
  assert.equal(toKop(''), undefined);
  assert.equal(toKop('abc'), undefined);
  assert.equal(fromKop(4990), '49.90');
  assert.equal(fromKop(undefined), '');
});

test('dates survive a round trip through datetime-local', () => {
  const iso = '2026-11-02T10:30:00.000Z';
  assert.equal(fromInputDate(toInputDate(iso)), iso);
  assert.equal(fromInputDate(''), undefined);
  assert.equal(toInputDate(undefined), '');
});

test('clean drops empty optional fields and keeps real values', () => {
  const p = clean({
    id: 'x', name: 'x', kind: 'percent_off', percent: 10, group: '', maxApplications: Number.NaN, priority: 3,
    target: { skus: [], categories: ['drinks'] },
    conditions: { minSubtotal: undefined, customerTiers: [], channels: ['web'], validFrom: '' },
  });
  assert.deepEqual(p, { id: 'x', name: 'x', kind: 'percent_off', percent: 10, priority: 3, target: { categories: ['drinks'] }, conditions: { channels: ['web'] } });
});

test('clean removes zero percent/amount only for basket thresholds and empties bundle targets', () => {
  const t = clean({ id: 't', name: 't', kind: 'basket_threshold', minSubtotal: 50000, percent: 0, amount: 1000 });
  assert.deepEqual(t, { id: 't', name: 't', kind: 'basket_threshold', minSubtotal: 50000, amount: 1000 });
  const b = clean({ id: 'b', name: 'b', kind: 'bundle_price', price: 9900, components: [{ target: { skus: ['coffee'], categories: [] }, quantity: 1 }] });
  assert.deepEqual(b.kind === 'bundle_price' && b.components, [{ target: { skus: ['coffee'] }, quantity: 1 }]);
});
