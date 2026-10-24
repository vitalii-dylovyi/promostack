import type { Promotion } from '@promostack/engine';

// Demo store: prices in kopiyky.
export const products = [
  { sku: 'milk', name: 'Молоко 2,5% 1 л', category: 'dairy', unitPrice: 4290 },
  { sku: 'kefir', name: 'Кефір 1% 900 г', category: 'dairy', unitPrice: 3890 },
  { sku: 'cheese', name: 'Сир твердий 200 г', category: 'dairy', unitPrice: 12900 },
  { sku: 'bread', name: 'Хліб житній', category: 'bakery', unitPrice: 3290 },
  { sku: 'croissant', name: 'Круасан', category: 'bakery', unitPrice: 2990 },
  { sku: 'cola', name: 'Cola 1,5 л', category: 'drinks', unitPrice: 4990 },
  { sku: 'juice', name: 'Сік апельсиновий 1 л', category: 'drinks', unitPrice: 6490 },
  { sku: 'water', name: 'Вода 1,5 л', category: 'drinks', unitPrice: 1990 },
  { sku: 'chips', name: 'Чипси 120 г', category: 'snacks', unitPrice: 5490 },
  { sku: 'choco', name: 'Шоколад 90 г', category: 'snacks', unitPrice: 4790 },
  { sku: 'coffee', name: 'Кава мелена 250 г', category: 'coffee', unitPrice: 18990 },
  { sku: 'burger', name: 'Бургер', category: 'readyfood', unitPrice: 8990 },
  { sku: 'fries', name: 'Картопля фрі', category: 'readyfood', unitPrice: 4490 },
  { sku: 'apples', name: 'Яблука 1 кг', category: 'produce', unitPrice: 3490 },
  { sku: 'dish-soap', name: 'Засіб для посуду', category: 'household', unitPrice: 7990 },
];

export const promotions: Promotion[] = [
  { id: 'drinks-10', name: '-10% на напої', kind: 'percent_off', target: { categories: ['drinks'] }, percent: 10, priority: 10 },
  { id: 'cola-3for2', name: 'Cola 3 за ціною 2', kind: 'buy_x_get_y', target: { skus: ['cola'] }, buy: 2, get: 1, percent: 100, priority: 5 },
  {
    id: 'menu-149',
    name: 'Комбо: бургер, фрі й напій за 149 грн',
    kind: 'bundle_price',
    components: [
      { target: { skus: ['burger'] }, quantity: 1 },
      { target: { skus: ['fries'] }, quantity: 1 },
      { target: { categories: ['drinks'] }, quantity: 1 },
    ],
    price: 14900,
    priority: 3,
  },
  { id: 'choco-1plus1', name: 'Шоколад: другий за пів ціни', kind: 'buy_x_get_y', target: { skus: ['choco'] }, buy: 1, get: 1, percent: 50, priority: 4 },
  { id: 'dairy-gold', name: '-15% на молочне для Gold', kind: 'percent_off', target: { categories: ['dairy'] }, percent: 15, group: 'weekly', priority: 6, conditions: { customerTiers: ['gold'] } },
  { id: 'coffee-50', name: '-50 грн на каву', kind: 'amount_off', target: { skus: ['coffee'] }, amount: 5000, group: 'weekly', priority: 7, maxApplications: 2 },
  { id: 'spend-500', name: '-5% на чек від 500 грн', kind: 'basket_threshold', minSubtotal: 50000, percent: 5, priority: 1 },
  { id: 'web-100', name: '-100 грн онлайн від 800 грн', kind: 'basket_threshold', minSubtotal: 80000, amount: 10000, priority: 2, conditions: { channels: ['web'] } },
  { id: 'black-friday', name: '-20% на все (не сумується)', kind: 'percent_off', target: {}, percent: 20, combinable: false, active: false, priority: 20 },
];
