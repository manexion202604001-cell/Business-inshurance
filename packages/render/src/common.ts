import { requiredDisclaimers } from '@p3/compliance';
import { asOfLabel } from '@p3/knowledge';
import { fontFaceCss } from './fonts';
import { baseCss, FIT_SCRIPT } from './styles';
import type { RenderInput, RenderOptions } from './types';
import { h } from './util';

export function usesSampleRates(input: RenderInput): boolean {
  return input.planSet.plans.some((p) => p.components.some((c) => c.premiumEstimate !== 'DESIGN_SHEET_REQUIRED' && c.premiumEstimate.isSample));
}

export function usedCategories(input: RenderInput): string[] {
  return [...new Set(input.planSet.plans.flatMap((p) => p.components.map((c) => c.categoryCode)))];
}

/** All disclaimers a customer-facing document must carry. */
export function documentDisclaimers(input: RenderInput): string[] {
  const k = input.knowledge;
  const req = requiredDisclaimers(k, usedCategories(input), { sampleRates: usesSampleRates(input) });
  return [k.disclaimers.purpose, ...req, k.disclaimers.loanTaxNote, k.disclaimers.regulation];
}

export function disclaimerBlock(input: RenderInput, cls = 'xsmall'): string {
  const k = input.knowledge;
  return `<div class="disclaimers ${cls}"><ul>${documentDisclaimers(input)
    .map((d) => `<li>${h(d)}</li>`)
    .join('')}</ul><div class="muted">ナレッジ基準日：${h(asOfLabel(k.settings.asOf))}（ナレッジ版 ${h(k.version)}）／税制基準：${h(asOfLabel(k.settings.taxAsOf))}現在</div></div>`;
}

export function htmlDoc(title: string, body: string, css: string, input: RenderInput, opts: RenderOptions): string {
  const accent = input.knowledge.presentation.accentColor || '#b08d57';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title>
<style>${fontFaceCss(opts.fontBase)}${baseCss(accent)}${css}</style></head><body>${body}${opts.preview ? FIT_SCRIPT : ''}</body></html>`;
}
