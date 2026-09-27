import 'server-only';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import { HttpError } from './api';

export const KINDS = ['categories', 'taxRules', 'logicRules', 'maskingTerms', 'bannedPhrases', 'statistics', 'referenceRates', 'settings', 'presentation', 'disclaimers', 'internalRefs'] as const;
export type Kind = (typeof KINDS)[number];

const need = (cond: boolean, msg: string) => {
  if (!cond) throw new HttpError(400, msg);
};

/** Validate and apply an edited knowledge section to a draft snapshot. */
export function applyKind(k: KnowledgeSnapshot, kind: Kind, value: unknown): KnowledgeSnapshot {
  const next = structuredClone(k);
  switch (kind) {
    case 'categories': {
      need(Array.isArray(value), '配列で指定してください');
      for (const c of value as Record<string, unknown>[]) need(typeof c.code === 'string' && typeof c.name === 'string' && Array.isArray(c.mandatoryDisclaimers), 'code / name / mandatoryDisclaimers は必須です');
      next.categories = value as KnowledgeSnapshot['categories'];
      break;
    }
    case 'taxRules':
      need(Array.isArray(value), '配列で指定してください');
      next.taxRules = value as KnowledgeSnapshot['taxRules'];
      break;
    case 'logicRules': {
      need(Array.isArray(value), '配列で指定してください');
      const ids = new Set<string>();
      for (const r of value as Record<string, unknown>[]) {
        need(typeof r.id === 'string' && r.id.length > 0, 'ルールIDは必須です');
        need(!ids.has(r.id as string), `ルールID「${r.id}」が重複しています`);
        ids.add(r.id as string);
        need(typeof r.name === 'string', 'ルール名は必須です');
        need(r.condition != null && typeof r.condition === 'object', `${r.id}: 条件（condition）はJSON Logic形式のオブジェクトで指定してください`);
        need(r.effect != null && typeof r.effect === 'object', `${r.id}: 効果（effect）はオブジェクトで指定してください`);
      }
      next.logicRules = (value as KnowledgeSnapshot['logicRules']).map((r) => ({ ...r, enabled: r.enabled !== false, rationale: r.rationale ?? '' }));
      break;
    }
    case 'maskingTerms': {
      need(Array.isArray(value), '配列で指定してください');
      for (const m of value as Record<string, unknown>[]) {
        need(typeof m.term === 'string' && m.term.length > 0, '語句は必須です');
        if (m.isRegex) {
          try {
            new RegExp(m.term as string, 'u');
          } catch {
            throw new HttpError(400, `正規表現が不正です：${m.term}`);
          }
        }
      }
      next.maskingTerms = value as KnowledgeSnapshot['maskingTerms'];
      break;
    }
    case 'bannedPhrases': {
      need(Array.isArray(value), '配列で指定してください');
      for (const b of value as Record<string, unknown>[]) {
        need(typeof b.phrase === 'string' && b.phrase.length > 0, '表現は必須です');
        need(b.severity === 'error' || b.severity === 'warning', 'severity は error / warning です');
        if (b.isRegex) {
          try {
            new RegExp(b.phrase as string, 'u');
          } catch {
            throw new HttpError(400, `正規表現が不正です：${b.phrase}`);
          }
        }
      }
      next.bannedPhrases = value as KnowledgeSnapshot['bannedPhrases'];
      break;
    }
    case 'statistics':
      need(Array.isArray(value), '配列で指定してください');
      for (const s of value as Record<string, unknown>[]) need(typeof s.key === 'string' && typeof s.text === 'string' && s.source != null && typeof s.asOf === 'string', '統計値には key / text / source / asOf（出典・基準日）が必須です');
      next.statistics = value as KnowledgeSnapshot['statistics'];
      break;
    case 'referenceRates':
      need(Array.isArray(value), '配列で指定してください');
      next.referenceRates = value as KnowledgeSnapshot['referenceRates'];
      break;
    case 'settings':
      need(value != null && typeof value === 'object' && !Array.isArray(value), 'オブジェクトで指定してください');
      next.settings = { ...next.settings, ...(value as object) };
      break;
    case 'presentation':
      next.presentation = { ...next.presentation, ...(value as object) };
      break;
    case 'disclaimers':
      next.disclaimers = { ...next.disclaimers, ...(value as object) };
      break;
    case 'internalRefs':
      need(Array.isArray(value), '配列で指定してください');
      next.internalRefs = value as KnowledgeSnapshot['internalRefs'];
      break;
  }
  return next;
}

/** Parse a reference-rate CSV (header: category,sex,age,termToAge,annualPremiumPer1000man,peakReturnRate,peakYear,source,asOf). */
export function parseRatesCsv(csv: string): KnowledgeSnapshot['referenceRates'] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new HttpError(400, 'ヘッダー行とデータ行が必要です');
  const header = lines[0]!.split(',').map((h) => h.trim());
  const required = ['category', 'sex', 'age', 'termToAge', 'annualPremiumPer1000man', 'peakReturnRate', 'peakYear', 'source', 'asOf'];
  for (const r of required) if (!header.includes(r)) throw new HttpError(400, `列「${r}」がありません`);
  const idx = (n: string) => header.indexOf(n);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const num = (n: string, allowEmpty = false) => {
      const v = cells[idx(n)] ?? '';
      if (v === '' && allowEmpty) return null;
      const x = Number(v);
      if (!Number.isFinite(x)) throw new HttpError(400, `${i + 2}行目：${n} が数値ではありません`);
      return x;
    };
    const sex = cells[idx('sex')];
    if (sex !== 'M' && sex !== 'F') throw new HttpError(400, `${i + 2}行目：sex は M / F です`);
    return {
      category: cells[idx('category')]!,
      sex,
      age: num('age')!,
      termToAge: num('termToAge')!,
      annualPremiumPer1000man: num('annualPremiumPer1000man')!,
      peakReturnRate: num('peakReturnRate', true),
      peakYear: num('peakYear', true),
      source: cells[idx('source')] ?? '',
      asOf: cells[idx('asOf')] ?? '',
      isSample: false,
    };
  });
}
