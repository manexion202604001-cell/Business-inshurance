import type { Money, Unit } from './types';

/** Round half away from zero to an integer (万円 rounding rule). */
export function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const r = Math.round(Math.abs(value) + 1e-9);
  return value < 0 ? -r : r;
}

/** Round to a number of decimal places (used for ratios). */
export function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return round(value * f) / f;
}

export function money(
  calcId: string,
  value: number,
  formula: string,
  inputs: Record<string, number>,
  opts: { unit?: Unit; source?: string; assumed?: boolean; raw?: boolean } = {},
): Money {
  return {
    value: opts.raw ? value : round(value),
    unit: opts.unit ?? '万円',
    calcId,
    formula,
    inputs,
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.assumed ? { assumed: true } : {}),
  };
}

/** Format 万円 values for Japanese display, e.g. 67751 -> "6億7,751万円". */
export function formatMan(value: number): string {
  const v = round(value);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const oku = Math.floor(abs / 10000);
  const man = abs % 10000;
  if (oku > 0 && man === 0) return `${sign}${oku.toLocaleString('ja-JP')}億円`;
  if (oku > 0) return `${sign}${oku.toLocaleString('ja-JP')}億${man.toLocaleString('ja-JP')}万円`;
  return `${sign}${man.toLocaleString('ja-JP')}万円`;
}

export function formatPct(value: number, digits = 1): string {
  return `${roundTo(value, digits).toFixed(digits)}%`;
}
