import { formatMan, type Money } from '@p3/engine';

export const man = (m: Money | number | null | undefined) => (m == null ? '—' : formatMan(typeof m === 'number' ? m : m.value));
export const TIER_JA = { MIN: '最小プラン', BALANCED: 'バランス型プラン', MAX: '最大活用型プラン' } as const;
export const planTitle = (t: string) => t.replace(/^「(.+)」.*$/, '$1');
