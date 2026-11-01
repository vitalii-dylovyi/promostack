import { useEffect, useMemo, useState } from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';
import type { Basket, Promotion, Reason, Result, Strategy } from '@promostack/engine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Choice } from '@/components/choice';
import { api, type Calculation, type Product } from './api.ts';
import { money, reasons, strategies } from './labels.ts';

const NONE = 'none';
// Reasons where the promotion was eligible but lost to a better combination: worth highlighting.
const LOST: Reason[] = ['BETTER_ALTERNATIVE', 'GROUP_CONFLICT', 'NOT_COMBINABLE'];

export function Pos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({ cola: 3, chips: 1 });
  const [tier, setTier] = useState(NONE);
  const [channel, setChannel] = useState('pos');
  const [strategy, setStrategy] = useState<Strategy>('optimal');
  const [result, setResult] = useState<Calculation | null>(null);
  const [compare, setCompare] = useState<Record<Strategy, Result> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.products().then(setProducts, (e) => setError(e.message));
    api.promotions().then(setPromos, () => {});
  }, []);

  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const promoName = (id: string) => promos.find((p) => p.id === id)?.name ?? id;
  const basket: Basket = useMemo(
    () => ({
      channel,
      customerTier: tier === NONE ? undefined : tier,
      lines: Object.entries(cart)
        .filter(([sku, q]) => q > 0 && bySku.has(sku))
        .map(([sku, quantity]) => {
          const p = bySku.get(sku)!;
          return { id: sku, sku, name: p.name, category: p.category, unitPrice: p.unitPrice, quantity };
        }),
    }),
    [cart, tier, channel, bySku],
  );

  useEffect(() => {
    if (!products.length) return;
    setCompare(null);
    api.calculate(basket, strategy).then(setResult, (e) => setError(e.message));
  }, [basket, strategy, products.length]);

  const add = (sku: string, d: number) => setCart((c) => ({ ...c, [sku]: Math.max(0, (c[sku] ?? 0) + d) }));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Товари</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {products.map((p) => (
              <Button
                key={p.sku}
                variant="outline"
                data-product={p.name}
                className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal"
                onClick={() => add(p.sku, 1)}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {p.category} · {money(p.unitPrice)}
                </span>
              </Button>
            ))}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <Choice
              label="Клієнт"
              value={tier}
              onChange={setTier}
              options={[
                [NONE, 'без картки'],
                ['silver', 'Silver'],
                ['gold', 'Gold'],
              ]}
            />
            <Choice
              label="Канал"
              value={channel}
              onChange={setChannel}
              options={[
                ['pos', 'каса'],
                ['web', 'сайт'],
                ['app', 'застосунок'],
              ]}
            />
            <div className="col-span-2">
              <Choice label="Алгоритм" value={strategy} onChange={(v) => setStrategy(v as Strategy)} options={Object.entries(strategies)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-section="receipt">
        <CardHeader>
          <CardTitle>Чек</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!basket.lines.length && <p className="text-sm text-muted-foreground">Додайте товари зліва</p>}
          {result && basket.lines.length > 0 && (
            <>
              <Table>
                <TableBody>
                  {result.lines.map((l) => (
                    <TableRow key={l.lineId}>
                      <TableCell className="align-top whitespace-normal">
                        <div className="font-medium">{bySku.get(l.sku)?.name ?? l.sku}</div>
                        {l.adjustments.map((a) => (
                          <div key={a.promotionId} className="text-xs text-emerald-700">
                            {promoName(a.promotionId)}: −{money(a.amount)}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon-xs" aria-label="менше" onClick={() => add(l.sku, -1)}>
                            <MinusIcon />
                          </Button>
                          <span className="w-5 text-center tabular-nums">{l.quantity}</span>
                          <Button variant="outline" size="icon-xs" aria-label="більше" onClick={() => add(l.sku, 1)}>
                            <PlusIcon />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {l.discount > 0 && <div className="text-xs text-muted-foreground line-through">{money(l.gross)}</div>}
                        <div>{money(l.net)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
                <dt className="text-muted-foreground">Сума</dt>
                <dd className="text-right">{money(result.subtotal)}</dd>
                <dt className="text-muted-foreground">Знижка</dt>
                <dd className="text-right text-emerald-700">−{money(result.discount)}</dd>
                <dt className="pt-1 text-lg font-semibold">До сплати</dt>
                <dd className="pt-1 text-right text-lg font-semibold">{money(result.total)}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                {strategies[result.stats.strategy]} · {result.stats.timeMs} мс · вузлів пошуку: {result.stats.nodes}
                {result.stats.strategy === 'optimal' && (result.stats.optimal ? ' · оптимум доведено' : ' · найкраще знайдене в межах бюджету')}
              </p>
              <Button variant="outline" className="w-fit" onClick={() => api.compare(basket).then(setCompare, (e) => setError(e.message))}>
                Порівняти алгоритми
              </Button>
              {compare && (
                <Table data-section="compare">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Алгоритм</TableHead>
                      <TableHead className="text-right">Знижка</TableHead>
                      <TableHead className="text-right">Час</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(['priority', 'greedy', 'optimal'] as const).map((s) => (
                      <TableRow key={s}>
                        <TableCell>{strategies[s]}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(compare[s].discount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{compare[s].stats.timeMs} мс</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card data-section="explanation">
        <CardHeader>
          <CardTitle>Пояснення</CardTitle>
        </CardHeader>
        <CardContent>{result && <Explanation result={result} />}</CardContent>
      </Card>
    </div>
  );
}

export function Explanation({ result }: { result: Result }) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Застосовано</h3>
        {!result.applied.length && <p className="text-sm text-muted-foreground">Жодна акція не підійшла</p>}
        {result.applied.map((a) => (
          <div key={a.promotionId} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">застосувань: {a.applications}</div>
            </div>
            <span className="text-sm font-medium whitespace-nowrap text-emerald-700 tabular-nums">−{money(a.discount)}</span>
          </div>
        ))}
      </section>
      <section className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Не застосовано</h3>
        {result.rejected.map((r) => (
          <div key={r.promotionId} className="grid gap-1 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium">{r.name}</span>
              <Badge
                variant={LOST.includes(r.reason) ? 'outline' : 'secondary'}
                className={LOST.includes(r.reason) ? 'border-amber-300 bg-amber-50 text-amber-800' : undefined}
              >
                {reasons[r.reason]}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{r.detail}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
