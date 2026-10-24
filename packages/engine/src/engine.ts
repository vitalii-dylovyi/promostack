import type {
  AmountOff,
  Basket,
  ItemPromotion,
  Line,
  Money,
  Options,
  PercentOff,
  Promotion,
  Reason,
  RejectedPromotion,
  Result,
  Strategy,
  Target,
  BasketThreshold,
} from './types.ts';

/** One physical unit of a basket line. Units are kept sorted by price, most expensive first. */
interface Unit {
  line: number;
  price: Money;
}

/** One application of an item promotion: the units it consumes and the discount on each. */
interface App {
  units: number[];
  disc: Money[];
  total: Money;
}

interface Solution {
  total: Money;
  item: Map<string, App[]>;
  basket: { id: string; amount: Money }[];
}

type PerUnit = PercentOff | AmountOff;

interface Ctx {
  lines: Line[];
  units: Unit[];
  gross: Money;
  candidates: Promotion[];
  rejected: RejectedPromotion[];
  /** Eligible unit indices per item promotion (per component for bundles), in unit order. */
  elig: Map<string, number[][]>;
  /** Combinable promotions split by layer. */
  multi: ItemPromotion[];
  perUnit: PerUnit[];
  basket: BasketThreshold[];
  nonCombinable: Promotion[];
  /** (unit, per-unit promotion) pairs, best discount first. */
  pairs: { u: number; p: PerUnit; d: Money }[];
  /** Best per-unit discount of each unit, ignoring groups and caps: used by the search bound. */
  bestPerUnit: Money[];
  basketMax: Money;
}

const DEFAULT_BUDGET = 2_000;
const GROUP_COMBO_LIMIT = 256;

const matches = (t: Target, l: Line) =>
  (!t.skus?.length && !t.categories?.length) ||
  !!t.skus?.includes(l.sku) ||
  (l.category !== undefined && !!t.categories?.includes(l.category));

const pct = (amount: Money, percent: number) => Math.round((amount * percent) / 100);
const fmt = (m: Money) => (m / 100).toFixed(2);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isItem = (p: Promotion): p is ItemPromotion => p.kind !== 'basket_threshold';
const isPerUnit = (p: Promotion): p is PerUnit => p.kind === 'percent_off' || p.kind === 'amount_off';

/** Split `total` proportionally to `weights` without losing a cent (largest remainder method). */
export function spread(total: Money, weights: number[]): Money[] {
  const w = sum(weights);
  if (w === 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((x) => (total * x) / w);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let rest = total - sum(out), k = 0; rest > 0; rest--, k++) out[order[k % order.length][1]]++;
  return out;
}

function precheck(p: Promotion, b: Basket, gross: Money, now: number): [Reason, string] | null {
  if (p.active === false) return ['INACTIVE', 'акцію вимкнено'];
  const c = p.conditions ?? {};
  if (c.validFrom && now < Date.parse(c.validFrom)) return ['OUTSIDE_VALIDITY', `починається ${c.validFrom}`];
  if (c.validTo && now > Date.parse(c.validTo)) return ['OUTSIDE_VALIDITY', `завершилася ${c.validTo}`];
  if (c.customerTiers?.length && !c.customerTiers.includes(b.customerTier ?? ''))
    return ['CUSTOMER_TIER', `лише для рівня клієнта ${c.customerTiers.join(' або ')}`];
  if (c.channels?.length && !c.channels.includes(b.channel ?? ''))
    return ['CHANNEL', `лише в каналі ${c.channels.join(', ')}`];
  if (c.minSubtotal !== undefined && gross < c.minSubtotal)
    return ['MIN_SUBTOTAL', `потрібна сума ${fmt(c.minSubtotal)}, у кошику ${fmt(gross)}`];
  return null;
}

