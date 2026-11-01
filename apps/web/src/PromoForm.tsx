import type { ReactNode } from 'react';
import { CircleHelpIcon, PlusIcon, TrashIcon } from 'lucide-react';
import type { Promotion, Target } from '@promostack/engine';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Choice } from '@/components/choice';
import type { Product } from './api.ts';
import { describe, kinds, templates } from './labels.ts';
import { fromInputDate, fromKop, toInputDate, toKop } from './promoForm.ts';

const TIERS: [string, string][] = [
  ['silver', 'Silver'],
  ['gold', 'Gold'],
];
const CHANNELS: [string, string][] = [
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
    <div className="grid gap-x-4 gap-y-4 md:grid-cols-3" data-section="promo-form">
      <Field label="Механіка">
        <Choice
          value={p.kind}
          disabled={!isNew}
          options={Object.entries(kinds)}
          onChange={(k) => onChange({ ...templates[k as Promotion['kind']], id: p.id, name: p.name })}
        />
      </Field>
      <Field label="Ідентифікатор" hint="Латиниця, цифри, «-» і «_». Після створення не змінюється.">
        <Input value={p.id} disabled={!isNew} onChange={(e) => set({ id: e.target.value })} />
      </Field>
      <Field label="Назва" className="md:col-span-3">
        <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      {p.kind !== 'bundle_price' && p.kind !== 'basket_threshold' && (
        <TargetPicker label="На які товари" value={p.target} products={products} onChange={(target) => set({ target })} />
      )}
      {(p.kind === 'percent_off' || p.kind === 'buy_x_get_y') && (
        <Field label="Знижка, %">
          <Input type="number" min={1} max={100} value={p.percent} onChange={(e) => set({ percent: num(e.target.value) })} />
        </Field>
      )}
      {p.kind === 'amount_off' && (
        <Field label="Знижка за одиницю, грн">
          <Input inputMode="decimal" defaultValue={fromKop(p.amount)} onChange={(e) => set({ amount: toKop(e.target.value) })} />
        </Field>
      )}
      {p.kind === 'buy_x_get_y' && (
        <>
          <Field label="Купи, шт.">
            <Input type="number" min={1} value={p.buy} onChange={(e) => set({ buy: num(e.target.value) })} />
          </Field>
          <Field label="Отримай, шт." hint="Знижку отримують найдешевші одиниці з кожного набору.">
            <Input type="number" min={1} value={p.get} onChange={(e) => set({ get: num(e.target.value) })} />
          </Field>
        </>
      )}
      {p.kind === 'bundle_price' && (
        <>
          <Field label="Ціна комплекту, грн">
            <Input inputMode="decimal" defaultValue={fromKop(p.price)} onChange={(e) => set({ price: toKop(e.target.value) })} />
          </Field>
          {p.components.map((c, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3 md:col-span-3">
              <TargetPicker
                label={`Складник ${i + 1}`}
                value={c.target}
                products={products}
                bare
                onChange={(target) => set({ components: p.components.map((x, j) => (j === i ? { ...x, target } : x)) })}
              />
              <div className="flex items-end gap-3">
                <Field label="Кількість" className="w-32">
                  <Input
                    type="number"
                    min={1}
                    value={c.quantity}
                    onChange={(e) => set({ components: p.components.map((x, j) => (j === i ? { ...x, quantity: num(e.target.value) } : x)) })}
                  />
                </Field>
                {p.components.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => set({ components: p.components.filter((_, j) => j !== i) })}>
                    <TrashIcon /> Прибрати складник
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-fit" onClick={() => set({ components: [...p.components, { target: {}, quantity: 1 }] })}>
            <PlusIcon /> Складник
          </Button>
        </>
      )}
      {p.kind === 'basket_threshold' && (
        <>
          <Field label="Поріг чека, грн" hint="Перевіряється після знижок на товари.">
            <Input inputMode="decimal" defaultValue={fromKop(p.minSubtotal)} onChange={(e) => set({ minSubtotal: toKop(e.target.value) })} />
          </Field>
          <Field label="Знижка, %">
            <Input type="number" min={0} max={100} value={p.percent ?? ''} onChange={(e) => set({ percent: num(e.target.value) })} />
          </Field>
          <Field label="або сума, грн">
            <Input inputMode="decimal" defaultValue={fromKop(p.amount)} onChange={(e) => set({ amount: toKop(e.target.value) })} />
          </Field>
        </>
      )}

      <Section title="Правила поєднання" />
      <Field label="Пріоритет" hint="Використовується лише послідовним алгоритмом і для розв'язання нічиїх. Оптимальний алгоритм обирає за вигодою.">
        <Input type="number" value={p.priority ?? 0} onChange={(e) => set({ priority: num(e.target.value) })} />
      </Field>
      <Field label="Група взаємовиключення" hint="З акцій однієї групи в кошику діє лише одна, найвигідніша. Наприклад, «пропозиції тижня».">
        <Input value={p.group ?? ''} placeholder="напр. weekly" onChange={(e) => set({ group: e.target.value })} />
      </Field>
      <Field label="Ліміт застосувань" hint="Скільки разів акцію можна застосувати в одному чеку.">
        <Input type="number" min={1} value={p.maxApplications ?? ''} placeholder="без ліміту" onChange={(e) => set({ maxApplications: num(e.target.value) })} />
      </Field>
      <Toggle
        id="combinable"
        label="Сумується з іншими акціями"
        hint="Якщо вимкнено, акція діє лише сама і застосовується, тільки коли вигідніша за будь-яку комбінацію інших."
        checked={p.combinable !== false}
        onChange={(v) => set({ combinable: v })}
      />
      <Toggle id="active" label="Активна" checked={p.active !== false} onChange={(v) => set({ active: v })} />

      <Section title="Умови" />
      <Field label="Мінімальна сума кошика, грн">
        <Input inputMode="decimal" defaultValue={fromKop(cond.minSubtotal)} onChange={(e) => setCond({ minSubtotal: toKop(e.target.value) })} />
      </Field>
      <Checks label="Рівень клієнта" options={TIERS} value={cond.customerTiers} onChange={(customerTiers) => setCond({ customerTiers })} />
      <Checks label="Канал" options={CHANNELS} value={cond.channels} onChange={(channels) => setCond({ channels })} />
      <Field label="Діє з">
        <Input type="datetime-local" value={toInputDate(cond.validFrom)} onChange={(e) => setCond({ validFrom: fromInputDate(e.target.value) })} />
      </Field>
      <Field label="Діє до">
        <Input type="datetime-local" value={toInputDate(cond.validTo)} onChange={(e) => setCond({ validTo: fromInputDate(e.target.value) })} />
      </Field>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm md:col-span-3" data-section="preview">
        <span className="text-muted-foreground">Як це бачитиме маркетолог: </span>
        {describe(p, new Map(products.map((x) => [x.sku, x.name])))}
      </p>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CircleHelpIcon className="size-3.5 cursor-help text-muted-foreground" aria-label={text} />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`grid content-start gap-1.5 ${className ?? ''}`} data-field={label}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </Label>
      {children}
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="grid gap-2 pt-2 md:col-span-3">
      <Separator />
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 self-end pb-1.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {hint && <Hint text={hint} />}
    </div>
  );
}

/** Checkbox group: nothing selected means "any". */
function Checks({ label, options, value = [], onChange }: { label: string; options: [string, string][]; value?: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v));
  return (
    <div className="grid content-start gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex h-8 flex-wrap items-center gap-x-4 gap-y-1">
        {options.map(([v, text]) => (
          <Label key={v} className="text-sm font-normal">
            <Checkbox checked={value.includes(v)} onCheckedChange={(on) => toggle(v, on === true)} />
            {text}
          </Label>
        ))}
        {!value.length && <span className="text-xs text-muted-foreground">будь-який</span>}
      </div>
    </div>
  );
}

