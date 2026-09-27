import { extractNumbers } from '@p3/compliance';
import type { CompanyInput, ExistingPolicyInput, OfficerInput } from '@p3/engine';
import type { Extraction, IssueTag } from './schemas';

/** Form values available before extraction (nullable = not entered). */
export interface FormSnapshot {
  company: Partial<CompanyInput>;
  officer: Partial<OfficerInput>;
  existingPolicies: ExistingPolicyInput[];
}

interface Utterance {
  speaker: 'sales' | 'customer' | 'unknown';
  text: string;
}

const SALES_LABEL = /^(営業|担当|募集人|FP|私|弊社|当社)/;

/** Split a meeting log into utterances (one per line / sentence) with a speaker guess. */
export function splitUtterances(log: string): Utterance[] {
  const out: Utterance[] = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([^：:「」]{1,12})[：:]\s*(.*)$/);
    const label = m ? m[1]!.trim() : '';
    const body = m ? m[2]! : line;
    const speaker: Utterance['speaker'] = !m ? 'unknown' : SALES_LABEL.test(label) ? 'sales' : 'customer';
    for (const sentence of body.split(/(?<=[。！？!?])/)) {
      const t = sentence.trim();
      if (t) out.push({ speaker, text: t });
    }
  }
  return out;
}

type Money = { value: number; start: number; end: number };

function moneys(text: string): Money[] {
  return extractNumbers(text)
    .filter((n) => n.unit === '万円')
    .map((n) => ({ value: Math.round(n.value), start: n.start, end: n.end }));
}

/** First money amount that appears after the keyword (within `window` chars). */
function moneyAfter(text: string, keyword: RegExp, window = 24): Money | null {
  const k = text.search(keyword);
  if (k < 0) return null;
  return moneys(text).find((m) => m.start >= k && m.start - k <= window) ?? null;
}

const isMonthly = (text: string, m: Money) => /(毎月|月々?|月に)\s*$/.test(text.slice(Math.max(0, m.start - 4), m.start)) || /^ずつ/.test(text.slice(m.end, m.end + 2));

const ISSUE_PATTERNS: [IssueTag, RegExp, string][] = [
  ['loan_repayment', /借入|借りて|返済|貸し剥がし|連帯保証|銀行/, '借入金の返済・金融機関との関係への不安'],
  ['successor', /継が|後継|承継|跡継ぎ|息子に|娘に|継ぐ/, '後継者への事業承継'],
  ['retirement', /引退|勇退|リタイア|(?<!従業員の|社員の)退職金/, '経営者ご自身の勇退・退職金の準備'],
  ['key_person', /(俺|自分|私|社長)が(いない|いなくなったら|いないと)|回らない|取引先が離れ|営業も技術も/, '経営者個人への依存度が高い'],
  ['cashflow', /資金繰り|運転資金|利益は薄|赤字|キャッシュ|保険料.*(高い|負担|困る)/, '資金繰り・保険料負担への配慮'],
  ['employee_benefit', /従業員.*退職金|退職金制度|福利厚生|長く働いて/, '従業員の退職金・福利厚生'],
  ['health', /血圧|病気|健康|入院|がん|体調|現場に出られなく/, '経営者の健康・就業不能への不安'],
  ['inheritance', /相続|遺産|納税資金/, '相続・納税資金'],
];

function quoteOf(text: string): string {
  return text.length > 80 ? text.slice(0, 80) : text;
}

/**
 * Deterministic Step 2 fallback: keyword and pattern based extraction.
 * Only customer utterances are used for facts; quotes are exact substrings of the log.
 */
