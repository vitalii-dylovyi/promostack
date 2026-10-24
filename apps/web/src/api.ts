import type { Basket, Promotion, Result, Strategy } from '@promostack/engine';

export type Product = { sku: string; name: string; category: string; unitPrice: number };
export type Calculation = Result & { calculationId: number | null };
export type LogEntry = { id: number; at: string; channel: string | null; strategy: Strategy; subtotal: number; discount: number; total: number; result: Result };

const KEY = 'promostack.adminKey';
export const adminKey = {
  get: () => localStorage.getItem(KEY) ?? '',
  set: (v: string) => localStorage.setItem(KEY, v),
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': adminKey.get() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
  return data;
}

export const api = {
  products: () => call<Product[]>('GET', '/api/products'),
  promotions: () => call<Promotion[]>('GET', '/api/promotions'),
  createPromotion: (p: Promotion) => call<Promotion>('POST', '/api/promotions', p),
  updatePromotion: (p: Promotion) => call<Promotion>('PUT', `/api/promotions/${encodeURIComponent(p.id)}`, p),
  deletePromotion: (id: string) => call<void>('DELETE', `/api/promotions/${encodeURIComponent(id)}`),
  calculate: (basket: Basket, strategy: Strategy) => call<Calculation>('POST', '/api/calculate', { basket, strategy }),
  compare: (basket: Basket) => call<Record<Strategy, Result>>('POST', '/api/compare', { basket }),
  calculations: (limit = 50) => call<LogEntry[]>('GET', `/api/calculations?limit=${limit}`),
};