function context(basket: Basket, promotions: Promotion[]): Ctx {
  const lines = basket.lines;
  for (const l of lines)
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0 || !Number.isInteger(l.quantity) || l.quantity < 0)
      throw new RangeError(`line ${l.id}: price and quantity must be non-negative integers`);

  const units: Unit[] = [];
  lines.forEach((l, line) => {
    for (let q = 0; q < l.quantity; q++) units.push({ line, price: l.unitPrice });
  });
  units.sort((a, b) => b.price - a.price || a.line - b.line);
  const gross = sum(lines.map((l) => l.unitPrice * l.quantity));
  const now = basket.at ? Date.parse(basket.at) : Date.now();

  const sorted = [...promotions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  const candidates: Promotion[] = [];
  const rejected: RejectedPromotion[] = [];
  for (const p of sorted) {
    const r = precheck(p, basket, gross, now);
    if (r) rejected.push({ promotionId: p.id, name: p.name, reason: r[0], detail: r[1] });
    else candidates.push(p);
  }

  const eligibleUnits = (t: Target) => units.flatMap((u, i) => (matches(t, lines[u.line]) ? [i] : []));
  const elig = new Map<string, number[][]>();
  for (const p of candidates) {
    if (p.kind === 'bundle_price') elig.set(p.id, p.components.map((c) => eligibleUnits(c.target)));
    else if (isItem(p)) elig.set(p.id, [eligibleUnits(p.target)]);
  }

  const combinable = candidates.filter((p) => p.combinable !== false);
  const kindRank = (p: Promotion) => (p.kind === 'bundle_price' ? 0 : 1);
  const multi = combinable
    .filter((p): p is ItemPromotion => p.kind === 'bundle_price' || p.kind === 'buy_x_get_y')
    .sort((a, b) => kindRank(a) - kindRank(b));
  const perUnit = combinable.filter(isPerUnit);
  const basketLayer = combinable.filter((p): p is BasketThreshold => p.kind === 'basket_threshold');

  const pairs: Ctx['pairs'] = [];
  const bestPerUnit = units.map(() => 0);
  perUnit.forEach((p) => {
    for (const u of elig.get(p.id)![0]) {
      const d = unitValue(p, units[u].price);
      if (d <= 0) continue;
      pairs.push({ u, p, d });
      bestPerUnit[u] = Math.max(bestPerUnit[u], d);
    }
  });
  const order = new Map(perUnit.map((p, i) => [p.id, i]));
  pairs.sort((a, b) => b.d - a.d || order.get(a.p.id)! - order.get(b.p.id)! || a.u - b.u);

  const basketMax = sum(basketLayer.map((p) => pct(gross, p.percent ?? 0) + (p.amount ?? 0)));

  return {
    lines,
    units,
    gross,
    candidates,
    rejected,
    elig,
    multi,
    perUnit,
    basket: basketLayer,
    nonCombinable: candidates.filter((p) => p.combinable === false),
    pairs,
    bestPerUnit,
    basketMax,
  };
}

function unitValue(p: PerUnit, price: Money): Money {
  return p.kind === 'percent_off' ? pct(price, p.percent) : Math.min(p.amount, price);
}

/** Canonical single application: always takes the most valuable free eligible units. */
function applyOnce(ctx: Ctx, p: ItemPromotion, free: Uint8Array): App | null {
  const elig = ctx.elig.get(p.id)!;
  const price = (u: number) => ctx.units[u].price;
  switch (p.kind) {
    case 'percent_off':
    case 'amount_off': {
      const u = elig[0].find((x) => free[x]);
      if (u === undefined) return null;
      const d = unitValue(p, price(u));
      return d > 0 ? { units: [u], disc: [d], total: d } : null;
    }
    case 'buy_x_get_y': {
      const need = p.buy + p.get;
      const picked: number[] = [];
      for (const u of elig[0]) if (free[u] && picked.push(u) === need) break;
      if (picked.length < need) return null;
      // Units are sorted by price, so the last `get` units of the set are the cheapest ones.
      const disc = picked.map((u, k) => (k < p.buy ? 0 : pct(price(u), p.percent)));
      const total = sum(disc);
      return total > 0 ? { units: picked, disc, total } : null;
    }
    case 'bundle_price': {
      const picked: number[] = [];
      for (const [i, c] of p.components.entries()) {
        let need = c.quantity;
        for (const u of elig[i]) {
          if (need === 0) break;
          if (free[u] && !picked.includes(u)) {
            picked.push(u);
            need--;
          }
        }
        if (need > 0) return null;
      }
      const total = sum(picked.map(price)) - p.price;
      return total > 0 ? { units: picked, disc: spread(total, picked.map(price)), total } : null;
    }
  }
}

const mark = (free: Uint8Array, app: App, v: 0 | 1) => app.units.forEach((u) => (free[u] = v));

/** Apply `p` as many times as possible, consuming units in `free`. */
function applyMax(ctx: Ctx, p: ItemPromotion, free: Uint8Array): App[] {
  const apps: App[] = [];
  const cap = p.maxApplications ?? Infinity;
  for (let app; apps.length < cap && (app = applyOnce(ctx, p, free)); ) {
    mark(free, app, 0);
    apps.push(app);
  }
  return apps;
}

function basketAmounts(ctx: Ctx, list: BasketThreshold[], subtotal: Money) {
  const out: { id: string; amount: Money }[] = [];
  let left = subtotal;
  for (const p of list) {
    if (subtotal < p.minSubtotal) continue;
    const amount = Math.min(left, pct(subtotal, p.percent ?? 0) + (p.amount ?? 0));
    if (amount <= 0) continue;
    out.push({ id: p.id, amount });
    left -= amount;
  }
  return out;
}

