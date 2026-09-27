import type { KnowledgeSnapshot } from '@p3/knowledge';
import { asOfLabel } from '@p3/knowledge';
import { normalizeText } from './normalize';

/** Disclaimers that every customer-facing document must contain for the given categories. */
export function requiredDisclaimers(k: KnowledgeSnapshot, categoryCodes: string[], opts: { sampleRates?: boolean } = {}): string[] {
  const d = k.disclaimers;
  const list = [d.taxNoSaving, fillTaxAsOf(d.taxAsOf, k), d.estimate, d.image];
  if (opts.sampleRates) list.push(d.sampleRates);
  for (const code of new Set(categoryCodes)) {
    const cat = k.categories.find((c) => c.code === code);
    if (cat) list.push(...cat.mandatoryDisclaimers);
  }
  return [...new Set(list)];
}

export function fillTaxAsOf(template: string, k: KnowledgeSnapshot): string {
  return template.replace('{taxAsOfLabel}', asOfLabel(k.settings.taxAsOf));
}

export function missingDisclaimers(documentText: string, required: string[]): string[] {
  const doc = normalizeText(documentText, true);
  return required.filter((r) => !doc.includes(normalizeText(r, true)));
}
