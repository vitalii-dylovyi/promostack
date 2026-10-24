// Compares the priority baseline, value-greedy and branch-and-bound on seeded random scenarios.
// Usage: node packages/engine/bench/bench.ts [runsPerSize]
import { writeFileSync } from 'node:fs';
import { calculate, scenario, rng } from '../src/index.ts';
import type { Strategy } from '../src/index.ts';

const RUNS = Number(process.argv[2] ?? 300);
const SIZES = [
  { name: 'S', lines: 5, promotions: 5, maxQty: 3 },
  { name: 'M', lines: 10, promotions: 10, maxQty: 4 },
  { name: 'L', lines: 20, promotions: 20, maxQty: 4 },
  { name: 'XL', lines: 36, promotions: 30, maxQty: 6 },
];

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x: number, d = 2) => +x.toFixed(d);

const time = (f: () => unknown) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};

// warm up the JIT so the first size is not penalised
for (let i = 0, r = rng(1); i < 200; i++) {
  const s = scenario(r, SIZES[1]);
  for (const strategy of ['priority', 'greedy', 'optimal'] as Strategy[]) calculate(s.basket, s.promotions, { strategy });
}

// "Informed merchant" baseline: priorities ordered by each promotion's standalone value.
const informed = (basket: Parameters<typeof calculate>[0], promotions: Parameters<typeof calculate>[1]) =>
  promotions.map((p) => ({ ...p, priority: calculate(basket, [p], { strategy: 'priority' }).discount }));

const rows = SIZES.map((size) => {
  const r = rng(2026);
  const ms: Record<Strategy, number[]> = { priority: [], greedy: [], optimal: [] };
  const gapPrio: number[] = [];
  const gapInformed: number[] = [];
  let worseInformed = 0;
  const gapGreedy: number[] = [];
  const nodes: number[] = [];
  const fullNodes: number[] = [];
  let worsePrio = 0;
  let worseGreedy = 0;
  let complete = 0;
  let units = 0;
  for (let i = 0; i < RUNS; i++) {
    const { basket, promotions } = scenario(r, size);
    units += basket.lines.reduce((a, l) => a + l.quantity, 0);
    const res = {} as Record<Strategy, ReturnType<typeof calculate>>;
    for (const strategy of ['priority', 'greedy', 'optimal'] as Strategy[])
      ms[strategy].push(time(() => (res[strategy] = calculate(basket, promotions, { strategy }))));
    const best = res.optimal.discount;
    nodes.push(res.optimal.stats.nodes);
    if (res.optimal.stats.optimal) complete++;
    if (res.priority.discount < best) worsePrio++;
    if (res.greedy.discount < best) worseGreedy++;
    const inf = calculate(basket, informed(basket, promotions), { strategy: 'priority' }).discount;
    if (inf < best) worseInformed++;
    if (best > 0) {
      gapInformed.push((100 * (best - inf)) / best);
      gapPrio.push((100 * (best - res.priority.discount)) / best);
      gapGreedy.push((100 * (best - res.greedy.discount)) / best);
    }
    if (size.name === 'S' || size.name === 'M')
      fullNodes.push(calculate(basket, promotions, { exhaustive: true, nodeBudget: Infinity }).stats.nodes);
  }
  return {
    size: size.name,
    lines: size.lines,
    promotions: size.promotions,
    avgUnits: round(units / RUNS, 1),
    priorityWorsePct: round((100 * worsePrio) / RUNS, 1),
    greedyWorsePct: round((100 * worseGreedy) / RUNS, 1),
    priorityGapMeanPct: round(mean(gapPrio)),
    priorityGapMaxPct: round(Math.max(...gapPrio)),
    priorityGapMedianPct: round(q(gapPrio, 0.5)),
    informedWorsePct: round((100 * worseInformed) / RUNS, 1),
    informedGapMeanPct: round(mean(gapInformed)),
    greedyGapMeanPct: round(mean(gapGreedy)),
    optimalCompletePct: round((100 * complete) / RUNS, 1),
    nodesMean: round(mean(nodes), 1),
    nodesExhaustiveMean: fullNodes.length ? round(mean(fullNodes), 1) : null,
    p50: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, round(q(v, 0.5), 3)])),
    p95: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, round(q(v, 0.95), 3)])),
    max: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, round(Math.max(...v), 3)])),
  };
});

// Node budget sweep on large baskets: answer quality vs latency, against the largest budget as reference.
const BUDGETS = [500, 1000, 2000, 5000, 20000];
const sweep = SIZES.filter((s) => s.name === 'L' || s.name === 'XL').flatMap((size) => {
  const r = rng(99);
  const cases = Array.from({ length: Math.min(RUNS, 150) }, () => scenario(r, size));
  const ref = cases.map((c) => calculate(c.basket, c.promotions, { nodeBudget: 200_000 }).discount);
  return BUDGETS.map((nodeBudget) => {
    const t: number[] = [];
    const gaps: number[] = [];
    let complete = 0;
    cases.forEach((c, i) => {
      let res!: ReturnType<typeof calculate>;
      t.push(time(() => (res = calculate(c.basket, c.promotions, { nodeBudget }))));
      if (res.stats.optimal) complete++;
      if (ref[i] > 0) gaps.push((100 * (ref[i] - res.discount)) / ref[i]);
    });
    return { size: size.name, nodeBudget, completePct: round((100 * complete) / cases.length, 1), gapMeanPct: round(mean(gaps), 3), gapMaxPct: round(Math.max(...gaps), 2), p50: round(q(t, 0.5), 3), p95: round(q(t, 0.95), 3) };
  });
});

const env = { node: process.version, platform: `${process.platform}-${process.arch}`, runsPerSize: RUNS, date: new Date().toISOString() };
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({ env, rows, sweep }, null, 2) + '\n');

console.log(`runs per size: ${RUNS}, ${env.node}, ${env.platform}\n`);
console.log('| size | lines x promos | avg units | priority worse | priority gap mean / median / max | informed priority worse / gap mean | greedy worse | B&B complete | nodes (pruned / full) | p50 ms prio / greedy / B&B | p95 ms prio / greedy / B&B |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.size} | ${r.lines} x ${r.promotions} | ${r.avgUnits} | ${r.priorityWorsePct}% | ${r.priorityGapMeanPct}% / ${r.priorityGapMedianPct}% / ${r.priorityGapMaxPct}% | ${r.informedWorsePct}% / ${r.informedGapMeanPct}% | ${r.greedyWorsePct}% | ${r.optimalCompletePct}% | ${r.nodesMean} / ${r.nodesExhaustiveMean ?? '-'} | ${r.p50.priority} / ${r.p50.greedy} / ${r.p50.optimal} | ${r.p95.priority} / ${r.p95.greedy} / ${r.p95.optimal} |`,
  );

console.log('\n| size | node budget | B&B complete | gap to reference mean / max | p50 ms | p95 ms |');
console.log('|---|---|---|---|---|---|');
for (const r of sweep) console.log(`| ${r.size} | ${r.nodeBudget} | ${r.completePct}% | ${r.gapMeanPct}% / ${r.gapMaxPct}% | ${r.p50} | ${r.p95} |`);
