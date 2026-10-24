import type { Promotion, Reason, Strategy } from '@promostack/engine';

export const money = (cents: number) =>
  (cents / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' грн';

export const reasons: Record<Reason, string> = {
  INACTIVE: 'Акцію вимкнено',
  OUTSIDE_VALIDITY: 'Поза терміном дії',
  CUSTOMER_TIER: 'Не той рівень клієнта',
  CHANNEL: 'Не той канал продажу',
  MIN_SUBTOTAL: 'Замала сума чека',
  NO_ELIGIBLE_ITEMS: 'Немає відповідних товарів',
  NOT_ENOUGH_ITEMS: 'Недостатньо товарів',
  NOT_BENEFICIAL: 'Не дає вигоди',
  GROUP_CONFLICT: 'Конфлікт групи акцій',
  NOT_COMBINABLE: 'Не сумується з іншими',
  BETTER_ALTERNATIVE: 'Є вигідніша комбінація',
};

export const strategies: Record<Strategy, string> = {
  optimal: 'Оптимальна (гілки й межі)',
  greedy: 'Жадібна за вигодою',
  priority: 'Послідовна за пріоритетом',
};

export const kinds: Record<Promotion['kind'], string> = {
  percent_off: 'Знижка у %',
  amount_off: 'Знижка в грн',
  buy_x_get_y: 'Купи X, отримай Y',
  bundle_price: 'Комплект за ціною',
  basket_threshold: 'Знижка від суми чека',
};

const targetText = (t: { skus?: string[]; categories?: string[] }) =>
  [t.skus?.length ? `товари: ${t.skus.join(', ')}` : '', t.categories?.length ? `категорії: ${t.categories.join(', ')}` : '']
    .filter(Boolean)
    .join('; ') || 'усі товари';

export function describe(p: Promotion): string {
  switch (p.kind) {
    case 'percent_off':
      return `-${p.percent}% (${targetText(p.target)})`;
    case 'amount_off':
      return `-${money(p.amount)} за одиницю (${targetText(p.target)})`;
    case 'buy_x_get_y':
      return `${p.buy}+${p.get}: ${p.percent === 100 ? 'безкоштовно' : `-${p.percent}%`} на дешевший (${targetText(p.target)})`;
    case 'bundle_price':
      return `${p.components.map((c) => `${c.quantity}× ${targetText(c.target)}`).join(' + ')} за ${money(p.price)}`;
    case 'basket_threshold':
      return `від ${money(p.minSubtotal)}: ${p.percent ? `-${p.percent}%` : ''}${p.amount ? ` -${money(p.amount)}` : ''}`;
  }
}

export const templates: Record<Promotion['kind'], Promotion> = {
  percent_off: { id: 'new-percent', name: 'Нова знижка у %', kind: 'percent_off', target: { categories: ['drinks'] }, percent: 10, priority: 0 },
  amount_off: { id: 'new-amount', name: 'Нова знижка в грн', kind: 'amount_off', target: { skus: ['coffee'] }, amount: 2000, priority: 0 },
  buy_x_get_y: { id: 'new-bxgy', name: '2+1', kind: 'buy_x_get_y', target: { skus: ['water'] }, buy: 2, get: 1, percent: 100, priority: 0 },
  bundle_price: {
    id: 'new-bundle', name: 'Сніданок', kind: 'bundle_price', price: 9900, priority: 0,
    components: [{ target: { skus: ['croissant'] }, quantity: 1 }, { target: { skus: ['coffee'] }, quantity: 1 }],
  },
  basket_threshold: { id: 'new-threshold', name: 'Від 1000 грн -7%', kind: 'basket_threshold', minSubtotal: 100000, percent: 7, priority: 0 },
};
