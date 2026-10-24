import { DatabaseSync } from 'node:sqlite';
import type { Promotion, Result } from '@promostack/engine';
import { products, promotions } from './seed.ts';

export type Product = { sku: string; name: string; category: string; unitPrice: number };

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS promotions (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit_price INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, channel TEXT, strategy TEXT NOT NULL,
      subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, total INTEGER NOT NULL,
      request TEXT NOT NULL, result TEXT NOT NULL);
  `);
  if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
    const insert = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?)');
    for (const p of products) insert.run(p.sku, p.name, p.category, p.unitPrice);
    for (const p of promotions) savePromotion(db, p);
  }
  return db;
}

export type Db = DatabaseSync;

export const listPromotions = (db: Db): Promotion[] =>
  db.prepare('SELECT data FROM promotions ORDER BY id').all().map((r) => JSON.parse(r.data as string));

export const getPromotion = (db: Db, id: string): Promotion | undefined => {
  const r = db.prepare('SELECT data FROM promotions WHERE id = ?').get(id);
  return r && JSON.parse(r.data as string);
};

export const savePromotion = (db: Db, p: Promotion) =>
  db
    .prepare('INSERT INTO promotions VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .run(p.id, JSON.stringify(p), new Date().toISOString());

export const deletePromotion = (db: Db, id: string) => db.prepare('DELETE FROM promotions WHERE id = ?').run(id).changes > 0;

export const listProducts = (db: Db): Product[] =>
  db.prepare('SELECT sku, name, category, unit_price AS unitPrice FROM products ORDER BY category, name').all() as Product[];

export const logCalculation = (db: Db, request: unknown, channel: string | undefined, r: Result) =>
  db
    .prepare('INSERT INTO calculations (at, channel, strategy, subtotal, discount, total, request, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), channel ?? null, r.stats.strategy, r.subtotal, r.discount, r.total, JSON.stringify(request), JSON.stringify(r))
    .lastInsertRowid;

export const listCalculations = (db: Db, limit: number) =>
  db
    .prepare('SELECT id, at, channel, strategy, subtotal, discount, total, result FROM calculations ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map((r) => ({ ...r, result: JSON.parse(r.result as string) }));
