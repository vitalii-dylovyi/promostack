import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Basket, Promotion, Result, Strategy } from '@promostack/engine';
import { api, adminKey, type Calculation, type LogEntry, type Product } from './api.ts';
import { describe, kinds, money, reasons, strategies, templates } from './labels.ts';

type Tab = 'pos' | 'admin' | 'audit';

export function App() {
  const [tab, setTab] = useState<Tab>('pos');
  return (
    <>
      <header className="top">
        <strong className="logo">PromoStack</strong>
        <nav>
          {(
            [
              ['pos', 'Каса'],
              ['admin', 'Акції'],
              ['audit', 'Журнал'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <a className="tab" href="/docs" target="_blank" rel="noreferrer">
            API
          </a>
        </nav>
      </header>
      <main>{tab === 'pos' ? <Pos /> : tab === 'admin' ? <Admin /> : <Audit />}</main>
    </>
  );
}

function Pos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({ cola: 3, chips: 1 });
  const [tier, setTier] = useState('');
  const [channel, setChannel] = useState('pos');
  const [strategy, setStrategy] = useState<Strategy>('optimal');
  const [result, setResult] = useState<Calculation | null>(null);
  const [compare, setCompare] = useState<Record<Strategy, Result> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setError(e.message));
    api.promotions().then(setPromos).catch(() => {});
  }, []);

  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const promoName = (id: string) => promos.find((p) => p.id === id)?.name ?? id;
  const basket: Basket = useMemo(
    () => ({
      channel,
      customerTier: tier || undefined,
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
    <div className="pos">
      <section className="card">
        <h2>Товари</h2>
        <div className="grid">
          {products.map((p) => (
            <button key={p.sku} className="product" onClick={() => add(p.sku, 1)}>
              <span>{p.name}</span>
              <small>
                {p.category} · {money(p.unitPrice)}
              </small>
            </button>
          ))}
        </div>
        <div className="controls">
          <label>
            Клієнт
            <select value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="">без картки</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>
          </label>
          <label>
            Канал
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="pos">каса</option>
              <option value="web">сайт</option>
              <option value="app">застосунок</option>
            </select>
          </label>
          <label>
            Алгоритм
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              {Object.entries(strategies).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card receipt">
        <h2>Чек</h2>
        {error && <p className="error">{error}</p>}
        {!basket.lines.length && <p className="muted">Додайте товари зліва</p>}
        {result && basket.lines.length > 0 && (
          <>
            <table>
              <tbody>
                {result.lines.map((l) => (
                  <tr key={l.lineId}>
                    <td>
                      <div>{bySku.get(l.sku)?.name ?? l.sku}</div>
                      {l.adjustments.map((a) => (
                        <div key={a.promotionId} className="adj">
                          {promoName(a.promotionId)}: −{money(a.amount)}
                        </div>
                      ))}
                    </td>
                    <td className="qty">
                      <button onClick={() => add(l.sku, -1)} aria-label="менше">
                        −
                      </button>
                      {l.quantity}
                      <button onClick={() => add(l.sku, 1)} aria-label="більше">
                        +
                      </button>
                    </td>
                    <td className="num">
                      {l.discount > 0 && <s className="muted">{money(l.gross)}</s>}
                      <div>{money(l.net)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <dt>Сума</dt>
              <dd>{money(result.subtotal)}</dd>
              <dt>Знижка</dt>
              <dd className="save">−{money(result.discount)}</dd>
              <dt className="big">До сплати</dt>
              <dd className="big">{money(result.total)}</dd>
            </dl>
            <p className="muted small">
              {strategies[result.stats.strategy]} · {result.stats.timeMs} мс · вузлів пошуку: {result.stats.nodes}
              {result.stats.strategy === 'optimal' && (result.stats.optimal ? ' · оптимум доведено' : ' · найкраще знайдене в межах бюджету')}
            </p>
            <button className="secondary" onClick={() => api.compare(basket).then(setCompare, (e) => setError(e.message))}>
              Порівняти алгоритми
            </button>
            {compare && (
              <table className="compare">
                <thead>
                  <tr>
                    <th>Алгоритм</th>
                    <th className="num">Знижка</th>
                    <th className="num">Час</th>
                  </tr>
                </thead>
                <tbody>
                  {(['priority', 'greedy', 'optimal'] as const).map((s) => (
                    <tr key={s}>
                      <td>{strategies[s]}</td>
                      <td className="num">{money(compare[s].discount)}</td>
                      <td className="num">{compare[s].stats.timeMs} мс</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Пояснення</h2>
        {result && <Explanation result={result} />}
      </section>
    </div>
  );
}

function Explanation({ result }: { result: Result }) {
  return (
    <>
      <h3>Застосовано</h3>
      {!result.applied.length && <p className="muted">Жодна акція не підійшла</p>}
      <ul className="list">
        {result.applied.map((a) => (
          <li key={a.promotionId}>
            <b>{a.name}</b>
            <span className="save">−{money(a.discount)}</span>
            <small className="muted">застосувань: {a.applications}</small>
          </li>
        ))}
      </ul>
      <h3>Не застосовано</h3>
      <ul className="list">
        {result.rejected.map((r) => (
          <li key={r.promotionId}>
            <b>{r.name}</b>
            <span className={`tag ${r.reason}`}>{reasons[r.reason]}</span>
            <small className="muted">{r.detail}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function Admin() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [editing, setEditing] = useState<{ text: string; isNew: boolean } | null>(null);
  const [error, setError] = useState('');
  const [key, setKey] = useState(adminKey.get());

  const load = () => api.promotions().then(setPromos, (e) => setError(e.message));
  useEffect(() => void load(), []);

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
    let p: Promotion;
    try {
      p = JSON.parse(editing!.text);
    } catch {
      return setError('Некоректний JSON');
    }
    run(() => (editing!.isNew ? api.createPromotion(p) : api.updatePromotion(p)));
  };

  return (
    <div className="admin">
      <section className="card">
        <div className="row">
          <h2>Акції</h2>
          <label className="key">
            Ключ адміністратора
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                adminKey.set(e.target.value);
              }}
            />
          </label>
          <select value="" onChange={(e) => e.target.value && setEditing({ text: JSON.stringify(templates[e.target.value as Promotion['kind']], null, 2), isNew: true })}>
            <option value="">+ Нова акція…</option>
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {error && !editing && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Активна</th>
              <th>Назва</th>
              <th>Механіка</th>
              <th>Група</th>
              <th>Сумується</th>
              <th className="num">Пріоритет</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className={p.active === false ? 'muted' : ''}>
                <td>
                  <input type="checkbox" checked={p.active !== false} onChange={() => run(() => api.updatePromotion({ ...p, active: p.active === false }))} />
                </td>
                <td>
                  <b>{p.name}</b>
                  <div className="muted small">{p.id}</div>
                </td>
                <td>
                  {kinds[p.kind]}
                  <div className="muted small">{describe(p)}</div>
                </td>
                <td>{p.group ?? '—'}</td>
                <td>{p.combinable === false ? 'ні' : 'так'}</td>
                <td className="num">{p.priority ?? 0}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => setEditing({ text: JSON.stringify(p, null, 2), isNew: false })}>
                    Змінити
                  </button>
                  <button className="danger" onClick={() => confirm(`Видалити «${p.name}»?`) && run(() => api.deletePromotion(p.id))}>
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && (
        <section className="card">
          <h2>{editing.isNew ? 'Нова акція' : 'Редагування акції'}</h2>
          {error && <p className="error">Помилка валідації: {error}</p>}
          <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={18} spellCheck={false} />
          <div className="row">
            <button onClick={save}>Зберегти</button>
            <button className="secondary" onClick={() => (setEditing(null), setError(''))}>
              Скасувати
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => void api.calculations(100).then(setRows), []);
  return (
    <section className="card">
      <h2>Журнал розрахунків</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Час</th>
            <th>Канал</th>
            <th>Алгоритм</th>
            <th className="num">Сума</th>
            <th className="num">Знижка</th>
            <th className="num">До сплати</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td>{r.id}</td>
                <td>{new Date(r.at).toLocaleString('uk-UA')}</td>
                <td>{r.channel ?? '—'}</td>
                <td>{strategies[r.strategy]}</td>
                <td className="num">{money(r.subtotal)}</td>
                <td className="num save">−{money(r.discount)}</td>
                <td className="num">{money(r.total)}</td>
              </tr>
              {open === r.id && (
                <tr>
                  <td colSpan={7}>
                    <Explanation result={r.result} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