/**
 * Per-unit and basket layers for a fixed set of consumed units.
 * Per-unit: each free unit gets its best allowed per-unit promotion (exact without caps).
 * Groups shared by these layers are resolved by enumerating which member of each group may apply.
 */
function tail(ctx: Ctx, free: Uint8Array, used: Set<string>, itemDisc: Money, withPerUnit = true) {
  const pool = [...(withPerUnit ? ctx.perUnit : []), ...ctx.basket].filter((p) => !p.group || !used.has(p.group));
  const groups = new Map<string, string[]>();
  for (const p of pool) if (p.group) groups.set(p.group, [...(groups.get(p.group) ?? []), p.id]);
  const keys = [...groups.keys()];
  const total = keys.reduce((n, k) => n * groups.get(k)!.length, 1);
  const combos: Map<string, string>[] = [];
  if (total <= GROUP_COMBO_LIMIT) {
    const walk = (i: number, acc: Map<string, string>) => {
      if (i === keys.length) return void combos.push(new Map(acc));
      for (const id of groups.get(keys[i])!) walk(i + 1, acc.set(keys[i], id));
    };
    walk(0, new Map());
  } else {
    // ponytail: too many group combinations, keep the first (highest-priority) member of each group.
    combos.push(new Map(keys.map((k) => [k, groups.get(k)![0]])));
  }

  let best = { total: -1, perUnit: new Map<string, App[]>(), basket: [] as { id: string; amount: Money }[] };
  for (const chosen of combos) {
    const allowed = (p: Promotion) => !p.group || (!used.has(p.group) && chosen.get(p.group) === p.id);
    const perUnit = new Map<string, App[]>();
    let perUnitTotal = 0;
    if (withPerUnit) {
      const taken = new Uint8Array(ctx.units.length);
      const count = new Map<string, number>();
      for (const { u, p, d } of ctx.pairs) {
        if (!free[u] || taken[u] || !allowed(p) || (count.get(p.id) ?? 0) >= (p.maxApplications ?? Infinity)) continue;
        taken[u] = 1;
        count.set(p.id, (count.get(p.id) ?? 0) + 1);
        perUnit.set(p.id, [...(perUnit.get(p.id) ?? []), { units: [u], disc: [d], total: d }]);
        perUnitTotal += d;
      }
    }
    const basket = basketAmounts(ctx, ctx.basket.filter(allowed), ctx.gross - itemDisc - perUnitTotal);
    const t = perUnitTotal + sum(basket.map((b) => b.amount));
    if (t > best.total) best = { total: t, perUnit, basket };
  }
  return best;
}

function standalone(ctx: Ctx, p: Promotion): Solution {
  if (p.kind === 'basket_threshold') {
    const basket = basketAmounts(ctx, [p], ctx.gross);
    return { total: sum(basket.map((b) => b.amount)), item: new Map(), basket };
  }
  const apps = applyMax(ctx, p, new Uint8Array(ctx.units.length).fill(1));
  return { total: sum(apps.map((a) => a.total)), item: new Map(apps.length ? [[p.id, apps]] : []), basket: [] };
}

function bestOf(...sols: Solution[]): Solution {
  return sols.reduce((a, b) => (b.total > a.total ? b : a));
}

/** Industry baseline: rules in priority order, each one takes every unit it can. */
function byPriority(ctx: Ctx): Solution {
  const free = new Uint8Array(ctx.units.length).fill(1);
  const used = new Set<string>();
  const item = new Map<string, App[]>();
  let any = false;
  let stop = false;
  let itemDisc = 0;
  const allowed = (p: Promotion) => !stop && !(p.combinable === false && any) && !(p.group && used.has(p.group));
  const take = (p: Promotion) => {
    any = true;
    if (p.group) used.add(p.group);
    if (p.combinable === false) stop = true;
  };
  for (const p of ctx.candidates.filter(isItem)) {
    if (!allowed(p)) continue;
    const apps = applyMax(ctx, p, free);
    if (!apps.length) continue;
    item.set(p.id, apps);
    itemDisc += sum(apps.map((a) => a.total));
    take(p);
  }
  const basket: Solution['basket'] = [];
  const subtotal = ctx.gross - itemDisc;
  let left = subtotal;
  for (const p of ctx.candidates.filter((x): x is BasketThreshold => x.kind === 'basket_threshold')) {
    if (!allowed(p) || subtotal < p.minSubtotal) continue;
    const amount = Math.min(left, pct(subtotal, p.percent ?? 0) + (p.amount ?? 0));
    if (amount <= 0) continue;
    basket.push({ id: p.id, amount });
    left -= amount;
    take(p);
  }
  return { total: itemDisc + sum(basket.map((b) => b.amount)), item, basket };
}

