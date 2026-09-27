import { buildView, toOriginalRange } from './normalize';

export type NumUnit = '万円' | '%' | '年' | '歳' | 'か月' | '倍' | '名' | '人' | '件' | 'none';

export interface ExtractedNumber {
  raw: string;
  /** Value; for money this is in 万円. */
  value: number;
  unit: NumUnit;
  start: number;
  end: number;
  approx: boolean;
  /** Half of the displayed precision in the value's unit (e.g. "4.9億円" -> 500). */
  tolerance: number;
}

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const SMALL_MULT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const BIG_MULT: Record<string, number> = { 万: 1e4, 億: 1e8, 兆: 1e12 };

const NUM_TOKEN = '(?:[0-9][0-9,]*(?:\\.[0-9]+)?|[〇零一二三四五六七八九十百千])';
const PHRASE_RE = new RegExp(
  `(約|およそ|概ね|ほぼ|数)?((?:${NUM_TOKEN})+(?:[兆億万](?:${NUM_TOKEN})*)*)(万円|億円|円|%|パーセント|年|歳|か月|ヵ月|ヶ月|カ月|ケ月|倍|名|人|件)?`,
  'gu',
);

/** Parse a Japanese number phrase ("1億2千万", "3,600", "一億") into a raw number. */
export function parseJapaneseNumber(s: string): { value: number; precision: number } | null {
  let total = 0;
  let section = 0;
  let cur: number | null = null;
  let precision = 1;
  let lastMult = 1;
  let sawDigit = false;
  const re = /([0-9][0-9,]*(?:\.[0-9]+)?)|([〇零一二三四五六七八九])|([十百千])|([万億兆])/gu;
  for (const m of s.matchAll(re)) {
    if (m[1]) {
      const txt = m[1].replace(/,/g, '');
      cur = parseFloat(txt);
      const dec = txt.includes('.') ? txt.split('.')[1]!.length : 0;
      precision = 10 ** -dec;
      lastMult = 1;
      sawDigit = true;
    } else if (m[2]) {
      cur = (cur ?? 0) * 10 + KANJI_DIGIT[m[2]]!;
      precision = 1;
      lastMult = 1;
      sawDigit = true;
    } else if (m[3]) {
      const mult = SMALL_MULT[m[3]]!;
      section += (cur ?? 1) * mult;
      precision = mult;
      lastMult = mult;
      cur = null;
    } else if (m[4]) {
      const big = BIG_MULT[m[4]]!;
      total += (section + (cur ?? 0)) * big;
      precision = (cur != null ? precision : lastMult) * big;
      section = 0;
      cur = null;
    }
  }
  if (!sawDigit && section === 0 && total === 0) return null;
  total += section + (cur ?? 0);
  return { value: total, precision };
}

