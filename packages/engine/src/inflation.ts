import { money } from './money';
import type { Money } from './types';

/** Future nominal amount needed to keep today's purchasing power. */
export function inflate(amount: number, rate: number, years: number): number {
  return amount * (1 + rate) ** Math.max(0, years);
}

/** Real value of a nominal amount after `years` of inflation. */
export function realValue(amount: number, rate: number, years: number): number {
  return amount / (1 + rate) ** Math.max(0, years);
}

export function inflationAdjusted(
  calcId: string,
  base: Money,
  rate: number,
  years: number,
): Money {
  return money(
    calcId,
    inflate(base.value, rate, years),
    `${base.value.toLocaleString('ja-JP')}万円 ×（1＋${(rate * 100).toFixed(1)}%）^${years}年`,
    { base: base.value, rate: rate * 100, years },
  );
}