/** Repeatedly take the single most valuable application, then resolve the basket layer. */
function byValue(ctx: Ctx): Solution {
  const free = new Uint8Array(ctx.units.length).fill(1);
  const owner = new Map<string, string>();
  const item = new Map<string, App[]>();
  const pool: ItemPromotion[] = [...ctx.multi, ...ctx.perUnit];
  let itemDisc = 0;
  for (;;) {
    let pick: { p: ItemPromotion; app: App } | null = null;
    for (const p of pool) {
      if (p.group && owner.has(p.group) && owner.get(p.group) !== p.id) continue;
      if ((item.get(p.id)?.length ?? 0) >= (p.maxApplications ?? Infinity)) continue;
      const app = applyOnce(ctx, p, free);
      if (app && (!pick || app.total > pick.app.total)) pick = { p, app };
    }
    if (!pick) break;
    mark(free, pick.app, 0);
    item.set(pick.p.id, [...(item.get(pick.p.id) ?? []), pick.app]);
    if (pick.p.group) owner.set(pick.p.group, pick.p.id);
    itemDisc += pick.app.total;
  }
  const t = tail(ctx, free, new Set(owner.keys()), itemDisc, false);
  const combinable = { total: itemDisc + t.total, item, basket: t.basket };
  return bestOf(combinable, ...ctx.nonCombinable.map((p) => standalone(ctx, p)));
}

/**
 * Branch and bound over how many times each multi-unit promotion is applied
 * (bundles first, then buy-X-get-Y), with per-unit and basket layers solved at the leaves.
 * Starts from the greedy answers, so running out of budget still returns at least as good a result.
 */
function optimal(ctx: Ctx, budget: number, prune = true) {
  let best = bestOf(byValue(ctx), byPriority(ctx));
  const free = new Uint8Array(ctx.units.length).fill(1);
  const used = new Set<string>();
  const stack: [string, App[]][] = [];
  let nodes = 0;
  let complete = true;

  const bound = (i: number) => {
    let b = ctx.basketMax;
    for (let u = 0; u < free.length; u++) if (free[u]) b += ctx.bestPerUnit[u];
    for (let j = i; j < ctx.multi.length; j++) {
      const p = ctx.multi[j];
      if (p.group && used.has(p.group)) continue;
      b += sum(applyMax(ctx, p, free.slice()).map((a) => a.total));
    }
    return b;
  };

  const dfs = (i: number, disc: Money) => {
    if (++nodes > budget) return void (complete = false);
    if (i === ctx.multi.length) {
      const t = tail(ctx, free, used, disc);
      if (disc + t.total > best.total) {
        const item = new Map(stack.filter(([, apps]) => apps.length));
        for (const [id, apps] of t.perUnit) item.set(id, apps);
        best = { total: disc + t.total, item, basket: t.basket };
      }
      return;
    }
    if (prune && disc + bound(i) <= best.total) return;
    const p = ctx.multi[i];
    if (p.group && used.has(p.group)) return dfs(i + 1, disc);
    const apps = applyMax(ctx, p, free);
    let d = sum(apps.map((a) => a.total));
    if (p.group && apps.length) used.add(p.group);
    for (let k = apps.length; k >= 0; k--) {
      if (k < apps.length) {
        mark(free, apps[k], 1);
        d -= apps[k].total;
        if (k === 0 && p.group) used.delete(p.group);
      }
      stack.push([p.id, apps.slice(0, k)]);
      dfs(i + 1, disc + d);
      stack.pop();
    }
  };
  dfs(0, 0);

  best = bestOf(best, ...ctx.nonCombinable.map((p) => standalone(ctx, p)));
  return { best, nodes, complete };
}

