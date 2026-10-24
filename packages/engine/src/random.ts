import type { Basket, Line, Promotion } from './types.ts';

/** Seeded PRNG (mulberry32): the same seed always gives the same scenarios. */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = ['dairy', 'bakery', 'drinks', 'snacks', 'produce', 'household'];

/** Random but realistic grocery basket with an overlapping promotion set. */
export function scenario(r: () => number, size: { lines: number; promotions: number; maxQty?: number }) {
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const catalog = CATEGORIES.flatMap((c) =>
    Array.from({ length: 6 }, (_, i) => ({ sku: `${c}-${i + 1}`, category: c, unitPrice: int(4, 200) * 10 - 1 })),
  );

  const chosen = new Set<string>();
  const lines: Line[] = [];
  while (lines.length < Math.min(size.lines, catalog.length)) {
    const item = pick(catalog);
    if (chosen.has(item.sku)) continue;
    chosen.add(item.sku);
    lines.push({ id: `l${lines.length + 1}`, ...item, quantity: int(1, size.maxQty ?? 4) });
  }
  const inBasket = (c: string) => lines.filter((l) => l.category === c).map((l) => l.sku);
  const target = () => (r() < 0.6 ? { categories: [pick(CATEGORIES)] } : { skus: [pick(lines).sku] });
  const gross = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);

  const promotions: Promotion[] = [];
  for (let i = 0; i < size.promotions; i++) {
    const base = {
      id: `p${i + 1}`,
      name: `Promo ${i + 1}`,
      priority: int(0, 10),
      combinable: r() > 0.15,
      group: r() < 0.3 ? pick(['g1', 'g2']) : undefined,
    };
    const kind = pick(['percent_off', 'percent_off', 'amount_off', 'buy_x_get_y', 'bundle_price', 'basket_threshold']);
    if (kind === 'percent_off') promotions.push({ ...base, kind, target: target(), percent: pick([10, 15, 20, 25, 30]) });
    else if (kind === 'amount_off') promotions.push({ ...base, kind, target: target(), amount: int(5, 30) * 10 });
    else if (kind === 'buy_x_get_y')
      promotions.push({ ...base, kind, target: target(), ...pick([{ buy: 2, get: 1, percent: 100 }, { buy: 1, get: 1, percent: 50 }]) });
    else if (kind === 'bundle_price') {
      const comps = Array.from({ length: int(2, 3) }, () => {
        const c = pick(CATEGORIES);
        const skus = inBasket(c);
        return { target: skus.length && r() < 0.5 ? { skus: [pick(skus)] } : { categories: [c] }, quantity: 1 };
      });
      promotions.push({ ...base, kind, components: comps, price: int(15, 60) * 10 });
    } else
      promotions.push({
        ...base,
        kind: 'basket_threshold',
        minSubtotal: Math.round((gross * int(50, 120)) / 100),
        ...(r() < 0.5 ? { percent: pick([5, 10]) } : { amount: int(3, 10) * 100 }),
      });
  }
  const basket: Basket = { lines, channel: 'pos' };
  return { basket, promotions };
}
