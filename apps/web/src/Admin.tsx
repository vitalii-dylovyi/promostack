import { useEffect, useState } from 'react';
import type { Promotion } from '@promostack/engine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Choice } from '@/components/choice';
import { api, adminKey, type Product } from './api.ts';
import { describe, kinds, templates } from './labels.ts';
import { PromoForm } from './PromoForm.tsx';
import { clean } from './promoForm.ts';

type Editing = { draft: Promotion; isNew: boolean; json: string | null; session: number };

export function Admin() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState('');
  const [key, setKey] = useState(adminKey.get());
  const names = new Map(products.map((x) => [x.sku, x.name]));

  const load = () => api.promotions().then(setPromos, (e) => setError(e.message));
  useEffect(() => {
    load();
    api.products().then(setProducts, () => {});
  }, []);

  const edit = (draft: Promotion, isNew: boolean) => {
    setError('');
    setEditing({ draft, isNew, json: null, session: Date.now() });
  };
  const run = (f: () => Promise<unknown>) =>
    f().then(
      () => {
        setError('');
        setEditing(null);
        load();
      },
      (e) => setError(e.message),
    );

  const save = () => {
    let p = editing!.draft;
    if (editing!.json !== null) {
      try {
        p = JSON.parse(editing!.json);
      } catch {
        return setError('Некоректний JSON');
      }
    }
    p = clean(p);
    run(() => (editing!.isNew ? api.createPromotion(p) : api.updatePromotion(p)));
  };
  const toggleJson = () => {
    const e = editing!;
    if (e.json === null) return setEditing({ ...e, json: JSON.stringify(clean(e.draft), null, 2) });
    try {
      setEditing({ ...e, draft: JSON.parse(e.json), json: null, session: Date.now() });
    } catch {
      setError('Некоректний JSON');
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Акції</CardTitle>
          <CardAction className="flex items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="admin-key" className="text-xs text-muted-foreground">
                Ключ адміністратора
              </Label>
              <Input
                id="admin-key"
                type="password"
                className="w-48"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  adminKey.set(e.target.value);
                }}
              />
            </div>
            <Choice
              value=""
              placeholder="+ Нова акція…"
              className="w-52"
              options={Object.entries(kinds)}
              onChange={(k) => edit(templates[k as Promotion['kind']], true)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {error && !editing && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Активна</TableHead>
                <TableHead>Назва</TableHead>
                <TableHead>Механіка</TableHead>
                <TableHead>Група</TableHead>
                <TableHead>Сумується</TableHead>
                <TableHead className="text-right">Пріоритет</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.map((p) => (
                <TableRow key={p.id} data-promo={p.id} className={p.active === false ? 'text-muted-foreground' : undefined}>
                  <TableCell>
                    {/* flex keeps the inline switch off the text baseline, centred in two-line rows */}
                    <div className="flex items-center">
                      <Switch
                        checked={p.active !== false}
                        aria-label={`Активна: ${p.name}`}
                        onCheckedChange={(on) => run(() => api.updatePromotion({ ...p, active: on }))}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.id}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {kinds[p.kind]}
                    <div className="text-xs text-muted-foreground">{describe(p, names)}</div>
                  </TableCell>
                  <TableCell>{p.group ?? '-'}</TableCell>
                  <TableCell>{p.combinable === false ? 'ні' : 'так'}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.priority ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => edit(p, false)}>
                        Змінити
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => confirm(`Видалити «${p.name}»?`) && run(() => api.deletePromotion(p.id))}>
                        Видалити
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <Card data-section="editor">
          <CardHeader>
            <CardTitle>{editing.isNew ? 'Нова акція' : 'Редагування акції'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>Помилка валідації: {error}</AlertDescription>
              </Alert>
            )}
            {editing.json === null ? (
              <PromoForm
                key={`${editing.session}-${editing.draft.kind}`}
                value={editing.draft}
                isNew={editing.isNew}
                products={products}
                onChange={(draft) => setEditing({ ...editing, draft })}
              />
            ) : (
              <Textarea className="min-h-80 font-mono text-xs" value={editing.json} spellCheck={false} onChange={(e) => setEditing({ ...editing, json: e.target.value })} />
            )}
            <div className="flex gap-2">
              <Button onClick={save}>Зберегти</Button>
              <Button variant="outline" onClick={toggleJson}>
                {editing.json === null ? 'Режим JSON' : 'Повернутися до форми'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setError('');
                }}
              >
                Скасувати
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
