// JSON Schemas: request validation (Ajv inside Fastify) and the OpenAPI document at /docs.
const money = { type: 'integer', minimum: 0, description: 'Amount in minor units (cents)' } as const;
const strings = { type: 'array', items: { type: 'string', minLength: 1 } } as const;

export const target = {
  $id: 'Target',
  type: 'object',
  additionalProperties: false,
  properties: { skus: strings, categories: strings },
  description: 'Empty target matches every item',
} as const;

export const line = {
  $id: 'Line',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'sku', 'unitPrice', 'quantity'],
  properties: {
    id: { type: 'string', minLength: 1 },
    sku: { type: 'string', minLength: 1 },
    name: { type: 'string' },
    category: { type: 'string' },
    unitPrice: money,
    quantity: { type: 'integer', minimum: 0, maximum: 1000 },
  },
} as const;

export const basket = {
  $id: 'Basket',
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: { type: 'array', items: { $ref: 'Line#' }, maxItems: 500 },
    customerTier: { type: 'string' },
    channel: { type: 'string' },
    at: { type: 'string', format: 'date-time' },
  },
} as const;

const base = {
  id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' },
  name: { type: 'string', minLength: 1, maxLength: 200 },
  priority: { type: 'integer' },
  combinable: { type: 'boolean' },
  group: { type: 'string', minLength: 1 },
  maxApplications: { type: 'integer', minimum: 1 },
  active: { type: 'boolean' },
  conditions: {
    type: 'object',
    additionalProperties: false,
    properties: {
      minSubtotal: money,
      customerTiers: strings,
      channels: strings,
      validFrom: { type: 'string', format: 'date-time' },
      validTo: { type: 'string', format: 'date-time' },
    },
  },
} as const;

const variant = (kind: string, required: string[], props: object) => ({
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'kind', ...required],
  properties: { ...base, kind: { const: kind }, ...props },
});
const percent = { type: 'number', exclusiveMinimum: 0, maximum: 100 } as const;

export const promotion = {
  $id: 'Promotion',
  type: 'object',
  required: ['kind'],
  discriminator: { propertyName: 'kind' },
  oneOf: [
    variant('percent_off', ['target', 'percent'], { target: { $ref: 'Target#' }, percent }),
    variant('amount_off', ['target', 'amount'], { target: { $ref: 'Target#' }, amount: { ...money, minimum: 1 } }),
    variant('buy_x_get_y', ['target', 'buy', 'get', 'percent'], {
      target: { $ref: 'Target#' },
      buy: { type: 'integer', minimum: 1 },
      get: { type: 'integer', minimum: 1 },
      percent,
    }),
    variant('bundle_price', ['components', 'price'], {
      components: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['target', 'quantity'],
          properties: { target: { $ref: 'Target#' }, quantity: { type: 'integer', minimum: 1 } },
        },
      },
      price: money,
    }),
    variant('basket_threshold', ['minSubtotal'], { minSubtotal: money, percent, amount: { ...money, minimum: 1 } }),
  ],
} as const;

export const strategy = { type: 'string', enum: ['optimal', 'priority', 'greedy'] } as const;