function whyNot(ctx: Ctx, p: Promotion, sol: Solution, itemDisc: Money): [Reason, string] {
  const appliedIds = new Set([...sol.item.keys(), ...sol.basket.map((b) => b.id)]);
  const applied = ctx.candidates.filter((x) => appliedIds.has(x.id));
  const rival = applied.find((x) => p.group && x.group === p.group);
  if (rival) return ['GROUP_CONFLICT', `у групі «${p.group}» уже застосовано «${rival.name}»`];
  const exclusive = applied.find((x) => x.combinable === false);
  if (exclusive) return ['NOT_COMBINABLE', `«${exclusive.name}» не поєднується з іншими акціями`];
  if (p.combinable === false && applied.length)
    return ['NOT_COMBINABLE', 'не поєднується з іншими, а їхня сукупна знижка більша'];

  if (p.kind === 'basket_threshold') {
    const subtotal = ctx.gross - itemDisc;
    if (subtotal < p.minSubtotal)
      return ['MIN_SUBTOTAL', `потрібно ${fmt(p.minSubtotal)} після знижок на товари, у кошику ${fmt(subtotal)}`];
    return ['BETTER_ALTERNATIVE', 'обрано вигіднішу комбінацію'];
  }
  const elig = ctx.elig.get(p.id)!;
  if (elig.some((e) => e.length === 0)) return ['NO_ELIGIBLE_ITEMS', 'у кошику немає відповідних товарів'];
  if (applyOnce(ctx, p, new Uint8Array(ctx.units.length).fill(1)))
    return ['BETTER_ALTERNATIVE', 'її товари використано у вигіднішій комбінації'];
  if (p.kind === 'buy_x_get_y')
    return ['NOT_ENOUGH_ITEMS', `потрібно ${p.buy + p.get} відповідних одиниць, у кошику ${elig[0].length}`];
  if (p.kind === 'bundle_price') {
    const short = p.components.findIndex((c, i) => elig[i].length < c.quantity);
    if (short >= 0) return ['NOT_ENOUGH_ITEMS', `для складника ${short + 1} потрібно ${p.components[short].quantity} од.`];
    return ['NOT_BENEFICIAL', `ціна комплекту ${fmt(p.price)} не нижча за вартість товарів`];
  }
  return ['NOT_BENEFICIAL', 'знижка округлюється до нуля'];
}

function toResult(ctx: Ctx, sol: Solution, strategy: Strategy, nodes: number, optimalFlag: boolean, t0: number): Result {
  const perLine = ctx.lines.map(() => new Map<string, Money>());
  const add = (line: number, id: string, amount: Money) => perLine[line].set(id, (perLine[line].get(id) ?? 0) + amount);
  for (const [id, apps] of sol.item)
    for (const app of apps) app.units.forEach((u, k) => app.disc[k] > 0 && add(ctx.units[u].line, id, app.disc[k]));

  const itemDisc = sum([...sol.item.values()].flat().map((a) => a.total));
  const netAfterItems = ctx.lines.map((l, i) => l.unitPrice * l.quantity - sum([...perLine[i].values()]));
  for (const b of sol.basket) spread(b.amount, netAfterItems).forEach((a, i) => a > 0 && add(i, b.id, a));

  const lines = ctx.lines.map((l, i) => {
    const gross = l.unitPrice * l.quantity;
    const discount = sum([...perLine[i].values()]);
    return {
      lineId: l.id,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gross,
      discount,
      net: gross - discount,
      adjustments: [...perLine[i]].map(([promotionId, amount]) => ({ promotionId, amount })),
    };
  });

  const applied = ctx.candidates.flatMap((p) => {
    const apps = sol.item.get(p.id);
    if (apps) return [{ promotionId: p.id, name: p.name, applications: apps.length, discount: sum(apps.map((a) => a.total)) }];
    const b = sol.basket.find((x) => x.id === p.id);
    return b ? [{ promotionId: p.id, name: p.name, applications: 1, discount: b.amount }] : [];
  });
  const appliedIds = new Set(applied.map((a) => a.promotionId));
  const rejected = [
    ...ctx.rejected,
    ...ctx.candidates
      .filter((p) => !appliedIds.has(p.id))
      .map((p) => {
        const [reason, detail] = whyNot(ctx, p, sol, itemDisc);
        return { promotionId: p.id, name: p.name, reason, detail };
      }),
  ];

  return {
    subtotal: ctx.gross,
    discount: sol.total,
    total: ctx.gross - sol.total,
    lines,
    applied,
    rejected,
    stats: { strategy, nodes, optimal: optimalFlag, timeMs: +(performance.now() - t0).toFixed(3) },
  };
}

export function calculate(basket: Basket, promotions: Promotion[], options: Options = {}): Result {
  const t0 = performance.now();
  const strategy = options.strategy ?? 'optimal';
  const ctx = context(basket, promotions);
  if (strategy === 'priority') return toResult(ctx, byPriority(ctx), strategy, 0, false, t0);
  if (strategy === 'greedy') return toResult(ctx, byValue(ctx), strategy, 0, false, t0);
  const { best, nodes, complete } = optimal(ctx, options.nodeBudget ?? DEFAULT_BUDGET, !options.exhaustive);
  return toResult(ctx, best, strategy, nodes, complete, t0);
}
