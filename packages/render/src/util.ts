import { formatMan, type Money, type Tier } from '@p3/engine';

export function h(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const man = (m: Money | number | null | undefined): string => (m == null ? '—' : formatMan(typeof m === 'number' ? m : m.value));

export const TIER_JA: Record<Tier, string> = { MIN: '最小プラン', BALANCED: 'バランス型プラン', MAX: '最大活用型プラン' };
export const TIER_SHORT: Record<Tier, string> = { MIN: '最小', BALANCED: 'バランス', MAX: '最大活用' };

export function dateJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Wrap a value with an "assumed" badge when it was 仮置き. */
export function withAssumed(text: string, assumed?: boolean): string {
  return assumed ? `${text}<span class="badge-assumed">仮置き</span>` : text;
}

export function list(items: string[], cls = ''): string {
  if (!items.length) return '';
  return `<ul class="${cls}">${items.map((i) => `<li>${h(i)}</li>`).join('')}</ul>`;
}

/** Order plans so the recommended tier comes first (for emphasis), otherwise MIN/BALANCED/MAX. */
export function ordered<T extends { tier: Tier }>(items: T[], recommended?: Tier | null): T[] {
  if (!recommended) return items;
  return [...items].sort((a, b) => (a.tier === recommended ? -1 : b.tier === recommended ? 1 : 0));
}
