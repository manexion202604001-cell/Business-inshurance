import type { CalcResult, Plan } from '@p3/engine';
import { h, man } from './util';

/** Stacked bars: required coverage (business fund / death retirement / condolence) vs existing + gap. */
export function coverageChart(calc: CalcResult, opts: { width?: number; height?: number } = {}): string {
  const W = opts.width ?? 330;
  const H = opts.height ?? 170;
  const cv = calc.coverage;
  const total = Math.max(cv.required.value, cv.existing.value + cv.gap.value, 1);
  const top = 14;
  const barH = H - top - 26;
  const scale = (v: number) => (v / total) * barH;
  const barW = 70;
  const x1 = 40;
  const x2 = 190;
  // Label positions are spread out so that small segments do not overlap.
  const labels: { x: number; y: number; text: string }[] = [];
  const seg = (x: number, y: number, v: number, color: string, label: string, textColor = '#fff') => {
    const hgt = scale(v);
    if (v <= 0) return '';
    const inner = hgt > 16 ? `<text x="${x + barW / 2}" y="${y + hgt / 2 + 3}" text-anchor="middle" font-size="7.5" fill="${textColor}">${h(man(v))}</text>` : '';
    labels.push({ x: x + barW + 4, y: y + hgt / 2 + 3, text: hgt > 16 ? label : `${label} ${man(v)}` });
    return `<rect x="${x}" y="${y}" width="${barW}" height="${hgt}" fill="${color}"/>${inner}`;
  };
  const placeLabels = () => {
    const byX = new Map<number, typeof labels>();
    for (const l of labels) byX.set(l.x, [...(byX.get(l.x) ?? []), l]);
    let out = '';
    for (const group of byX.values()) {
      group.sort((a, b) => a.y - b.y);
      let prev = -Infinity;
      for (const l of group) {
        const y = Math.max(l.y, prev + 9);
        prev = y;
        out += `<text x="${l.x}" y="${y}" font-size="7" fill="#5b6472">${h(l.text)}</text>`;
      }
    }
    return out;
  };
  let y = top + barH - scale(cv.required.value);
  const left = [
    seg(x1, y, cv.condolence.value, '#8a96ad', '弔慰金'),
    seg(x1, (y += scale(cv.condolence.value)), cv.deathRetirement.value, '#2f4470', '死亡退職金'),
    seg(x1, (y += scale(cv.deathRetirement.value)), cv.businessFund.value, '#1f2d4d', '事業保障資金'),
  ].join('');
  let y2 = top + barH - scale(cv.existing.value + cv.gap.value);
  const right = [
    seg(x2, y2, cv.gap.value, 'var(--accent)', '不足額'),
    seg(x2, (y2 += scale(cv.gap.value)), cv.existing.value, '#c9d0dc', '既存保障', '#1d2330'),
  ].join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="必要保障額の内訳">
  <line x1="20" y1="${top + barH}" x2="${W - 10}" y2="${top + barH}" stroke="#c9d0dc"/>
  ${left}${right}${placeLabels()}
  <text x="${x1 + barW / 2}" y="${H - 12}" text-anchor="middle" font-size="8" fill="#1f2d4d">必要保障額 ${h(man(cv.required))}</text>
  <text x="${x2 + barW / 2}" y="${H - 12}" text-anchor="middle" font-size="8" fill="#1f2d4d">既存保障＋不足額</text>
</svg>`;
}

/** Horizontal meter for the coverage ratio of a plan. */
export function ratioMeter(p: Plan): string {
  const pct = Math.max(0, Math.min(100, p.coverageRatio * 100));
  return `<div class="meter"><div class="meter-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
}

/** Two bars: retirement allowance today vs inflation-adjusted at retirement. */
export function inflationChart(calc: CalcResult): string {
  const r = calc.retirement;
  const max = Math.max(r.inflationAdjusted.value, r.target.value, 1);
  const W = 300;
  const barMax = 180;
  const row = (y: number, label: string, v: number, color: string) =>
    `<text x="0" y="${y + 11}" font-size="8" fill="#5b6472">${h(label)}</text><rect x="95" y="${y}" width="${(v / max) * barMax}" height="16" fill="${color}"/><text x="${100 + (v / max) * barMax}" y="${y + 12}" font-size="8" fill="#1d2330">${h(man(v))}</text>`;
  return `<svg viewBox="0 0 ${W} 50" width="100%" role="img" aria-label="インフレ調整">${row(4, '現在の水準', r.target.value, '#2f4470')}${row(28, `勇退時（${r.yearsToRetire.value}年後）`, r.inflationAdjusted.value, 'var(--accent)')}</svg>`;
}
