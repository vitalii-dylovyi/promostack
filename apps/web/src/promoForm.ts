import type { Promotion, Target } from '@promostack/engine';

/** "49,90" or "49.9" (hryvnias) -> 4990 kopiyky; empty or invalid -> undefined. */
export function toKop(value: string): number | undefined {
  const n = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export const fromKop = (kop: number | undefined) => (kop === undefined ? '' : (kop / 100).toFixed(2));

/** ISO timestamp <-> value of <input type="datetime-local"> in the browser's time zone. */
export function toInputDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const fromInputDate = (local: string) => (local ? new Date(local).toISOString() : undefined);

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || Number.isNaN(v);

function cleanTarget(t: Target): Target {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => !empty(v)));
}

/** Drop the empty optional fields a form leaves behind, so the API schema accepts the promotion. */
export function clean(p: Promotion): Promotion {
  const out = structuredClone(p) as Promotion & Record<string, unknown>;
  for (const k of ['group', 'maxApplications', 'priority', 'percent', 'amount'] as const)
    if (empty(out[k]) || ((k === 'percent' || k === 'amount') && out[k] === 0 && out.kind === 'basket_threshold')) delete out[k];
  if (out.conditions) {
    const c = Object.fromEntries(Object.entries(out.conditions).filter(([, v]) => !empty(v)));
    if (Object.keys(c).length) out.conditions = c;
    else delete out.conditions;
  }
  if ('target' in out && out.target) out.target = cleanTarget(out.target);
  if (out.kind === 'bundle_price') out.components = out.components.map((c) => ({ ...c, target: cleanTarget(c.target) }));
  return out;
}
