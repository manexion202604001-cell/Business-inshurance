import type { MaskingKind, MaskingTerm } from '@p3/knowledge';
import { buildView, normalizeText, toOriginalRange } from './normalize';

export interface MaskHit {
  kind: MaskingKind;
  term: string;
  match: string;
  start: number;
  end: number;
  replacement: string;
}

const PII_TERMS: MaskingTerm[] = [
  { term: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', kind: 'pii', replacement: '（メールアドレス）', isRegex: true },
  { term: '0\\d{1,4}-\\d{1,4}-\\d{3,4}', kind: 'pii', replacement: '（電話番号）', isRegex: true },
  { term: '0[789]0\\d{8}', kind: 'pii', replacement: '（電話番号）', isRegex: true },
];

/** Find all masking-dictionary hits in the text (non-overlapping, longest first). */
export function findMaskHits(text: string, terms: MaskingTerm[], opts: { pii?: boolean } = {}): MaskHit[] {
  const all = opts.pii ? [...terms, ...PII_TERMS] : terms;
  const literal = buildView(text, { dropSpaces: true });
  const spaced = buildView(text);
  const hits: MaskHit[] = [];
  for (const t of all) {
    if (t.isRegex) {
      let re: RegExp;
      try {
        re = new RegExp(t.term, 'giu');
      } catch {
        continue;
      }
      for (const m of spaced.norm.matchAll(re)) {
        if (!m[0]) continue;
        const [s, e] = toOriginalRange(spaced, m.index!, m.index! + m[0].length);
        hits.push({ kind: t.kind, term: t.term, match: text.slice(s, e), start: s, end: e, replacement: t.replacement });
      }
    } else {
      const needle = normalizeText(t.term, true);
      if (!needle) continue;
      let from = 0;
      for (;;) {
        const idx = literal.norm.indexOf(needle, from);
        if (idx < 0) break;
        const [s, e] = toOriginalRange(literal, idx, idx + needle.length);
        // Short ASCII terms (e.g. "AXA", "DWS") must not match inside longer words.
        if (!/^[a-z0-9]+$/.test(needle) || isWordBoundary(literal.norm, idx, idx + needle.length)) {
          hits.push({ kind: t.kind, term: t.term, match: text.slice(s, e), start: s, end: e, replacement: t.replacement });
        }
        from = idx + needle.length;
      }
    }
  }
  // Resolve overlaps: prefer earlier start, then longer match.
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result: MaskHit[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start >= lastEnd) {
      result.push(h);
      lastEnd = h.end;
    }
  }
  return result;
}

function isWordBoundary(s: string, from: number, to: number): boolean {
  const before = s[from - 1];
  const after = s[to];
  const w = /[a-z0-9]/;
  return !(before && w.test(before)) && !(after && w.test(after));
}

/** Replace all hits. Adjacent duplicates such as "保険会社保険会社" are collapsed. */
export function maskText(text: string, terms: MaskingTerm[], opts: { pii?: boolean } = {}): { text: string; hits: MaskHit[] } {
  const hits = findMaskHits(text, terms, opts);
  let out = '';
  let pos = 0;
  for (const h of hits) {
    out += text.slice(pos, h.start) + h.replacement;
    pos = h.end;
  }
  out += text.slice(pos);
  out = out.replace(/(保険会社)(?:の)?\1/g, '$1').replace(/(運用会社)\1/g, '$1');
  return { text: out, hits };
}
