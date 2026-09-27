import { maskText, type MaskHit } from '@p3/compliance';
import type { MaskingTerm } from '@p3/knowledge';

/** Remove WebVTT/SRT cue numbers and timestamps, keep the spoken text. */
export function stripSubtitles(text: string): string {
  return text
    .replace(/^WEBVTT.*$/m, '')
    .split(/\r?\n/)
    .filter((l) => !/^\d+$/.test(l.trim()))
    .filter((l) => !/^\d{2}:\d{2}(:\d{2})?[.,]\d{3}\s*-->\s*\d{2}:\d{2}(:\d{2})?[.,]\d{3}/.test(l.trim()))
    .map((l) => l.replace(/^<v\s+([^>]+)>/, '$1：').replace(/<\/?v[^>]*>/g, ''))
    .join('\n');
}

/**
 * Step 1: normalise the log. Full-width alphanumerics become half-width, half-width katakana become
 * full-width (NFKC), speaker labels are unified to "名前：", and insurer/product names (and optionally
 * PII) are masked before anything is sent to an LLM.
 */
export function normalizeLog(raw: string, terms: MaskingTerm[], opts: { pii?: boolean } = {}): { text: string; hits: MaskHit[] } {
  let t = stripSubtitles(raw).normalize('NFKC');
  t = t
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[[【(（]?([^\]】)）:：]{1,12})[\]】)）]?\s*[:：]\s*/, '$1：').trimEnd())
    .filter((l, i, arr) => l.trim() !== '' || (i > 0 && arr[i - 1]!.trim() !== ''))
    .join('\n')
    .trim();
  return maskText(t, terms, opts);
}
