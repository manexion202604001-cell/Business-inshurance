import type { BannedPhrase } from '@p3/knowledge';
import { buildView, normalizeText, toOriginalRange } from './normalize';

export interface BannedHit {
  phrase: string;
  match: string;
  start: number;
  end: number;
  severity: 'error' | 'warning';
  category: BannedPhrase['category'];
  suggestion: string;
}

export function findBanned(text: string, phrases: BannedPhrase[]): BannedHit[] {
  const view = buildView(text, { dropSpaces: true });
  const hits: BannedHit[] = [];
  for (const p of phrases) {
    const ranges: [number, number][] = [];
    if (p.isRegex) {
      let re: RegExp;
      try {
        re = new RegExp(normalizeText(p.phrase), 'gu');
      } catch {
        continue;
      }
      for (const m of view.norm.matchAll(re)) if (m[0]) ranges.push([m.index!, m.index! + m[0].length]);
    } else {
      const needle = normalizeText(p.phrase, true);
      let from = 0;
      for (;;) {
        const idx = view.norm.indexOf(needle, from);
        if (idx < 0) break;
        ranges.push([idx, idx + needle.length]);
        from = idx + needle.length;
      }
    }
    if (ranges.length === 0) continue;
    const allowed = allowedRanges(view.norm, p.allowContext ?? []);
    for (const [a, b] of ranges) {
      if (allowed.some(([x, y]) => a >= x && b <= y)) continue;
      const [s, e] = toOriginalRange(view, a, b);
      hits.push({ phrase: p.phrase, match: text.slice(s, e), start: s, end: e, severity: p.severity, category: p.category, suggestion: p.suggestion });
    }
  }
  // A weaker (warning) hit fully inside an error hit is redundant.
  return hits
    .filter((h) => !(h.severity === 'warning' && hits.some((o) => o !== h && o.severity === 'error' && o.start <= h.start && o.end >= h.end)))
    .sort((a, b) => a.start - b.start);
}

function allowedRanges(norm: string, contexts: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of contexts) {
    const needle = normalizeText(c, true);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const idx = norm.indexOf(needle, from);
      if (idx < 0) break;
      out.push([idx, idx + needle.length]);
      from = idx + 1;
    }
  }
  return out;
}