/** Extract numbers with units from Japanese text. Dates and ordinal-like tokens are skipped. */
export function extractNumbers(text: string): ExtractedNumber[] {
  const view = buildView(text);
  const s = view.norm;
  const out: ExtractedNumber[] = [];
  for (const m of s.matchAll(PHRASE_RE)) {
    const prefix = m[1] ?? '';
    const phrase = m[2]!;
    let unitRaw = m[3] ?? '';
    const idx = m.index!;
    const phraseStart = idx + prefix.length;
    if (prefix === '数') continue;
    const isKanjiOnly = !/[0-9]/.test(phrase);
    const hasBig = /[万億兆]/.test(phrase);
    // Kanji numerals are only considered when they carry a unit (avoid 一括, 一定, 十分 ...).
    if (isKanjiOnly && !unitRaw && !hasBig) continue;
    if (isKanjiOnly && /^[一]$/.test(phrase) && !/[円億万%]/.test(unitRaw)) continue;
    const before = s.slice(Math.max(0, phraseStart - 2), phraseStart);
    const after = s.slice(idx + m[0].length, idx + m[0].length + 1);
    // Dates: 2026年9月, 令和7年, 1995年
    if (/令和|平成|昭和/.test(before)) continue;
    if (unitRaw === '年' && /^(19|20)\d{2}$/.test(phrase)) continue;
    if (/^[0-9]{1,2}$/.test(phrase) && /^[月日]/.test(after) && !unitRaw) continue;
    // Identifiers such as R01, calc ids, section numbers "§7".
    const prevChar = s[phraseStart - 1] ?? '';
    if (/[a-z_.§#-]/i.test(prevChar)) continue;
    // Fractions like 1/2, 4/10
    if (prevChar === '/' || after === '/') continue;
    const parsed = parseJapaneseNumber(phrase);
    if (!parsed) continue;
    let value = parsed.value;
    let tolerance = parsed.precision / 2;
    let unit: NumUnit = 'none';
    if (unitRaw === '万円' || unitRaw === '億円' || unitRaw === '円' || hasBig) {
      // Normalise everything to 万円.
      if (unitRaw === '万円') {
        value = parsed.value * 1e4;
        tolerance = (parsed.precision * 1e4) / 2;
      } else if (unitRaw === '億円') {
        value = parsed.value * 1e8;
        tolerance = (parsed.precision * 1e8) / 2;
      }
      value /= 1e4;
      tolerance /= 1e4;
      unit = '万円';
      unitRaw = unitRaw || '円';
    } else if (unitRaw === '%' || unitRaw === 'パーセント') unit = '%';
    else if (/^(か|ヵ|ヶ|カ|ケ)月$/.test(unitRaw)) unit = 'か月';
    else if (unitRaw) unit = unitRaw as NumUnit;
    const approx = prefix !== '';
    const hasDecimal = /\./.test(phrase);
    // Exact integers must match exactly (to the 万円/unit); rounding is only implied by 約 or decimals.
    if (!approx && !hasDecimal) tolerance = Math.min(tolerance, 0.5);
    if (approx) tolerance = Math.max(tolerance, Math.abs(value) * 0.01);
    value = Math.round(value * 1e6) / 1e6;
    const [os, oe] = toOriginalRange(view, idx, idx + m[0].length);
    out.push({ raw: text.slice(os, oe), value, unit, start: os, end: oe, approx, tolerance: Math.max(tolerance, 1e-9) });
  }
  return out;
}

/** Recursively collect every finite number in a value (objects, arrays). */
export function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, into);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
  return into;
}

export interface NumberPool {
  values: number[];
}

/** Build the allowed number pool. Ratios (< 1.5) are also added as percentages. */
export function buildPool(...sources: unknown[]): NumberPool {
  const set = new Set<number>();
  for (const s of sources) collectNumbers(s, set);
  for (const v of [...set]) {
    if (Math.abs(v) < 1.5 && v !== 0) {
      set.add(Math.round(v * 1000) / 10);
      set.add(Math.round(v * 10000) / 100);
    }
    if (Math.abs(v) <= 1) set.add(Math.round(v * 100));
  }
  return { values: [...set] };
}

export interface GroundingViolation {
  raw: string;
  value: number;
  unit: NumUnit;
  start: number;
  end: number;
}

/** Small bare integers (ordinal-like: "3つの案", "2回") are always allowed. */
const SMALL_ALLOWED = 12;

export function checkGrounding(text: string, pool: NumberPool): GroundingViolation[] {
  const violations: GroundingViolation[] = [];
  for (const n of extractNumbers(text)) {
    if (n.unit !== '万円' && n.unit !== '%' && Number.isInteger(n.value) && Math.abs(n.value) <= SMALL_ALLOWED) continue;
    if (n.unit === 'none' && Math.abs(n.value) <= SMALL_ALLOWED) continue;
    const ok = pool.values.some((v) => Math.abs(v - n.value) <= n.tolerance + 1e-9);
    if (!ok) violations.push({ raw: n.raw, value: n.value, unit: n.unit, start: n.start, end: n.end });
  }
  return violations;
}
