import { describe, expect, it } from 'vitest';
import { loadSeedKnowledge } from '../../knowledge/src';
import {
  buildPool,
  buildReport,
  checkDisclaimers,
  checkGrounding,
  checkSections,
  extractNumbers,
  findBanned,
  findMaskHits,
  maskText,
  parseJapaneseNumber,
  requiredDisclaimers,
} from '../src';

const K = loadSeedKnowledge();

describe('masking', () => {
  it('masks insurer and product names from the sample log (§13)', () => {
    const r = maskText('保険は昔入った定期があるよ。1億5千万だったかな。〇〇生命の△△ってやつ。', K.maskingTerms);
    expect(r.text).not.toMatch(/〇〇生命|△△/);
    expect(r.hits.map((h) => h.kind)).toEqual(expect.arrayContaining(['insurer', 'product']));
  });
  it('normalizes full-width, half-width and case variations', () => {
    expect(findMaskHits('ＡＸＡの商品', K.maskingTerms)).toHaveLength(1);
    expect(findMaskHits('axa', K.maskingTerms)).toHaveLength(1);
    expect(findMaskHits('ｿﾆｰ生命', K.maskingTerms)).toHaveLength(1);
    expect(findMaskHits('ソニー 生命', K.maskingTerms)).toHaveLength(1);
    expect(findMaskHits('チューリッヒ', K.maskingTerms)).toHaveLength(1);
    expect(findMaskHits('ユニット･リンク', K.maskingTerms)).toHaveLength(1);
  });
  it('does not match ASCII terms inside other words', () => {
    expect(findMaskHits('TAXATION', K.maskingTerms)).toHaveLength(0);
  });
  it('masks document ids, URLs and generic insurer names', () => {
    const text = 'Form No. AB-123 と 0T7035(6.0) と 募19025-20250401、https://example.com、ほげほげ生命保険株式会社、カタカナ生命';
    const hits = findMaskHits(text, K.maskingTerms);
    expect(hits.map((h) => h.kind)).toEqual(['docId', 'docId', 'docId', 'agency', 'insurer', 'insurer']);
    expect(maskText(text, K.maskingTerms).text).not.toMatch(/Form|0T7035|募19025|https|生命保険株式会社|カタカナ生命/);
  });
  it('does not flag category names', () => {
    for (const c of K.categories) expect(findMaskHits(c.name, K.maskingTerms)).toEqual([]);
    expect(findMaskHits('変額保険（定期型）Aプラン、生命保険、定期生命', K.maskingTerms)).toEqual([]);
  });
  it('masks PII when requested', () => {
    const r = maskText('連絡先は taro@example.co.jp か 090-1234-5678 まで', K.maskingTerms, { pii: true });
    expect(r.text).toBe('連絡先は （メールアドレス） か （電話番号） まで');
  });
  it('collapses duplicated replacements', () => {
    expect(maskText('アクサ生命保険株式会社', K.maskingTerms).text).toBe('保険会社');
  });
});

describe('banned phrases', () => {
  it('detects tax-saving appeals', () => {
    expect(findBanned('この保険なら節税になります', K.bannedPhrases).map((h) => h.category)).toContain('tax_saving');
    expect(findBanned('税金が減るのでお得です', K.bannedPhrases)).toHaveLength(1);
    expect(findBanned('利益の圧縮ができます', K.bannedPhrases)).toHaveLength(1);
  });
  it('allows the mandatory disclaimer that mentions 節税', () => {
    expect(findBanned(K.disclaimers.taxNoSaving, K.bannedPhrases)).toEqual([]);
  });
  it('detects assurance and comparison phrases', () => {
    const hits = findBanned('必ず増えますし元本保証です。他社より有利で、A社より安い。絶対に損しない', K.bannedPhrases);
    const cats = hits.map((h) => h.category);
    expect(cats.filter((c) => c === 'assurance').length).toBeGreaterThanOrEqual(3);
    expect(cats).toContain('comparison');
    expect(hits.every((h) => h.suggestion.length > 0)).toBe(true);
  });
  it('drops warnings nested in errors', () => {
    const hits = findBanned('必ず増えます', K.bannedPhrases);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe('error');
  });
});

describe('number extraction', () => {
  it.each([
    ['1億2千万', 120000000],
    ['1億2,000万', 120000000],
    ['3,600', 3600],
    ['一億', 100000000],
    ['二千万', 20000000],
    ['4.9億', 490000000],
  ])('parses %s', (s, v) => {
    expect(parseJapaneseNumber(s)!.value).toBeCloseTo(v);
  });
  it('extracts money, percent, years and ages with tolerance', () => {
    const ns = extractNumbers('必要保障額は5億9,300万円、不足額は約4.9億円。返戻率33.58％、勇退は68歳、あと10年。12か月分');
    expect(ns.map((n) => [n.value, n.unit])).toEqual([
      [59300, '万円'],
      [49000, '万円'],
      [33.58, '%'],
      [68, '歳'],
      [10, '年'],
      [12, 'か月'],
    ]);
    expect(ns[1]!.approx).toBe(true);
    expect(ns[1]!.tolerance).toBeCloseTo(500);
  });
  it('skips dates, kanji words and identifiers', () => {
    expect(extractNumbers('2026年9月現在、令和7年の調査。一括返済、一定期間、三大疾病、R01、calc.v2')).toEqual([]);
  });
  it('converts yen to 万円', () => {
    expect(extractNumbers('30万円以下')[0]!.value).toBe(30);
    expect(extractNumbers('5000000円')[0]!.value).toBe(500);
  });
});

describe('grounding', () => {
  const pool = buildPool({ gap: 49300, required: 59300, rate: 33.58, age: 68, ratio: 0.663 });
  it('accepts values from the pool, including rounded 億 display', () => {
    expect(checkGrounding('不足額は4億9,300万円（約4.9億円）、必要保障額5億9,300万円、充足率66.3%', pool)).toEqual([]);
  });
  it('rejects numbers that are not in the calculation result', () => {
    const v = checkGrounding('不足額は5億円です。利回りは3.5%', pool);
    expect(v.map((x) => x.raw)).toEqual(['5億円', '3.5%']);
  });
  it('allows small ordinal-like integers', () => {
    expect(checkGrounding('3つの案をご用意しました。2回目のご提案', pool)).toEqual([]);
  });
});

describe('disclaimers and report', () => {
  it('requires category disclaimers for used categories', () => {
    const req = requiredDisclaimers(K, ['VARIABLE_TERM']);
    expect(req).toContain('解約返戻金額に最低保証はありません');
    expect(req.some((r) => r.includes('2026年2月現在'))).toBe(true);
    const issues = checkDisclaimers('何も書いていない資料', req);
    expect(issues.length).toBe(req.length);
    expect(checkDisclaimers(req.join('\n'), req)).toEqual([]);
  });
  it('blocks on any error', () => {
    const issues = checkSections([{ id: 's1', label: 'x', text: 'ソニー生命の商品で節税になります。5億円', audience: 'customer' }], K, buildPool({ a: 1 }));
    const report = buildReport(issues);
    expect(report.status).toBe('blocked');
    expect(report.counts.masking).toBe(1);
    expect(report.counts.banned).toBe(1);
    expect(report.counts.grounding).toBe(1);
    expect(buildReport([]).status).toBe('ok');
  });
});