export function extractWithRules(log: string, form: FormSnapshot): Extraction {
  const us = splitUtterances(log);
  const customer = us.filter((u) => u.speaker !== 'sales');
  const facts: Extraction['companyFacts'] = {
    revenue: null, ordinaryProfit: null, netAssets: null, loanTotal: null, loanShortTerm: null, loanMonthlyRepay: null,
    monthlyLabor: null, monthlyFixed: null, employeeCount: null, ceoAge: null, monthlyPay: null, tenureYears: null, plannedRetireAge: null, legalHeirs: null,
  };
  const quotes: Partial<Record<keyof Extraction['companyFacts'], string>> = {};
  const set = (k: keyof Extraction['companyFacts'], v: number | null | undefined, q: string) => {
    if (v == null || facts[k] != null) return;
    facts[k] = v;
    quotes[k] = q;
  };

  customer.forEach((u) => {
    const t = u.text;
    if (/売上|年商/.test(t)) set('revenue', moneyAfter(t, /売上|年商/)?.value, t);
    if (/経常利益|利益/.test(t)) set('ordinaryProfit', moneyAfter(t, /経常利益|利益/, 12)?.value, t);
    if (/短期|一括/.test(t)) set('loanShortTerm', moneyAfter(t, /短期|一括/, 24)?.value ?? moneys(t)[0]?.value, t);
    else if (/借入|借りて|借りてる|銀行から|公庫から|融資/.test(t)) {
      const m = moneys(t).find((x) => !isMonthly(t, x));
      set('loanTotal', m?.value, t);
    }
    if (/返し|返済|ずつ/.test(t)) {
      const m = moneys(t).find((x) => isMonthly(t, x) || /ずつ/.test(t.slice(x.end, x.end + 3)));
      set('loanMonthlyRepay', m?.value, t);
    }
    if (/人件費|給料|給与|人で月|名で月/.test(t)) {
      const m = moneys(t).find((x) => /月/.test(t.slice(Math.max(0, x.start - 3), x.start)));
      set('monthlyLabor', m?.value, t);
    }
    if (/オフィス|家賃|固定費|サーバー|地代|リース/.test(t)) set('monthlyFixed', moneyAfter(t, /オフィス|家賃|固定費|サーバー|地代|リース/, 20)?.value, t);
    const emp = t.match(/(?:従業員|社員|スタッフ)[^。]{0,6}?(\d{1,4})\s*(?:人|名)|(\d{1,4})\s*(?:人|名)で/);
    if (emp) set('employeeCount', Number(emp[1] ?? emp[2]), t);
    const ret = t.match(/(\d{2})歳(?:くらい|ぐらい|前後|頃)?で(?:引退|勇退|リタイア|セミリタイア|辞め|退)/);
    if (ret) set('plannedRetireAge', Number(ret[1]), t);
    const moreYears = t.match(/あと(\d{1,2})年(?:は|くらい|ほど)?(?:やる|続け|働)/);
    if (moreYears && form.officer.age != null) set('plannedRetireAge', form.officer.age + Number(moreYears[1]), t);
    const heirs = t.match(/(?:相続人|子ども|子供)が?(\d)人/);
    if (heirs) set('legalHeirs', Number(heirs[1]), t);
  });

  // Existing policies mentioned in the log
  const existingPolicies: Extraction['existingPolicies'] = [];
  customer.forEach((u, i) => {
    const t = u.text;
    if (!/保険|定期|終身|変額|養老/.test(t) || /何も入って|入ってない|加入していない/.test(t)) return;
    if (!/入って|入った|加入|ある|あります/.test(t)) return;
    const cat = /長期平準|逓増/.test(t) ? 'TERM_LEVEL_LONG' : /変額/.test(t) ? 'VARIABLE_TERM' : /終身/.test(t) ? 'WHOLE_LIFE' : /養老/.test(t) ? 'ENDOWMENT_HALF' : /医療|がん/.test(t) ? 'THIRD_SECTOR' : /定期/.test(t) ? 'TERM_LOW_CV' : null;
    if (!cat) return;
    const m = moneys(t)[0] ?? moneys(customer[i + 1]?.text ?? '')[0];
    existingPolicies.push({ categoryGuess: cat, deathBenefit: m?.value ?? null, note: quoteOf(t) });
  });

  // Issues
  const issues: Extraction['issues'] = [];
  for (const [tag, re, summary] of ISSUE_PATTERNS) {
    const hit = customer.find((u) => re.test(u.text));
    if (hit) issues.push({ tag, summary, evidenceQuote: quoteOf(hit.text), confidence: 0.6 });
  }

  const all = customer.map((u) => u.text).join('\n');
  const interests: string[] = [];
  if (/保険料.*(高い|負担|困る)|資金繰り|設備にお金/.test(all)) interests.push('資金繰りを重視し、保険料負担を抑えたい');
  if (/運用|増える/.test(all)) interests.push('運用による解約返戻金の上振れにも関心がある');
  if (/退職金/.test(all) && /(引退|リタイア|勇退)/.test(all)) interests.push('勇退時期に合わせた退職金の準備');
  if (/継が|承継|後継/.test(all)) interests.push('後継者への円滑な事業承継');
  if (/長く働いて|従業員/.test(all) && /退職金/.test(all)) interests.push('従業員の定着・福利厚生');
  const objections: string[] = [];
  if (/保険料.*(高い|負担|困る)/.test(all)) objections.push('保険料の負担が心配');
  if (/元本割れ|運用.*不安|損/.test(all)) objections.push('運用リスク（元本割れ）への不安');
  if (/節税/.test(all)) objections.push('税負担の軽減への期待がある（保障目的であり、通期での節税効果はない旨の説明が必要）');
  if (/貸し剥がし/.test(all)) objections.push('万一の際の金融機関の対応（貸し剥がし）への不安');
  const smallTalkInsights: string[] = [];
  if (/息子|娘/.test(all)) smallTalkInsights.push('ご家族（お子さま）への承継を意識されている');
  if (/血圧|健康|体調/.test(all)) smallTalkInsights.push('健康面への不安を口にされている');
  if (/ゴルフ|趣味|旅行/.test(all)) smallTalkInsights.push('趣味の話題が出ている（関係づくりのきっかけ）');

  const signals: Extraction['signals'] = {
    deficitMentioned: /赤字/.test(all) ? true : null,
    employeeRetirementPrepared: /中退共|退職金制度(は|が)(ある|整って)|従業員の退職金は.*(入って|大丈夫|ある)/.test(all)
      ? true
      : /(従業員|社員)[^。]*退職金[^。]*(ない|できてない|何も)|退職金制度[^。]*(ない|できてない|整備できてない)/.test(all)
        ? false
        : null,
    officerRetirementPrepared: /(俺|自分|私)の?退職金[^。]*(準備してる|積み立て|ある)/.test(all) ? true : /退職金[^。]*何もしてない|何もしてないね/.test(all) ? false : null,
    taxSavingRequested: /節税|税金対策/.test(all) ? true : null,
  };

  const conflicts = buildConflicts(facts, form, quotes);
  return {
    companyFacts: facts,
    conflicts,
    issues,
    interests,
    objections,
    existingPolicies,
    smallTalkInsights,
    missingInfo: missingInfo(form, facts),
    signals,
    source: 'rules',
  };
}