function TargetPicker({
  label,
  value = {},
  products,
  bare,
  onChange,
}: {
  label: string;
  value?: Target;
  products: Product[];
  bare?: boolean;
  onChange: (t: Target) => void;
}) {
  const categories = [...new Set(products.map((p) => p.category))];
  const toggle = (key: 'skus' | 'categories', v: string, on: boolean) => {
    const cur = value[key] ?? [];
    onChange({ ...value, [key]: on ? [...cur, v] : cur.filter((x) => x !== v) });
  };
  const list = (key: 'skus' | 'categories', items: [string, string][]) => (
    <ScrollArea className="h-36 rounded-md border">
      <div className="grid gap-1.5 p-2">
        {items.map(([v, text]) => (
          <Label key={v} className="text-sm font-normal">
            <Checkbox checked={value[key]?.includes(v) ?? false} onCheckedChange={(on) => toggle(key, v, on === true)} />
            {text}
          </Label>
        ))}
      </div>
    </ScrollArea>
  );
  const nothing = !value.categories?.length && !value.skus?.length;
  return (
    <div className={`grid gap-2 md:col-span-3 ${bare ? '' : 'rounded-lg border p-3'}`} data-section="target">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Категорії</Label>
          {list('categories', categories.map((c) => [c, c]))}
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Товари</Label>
          {list('skus', products.map((p) => [p.sku, p.name]))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{nothing ? 'Нічого не вибрано: акція діє на всі товари.' : 'Акція діє на вибрані категорії та товари.'}</p>
    </div>
  );
}
