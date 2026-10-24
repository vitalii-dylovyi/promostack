/** Integer amount in minor currency units (cents, kopiyky). Never a float. */
export type Money = number;

export interface Line {
  id: string;
  sku: string;
  name?: string;
  category?: string;
  unitPrice: Money;
  quantity: number;
}

export interface Basket {
  lines: Line[];
  customerTier?: string;
  channel?: string;
  /** ISO timestamp of the purchase; defaults to now. */
  at?: string;
}

/** Empty target matches every item. */
export interface Target {
  skus?: string[];
  categories?: string[];
}

export interface Conditions {
  /** Minimum gross basket subtotal for the promotion to be considered. */
  minSubtotal?: Money;
  customerTiers?: string[];
  channels?: string[];
  validFrom?: string;
  validTo?: string;
}

interface PromotionBase {
  id: string;
  name: string;
  /** Higher runs first in the priority strategy and wins ties. */
  priority?: number;
  /** false: cannot be combined with any other promotion in the basket. */
  combinable?: boolean;
  /** At most one promotion of a group is applied per basket. */
  group?: string;
  maxApplications?: number;
  active?: boolean;
  conditions?: Conditions;
}

export type PercentOff = PromotionBase & { kind: 'percent_off'; target: Target; percent: number };
export type AmountOff = PromotionBase & { kind: 'amount_off'; target: Target; amount: Money };
/** Buy `buy` items, get `get` cheaper items of the set at `percent` off (100 = free). */
export type BuyXGetY = PromotionBase & { kind: 'buy_x_get_y'; target: Target; buy: number; get: number; percent: number };
export type BundlePrice = PromotionBase & {
  kind: 'bundle_price';
  components: { target: Target; quantity: number }[];
  price: Money;
};
/** Applied once to the subtotal left after item discounts. */
export type BasketThreshold = PromotionBase & {
  kind: 'basket_threshold';
  minSubtotal: Money;
  percent?: number;
  amount?: Money;
};

export type Promotion = PercentOff | AmountOff | BuyXGetY | BundlePrice | BasketThreshold;
export type ItemPromotion = Exclude<Promotion, BasketThreshold>;

export type Strategy = 'optimal' | 'priority' | 'greedy';

export type Reason =
  | 'INACTIVE'
  | 'OUTSIDE_VALIDITY'
  | 'CUSTOMER_TIER'
  | 'CHANNEL'
  | 'MIN_SUBTOTAL'
  | 'NO_ELIGIBLE_ITEMS'
  | 'NOT_ENOUGH_ITEMS'
  | 'NOT_BENEFICIAL'
  | 'GROUP_CONFLICT'
  | 'NOT_COMBINABLE'
  | 'BETTER_ALTERNATIVE';

export interface Adjustment {
  promotionId: string;
  amount: Money;
}

export interface LineResult {
  lineId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
  gross: Money;
  discount: Money;
  net: Money;
  adjustments: Adjustment[];
}

export interface AppliedPromotion {
  promotionId: string;
  name: string;
  applications: number;
  discount: Money;
}

export interface RejectedPromotion {
  promotionId: string;
  name: string;
  reason: Reason;
  detail: string;
}

export interface Result {
  subtotal: Money;
  discount: Money;
  total: Money;
  lines: LineResult[];
  applied: AppliedPromotion[];
  rejected: RejectedPromotion[];
  stats: { strategy: Strategy; nodes: number; optimal: boolean; timeMs: number };
}

export interface Options {
  strategy?: Strategy;
  /** Search nodes before the optimal strategy returns its best-so-far answer. */
  nodeBudget?: number;
  /** Disable bound pruning: full enumeration, used as the reference in tests and benchmarks. */
  exhaustive?: boolean;
}