const FORM_FIELD: Partial<Record<keyof Extraction['companyFacts'], [section: 'company' | 'officer', key: string, label: string]>> = {
  revenue: ['company', 'revenue', '年商'],
  ordinaryProfit: ['company', 'ordinaryProfit', '経常利益'],
  netAssets: ['company', 'netAssets', '純資産'],
  loanTotal: ['company', 'loanTotal', '借入金残高'],
  loanShortTerm: ['company', 'loanShortTerm', '一括返済が必要な借入金'],
  loanMonthlyRepay: ['company', 'loanMonthlyRepay', '月々の借入返済額'],
  monthlyLabor: ['company', 'monthlyLabor', '月間人件費'],
  monthlyFixed: ['company', 'monthlyFixed', '月間その他固定費'],
  employeeCount: ['company', 'employeeCount', '従業員数'],
  ceoAge: ['officer', 'age', '代表者の年齢'],
  monthlyPay: ['officer', 'monthlyPay', '役員報酬月額'],
  tenureYears: ['officer', 'tenureYears', '役員在任年数'],
  plannedRetireAge: ['officer', 'plannedRetireAge', '勇退予定年齢'],
  legalHeirs: ['officer', 'legalHeirs', '法定相続人数'],
};

export function fieldLabel(field: string): string {
  return FORM_FIELD[field as keyof typeof FORM_FIELD]?.[2] ?? field;
}

export function formValueOf(form: FormSnapshot, field: string): number | null {
  const f = FORM_FIELD[field as keyof typeof FORM_FIELD];
  if (!f) return null;
  const v = (form[f[0]] as Record<string, unknown>)[f[1]];
  return typeof v === 'number' ? v : null;
}

export function buildConflicts(facts: Extraction['companyFacts'], form: FormSnapshot, quotes: Partial<Record<string, string>>): Extraction['conflicts'] {
  const out: Extraction['conflicts'] = [];
  for (const [field, logValue] of Object.entries(facts)) {
    if (logValue == null) continue;
    const formValue = formValueOf(form, field);
    if (formValue == null) continue;
    const diff = Math.abs(formValue - logValue) / Math.max(1, Math.abs(formValue));
    if (diff > 0.1) out.push({ field, formValue, logValue, quote: quotes[field] ?? '' });
  }
  return out;
}

const IMPORTANT: (keyof Extraction['companyFacts'])[] = ['monthlyPay', 'plannedRetireAge', 'legalHeirs', 'ordinaryProfit', 'monthlyLabor', 'monthlyFixed', 'loanMonthlyRepay', 'loanShortTerm'];

export function missingInfo(form: FormSnapshot, facts: Extraction['companyFacts']): string[] {
  return IMPORTANT.filter((f) => formValueOf(form, f) == null && facts[f] == null).map((f) => fieldLabel(f));
}

/** Drop issues whose evidence quote does not exist in the log (hallucinated quotes). */
export function validateQuotes(ex: Extraction, log: string): Extraction {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const L = norm(log);
  const before = ex.issues.length;
  const issues = ex.issues.filter((i) => i.evidenceQuote && L.includes(norm(i.evidenceQuote)));
  return { ...ex, issues, droppedQuotes: before - issues.length };
}
