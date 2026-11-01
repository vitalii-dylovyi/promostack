import type { ChangeEvent, ReactNode } from 'react';
import type { Promotion, Target } from '@promostack/engine';
import type { Product } from './api.ts';
import { describe, kinds, templates } from './labels.ts';
import { fromInputDate, fromKop, toInputDate, toKop } from './promoForm.ts';

const TIERS = ['silver', 'gold'];
const CHANNELS = [
  ['pos', 'каса'],
  ['web', 'сайт'],
  ['app', 'застосунок'],
];

type Props = { value: Promotion; isNew: boolean; products: Product[]; onChange: (p: Promotion) => void };

export function PromoForm({ value: p, isNew, products, onChange }: Props) {
  const set = (patch: Record<string, unknown>) => onChange({ ...p, ...patch } as Promotion);
  const cond = p.conditions ?? {};
  const setCond = (patch: Record<string, unknown>) => set({ conditions: { ...cond, ...patch } });
  const num = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div className="form">
      <Field label="Механіка">
        <select
          value={p.kind}
          disabled={!isNew}
          onChange={(e) => onChange({ ...templates[e.target.value as Promotion['kind']], id: p.id, name: p.name })}
        >
          {Object.entries(kinds).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ідентифікатор">
        <input value={p.id} disabled={!isNew} pattern="[a-zA-Z0-9_-]{1,64}" onChange={(e) => set({ id: e.target.value })} />
      </Field>
      <Field label="Назва" wide>
        <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      {p.kind !== 'bundle_price' && p.kind !== 'basket_threshold' && (
        <TargetPicker label="На які товари" value={p.target} products={products} onChange={(target) => set({ target })} />
      )}
      {(p.kind === 'percent_off' || p.kind === 'buy_x_get_y') && (
        <Field label="Знижка, %">
          <input type="number" min={1} max={100} value={p.percent} onChange={(e) => set({ percent: num(e.target.value) })} />
        </Field>
      )}
      {p.kind === 'amount_off' && (
        <Field label="Знижка за одиницю, грн">
          <input inputMode="decimal" defaultValue={fromKop(p.amount)} onChange={(e) => set({ amount: toKop(e.target.value) })} />
        </Field>
      )}
      {p.kind === 'buy_x_get_y' && (
        <>
          <Field label="Купи, шт.">
            <input type="number" min={1} value={p.buy} onChange={(e) => set({ buy: num(e.target.value) })} />
          </Field>
          <Field label="Отримай, шт.">
            <input type="number" min={1} value={p.get} onChange={(e) => set({ get: num(e.target.value) })} />
          </Field>
        </>
      )}
      {p.kind === 'bundle_price' && (
        <>
          <Field label="Ціна комплекту, грн">
            <input inputMode="decimal" defaultValue={fromKop(p.price)} onChange={(e) => set({ price: toKop(e.target.value) })} />
          </Field>
          {p.components.map((c, i) => (
            <div key={i} className="component">
              <TargetPicker
                label={`Складник ${i + 1}`}
                value={c.target}
                products={products}
                onChange={(target) => set({ components: p.components.map((x, j) => (j === i ? { ...x, target } : x)) })}
              />
              <Field label="Кількість">
                <input
                  type="number"
                  min={1}
                  value={c.quantity}
                  onChange={(e) => set({ components: p.components.map((x, j) => (j === i ? { ...x, quantity: num(e.target.value) } : x)) })}
                />
              </Field>
              {p.components.length > 1 && (
                <button type="button" className="danger" onClick={() => set({ components: p.components.filter((_, j) => j !== i) })}>
                  Прибрати
                </button>
              )}
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => set({ components: [...p.components, { target: {}, quantity: 1 }] })}>
            + Складник
          </button>
        </>
      )}
      {p.kind === 'basket_threshold' && (
        <>
          <Field label="Поріг чека, грн">
            <input inputMode="decimal" defaultValue={fromKop(p.minSubtotal)} onChange={(e) => set({ minSubtotal: toKop(e.target.value) })} />
          </Field>
          <Field label="Знижка, %">
            <input type="number" min={0} max={100} value={p.percent ?? ''} onChange={(e) => set({ percent: num(e.target.value) })} />
          </Field>
          <Field label="або сума, грн">
            <input inputMode="decimal" defaultValue={fromKop(p.amount)} onChange={(e) => set({ amount: toKop(e.target.value) })} />
          </Field>
        </>
      )}

      <h3 className="wide">Правила поєднання</h3>
      <Field label="Пріоритет">
        <input type="number" value={p.priority ?? 0} onChange={(e) => set({ priority: num(e.target.value) })} />
      </Field>
      <Field label="Група взаємовиключення">
        <input value={p.group ?? ''} placeholder="напр. weekly" onChange={(e) => set({ group: e.target.value })} />
      </Field>
      <Field label="Ліміт застосувань">
        <input type="number" min={1} value={p.maxApplications ?? ''} placeholder="без ліміту" onChange={(e) => set({ maxApplications: num(e.target.value) })} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={p.combinable !== false} onChange={(e) => set({ combinable: e.target.checked })} />
        Сумується з іншими акціями
      </label>
      <label className="check">
        <input type="checkbox" checked={p.active !== false} onChange={(e) => set({ active: e.target.checked })} />
        Активна
      </label>

      <h3 className="wide">Умови</h3>
      <Field label="Мінімальна сума кошика, грн">
        <input inputMode="decimal" defaultValue={fromKop(cond.minSubtotal)} onChange={(e) => setCond({ minSubtotal: toKop(e.target.value) })} />
      </Field>
      <Multi label="Рівень клієнта" options={TIERS.map((t) => [t, t])} value={cond.customerTiers} onChange={(customerTiers) => setCond({ customerTiers })} />
      <Multi label="Канал" options={CHANNELS} value={cond.channels} onChange={(channels) => setCond({ channels })} />
      <Field label="Діє з">
        <input type="datetime-local" value={toInputDate(cond.validFrom)} onChange={(e) => setCond({ validFrom: fromInputDate(e.target.value) })} />
      </Field>
      <Field label="Діє до">
        <input type="datetime-local" value={toInputDate(cond.validTo)} onChange={(e) => setCond({ validTo: fromInputDate(e.target.value) })} />
      </Field>

      <p className="wide preview">Як це бачитиме маркетолог: {describe(p)}</p>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? 'wide' : undefined}>
      {label}
      {children}
    </label>
  );
}

/** Checkbox group: no selection means "any". */
function Multi({ label, options, value = [], onChange }: { label: string; options: string[][]; value?: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {options.map(([v, text]) => (
        <label key={v} className="check">
          <input type="checkbox" checked={value.includes(v)} onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))} />
          {text}
        </label>
      ))}
      {!value.length && <small className="muted">будь-який</small>}
    </fieldset>
  );
}

function TargetPicker({ label, value = {}, products, onChange }: { label: string; value?: Target; products: Product[]; onChange: (t: Target) => void }) {
  const categories = [...new Set(products.map((p) => p.category))];
  const selected = (e: ChangeEvent<HTMLSelectElement>) => [...e.target.selectedOptions].map((o) => o.value);
  return (
    <fieldset className="wide target">
      <legend>{label}</legend>
      <label>
        Категорії
        <select multiple value={value.categories ?? []} onChange={(e) => onChange({ ...value, categories: selected(e) })}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Товари
        <select multiple value={value.skus ?? []} onChange={(e) => onChange({ ...value, skus: selected(e) })}>
          {products.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <small className="muted">
        {!value.categories?.length && !value.skus?.length ? 'нічого не вибрано: акція діє на всі товари' : 'Cmd/Ctrl + клік, щоб вибрати кілька'}
      </small>
    </fieldset>
  );
}
