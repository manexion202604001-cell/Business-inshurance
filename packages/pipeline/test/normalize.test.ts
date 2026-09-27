import { describe, expect, it } from 'vitest';
import { loadSeedKnowledge } from '../../knowledge/src';
import { normalizeLog, stripSubtitles } from '../src';

const K = loadSeedKnowledge();

describe('normalizeLog', () => {
  it('strips VTT timestamps and voice tags', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v 社長>借入は１億です</v>\n';
    expect(stripSubtitles(vtt).trim()).toBe('社長：借入は１億です');
  });
  it('unifies width and speaker labels, masks names', () => {
    const r = normalizeLog('【社長】 売上は８億。ｿﾆｰ生命に入ってる\n営業: ありがとうございます', K.maskingTerms);
    expect(r.text).toBe('社長：売上は8億。保険会社に入ってる\n営業：ありがとうございます');
    expect(r.hits).toHaveLength(1);
  });
  it('optionally masks PII', () => {
    const r = normalizeLog('社長：メールは ceo@example.com です', K.maskingTerms, { pii: true });
    expect(r.text).not.toContain('example.com');
  });
});
