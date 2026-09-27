import { money } from './money';
import type { EngineSettings, Money } from './types';

/**
 * 保険料予算の目安（ヒューリスティック・上限）。
 * 経常利益が未入力または0以下の場合は年商×0.5%（最小）を仮置きし、同じ比率で他の段階を決める。
 */
export function calcBudget(
  revenue: number,
  ordinaryProfit: number | null | undefined,
  s: EngineSettings,
): { min: Money; balanced: Money; max: Money; assumed: boolean; reason: string | null } {
  const r = s.budgetRates;
  if (ordinaryProfit != null && ordinaryProfit > 0) {
    const mk = (tier: 'min' | 'balanced' | 'max', label: string) =>
      money(`calc.budget.${tier}`, ordinaryProfit * r[tier], `経常利益 ${ordinaryProfit.toLocaleString('ja-JP')}万円 × ${(r[tier] * 100).toFixed(0)}%（${label}の目安）`, { ordinaryProfit, rate: r[tier] * 100 }, { source: '保険料予算の目安（設定値）' });
    return { min: mk('min', '最小'), balanced: mk('balanced', 'バランス'), max: mk('max', '最大活用'), assumed: false, reason: null };
  }
  const base = s.budgetRevenueFallbackRate;
  const reason = ordinaryProfit == null ? '経常利益が未入力のため' : '経常利益が0以下のため';
  const mk = (tier: 'min' | 'balanced' | 'max', label: string) => {
    const rate = base * (r[tier] / r.min);
    return money(`calc.budget.${tier}`, revenue * rate, `${reason} 年商 ${revenue.toLocaleString('ja-JP')}万円 × ${(rate * 100).toFixed(1)}% で仮置き（${label}の目安）`, { revenue, rate: rate * 100 }, { assumed: true, source: '保険料予算の目安（設定値）' });
  };
  return { min: mk('min', '最小'), balanced: mk('balanced', 'バランス'), max: mk('max', '最大活用'), assumed: true, reason };
}
