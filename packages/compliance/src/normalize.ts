/**
 * Text normalization with an index map back to the original string, so that matches found on the
 * normalized text can be located (and replaced) in the original.
 */
export interface NormView {
  norm: string;
  /** norm index -> original start index */
  start: number[];
  /** norm index -> original end index (exclusive) */
  end: number[];
}

const KATAKANA_VARIANTS: Record<string, string> = { 'ヵ': 'カ', 'ヶ': 'ケ', '･': '・', '—': 'ー', '―': 'ー', '‐': '-', '−': '-' };

export function normalizeChar(ch: string): string {
  const n = (KATAKANA_VARIANTS[ch] ?? ch).normalize('NFKC');
  return n.toLowerCase();
}

/** Normalize (NFKC, lowercase) and optionally drop whitespace, keeping an index map. */
export function buildView(text: string, opts: { dropSpaces?: boolean } = {}): NormView {
  let norm = '';
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  for (const ch of text) {
    const len = ch.length;
    if (opts.dropSpaces && /\s/.test(ch)) {
      i += len;
      continue;
    }
    const n = /\s/.test(ch) ? ' ' : normalizeChar(ch);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      start.push(i);
      end.push(i + len);
    }
    i += len;
  }
  return { norm, start, end };
}

export function normalizeText(text: string, dropSpaces = false): string {
  return buildView(text, { dropSpaces }).norm;
}

/** Map a [from, to) range on the normalized view back to the original text. */
export function toOriginalRange(view: NormView, from: number, to: number): [number, number] {
  return [view.start[from] ?? 0, view.end[to - 1] ?? view.start[from] ?? 0];
}
