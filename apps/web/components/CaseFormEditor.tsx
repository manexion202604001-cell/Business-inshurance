'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { formatMan } from '@p3/engine';
import type { CaseForm } from '@p3/pipeline';
import { Badge, Button, Card, cn } from './ui';

type Str = Record<string, string>;
type PolicyRow = { category: string; deathBenefit: string; annualPremium: string; issueAge: string; peakYear: string; purpose: string };

const CATEGORY_OPTIONS: [string, string][] = [
  ['TERM_LOW_CV', '定期保険（低解約返戻金型）'],
  ['TERM_LEVEL_LONG', '長期平準定期保険'],
  ['TERM_DECREASING', '逓減定期保険・収入保障型'],
  ['VARIABLE_TERM', '変額保険（定期型）'],
  ['WHOLE_LIFE', '終身保険'],
  ['THIRD_SECTOR', '医療・がん・三大疾病・就業不能'],
  ['ENDOWMENT_HALF', '養老保険（福利厚生プラン）'],
];

const COMPANY_NUM = ['revenue', 'ordinaryProfit', 'netAssets', 'loanTotal', 'loanShortTerm', 'loanMonthlyRepay', 'monthlyLabor', 'monthlyFixed', 'employeeCount', 'fiscalMonth'] as const;
const OFFICER_NUM = ['age', 'monthlyPay', 'tenureYears', 'plannedRetireAge', 'legalHeirs'] as const;

const s = (v: unknown) => (v == null ? '' : String(v));

function toStrings(f: CaseForm | null) {
  const c = (f?.company ?? {}) as unknown as Record<string, unknown>;
  const o = (f?.officer ?? {}) as unknown as Record<string, unknown>;
  const company: Str = { name: s(c.name), industry: s(c.industry) || 'manufacturing' };
  for (const k of COMPANY_NUM) company[k] = s(c[k]);
  const officer: Str = { role: s(o.role) || '社長', sex: s(o.sex) || 'M' };
  for (const k of OFFICER_NUM) officer[k] = s(o[k]);
  const policies: PolicyRow[] = (f?.existingPolicies ?? []).map((p) => ({ category: p.category, deathBenefit: s(p.deathBenefit), annualPremium: s(p.annualPremium), issueAge: s(p.issueAge), peakYear: s(p.peakYear), purpose: s(p.purpose) }));
  return { company, officer, policies, guarantees: Boolean(f?.officer?.guaranteesLoan), onDuty: Boolean(f?.onDutyDeath), log: f?.rawLog ?? '' };
}

/** Accepts "12,000", "1億2000", "1億2千" (万円 units). */
function parseNum(v: string, manUnits = false): number | null {
  const t = v.normalize('NFKC').replace(/[,\s万円]/g, '');
  if (!t) return null;
  if (manUnits && /億|千/.test(t)) {
    const m = t.match(/^(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)千)?(\d+)?$/);
    if (m) return Math.round(Number(m[1] ?? 0) * 10000 + Number(m[2] ?? 0) * 1000 + Number(m[3] ?? 0));
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function CaseFormEditor({ initial, industries, samples }: { initial: CaseForm | null; industries: { code: string; label: string }[]; samples: { id: string; title: string; form: CaseForm }[] }) {
  const router = useRouter();
  const init = toStrings(initial);
  const [company, setCompany] = useState<Str>(init.company);
  const [officer, setOfficer] = useState<Str>(init.officer);
  const [policies, setPolicies] = useState<PolicyRow[]>(init.policies);
  const [guarantees, setGuarantees] = useState(init.guarantees);
  const [onDuty, setOnDuty] = useState(init.onDuty);
  const [log, setLog] = useState(init.log);
  const [filled, setFilled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSample = (f: CaseForm) => {
    const x = toStrings(f);
    setCompany(x.company);
    setOfficer(x.officer);
    setPolicies(x.policies);
    setGuarantees(x.guarantees);
    setOnDuty(false);
    setLog(x.log);
    setFilled([]);
  };

  async function fillFromLog(text = log) {
    if (!text.trim()) return;
    const res = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rawLog: text, officerAge: parseNum(officer.age ?? '') }) });
    if (!res.ok) return;
    const { facts, existingPolicies } = (await res.json()) as { facts: Record<string, number | null>; existingPolicies: { categoryGuess: string; deathBenefit: number | null }[] };
    const got: string[] = [];
    const nextC = { ...company };
    for (const k of ['revenue', 'ordinaryProfit', 'netAssets', 'loanTotal', 'loanShortTerm', 'loanMonthlyRepay', 'monthlyLabor', 'monthlyFixed', 'employeeCount']) {
      if (!nextC[k] && facts[k] != null) {
        nextC[k] = String(facts[k]);
        got.push(k);
      }
    }
    const nextO = { ...officer };
    for (const [fk, ok] of [['ceoAge', 'age'], ['monthlyPay', 'monthlyPay'], ['tenureYears', 'tenureYears'], ['plannedRetireAge', 'plannedRetireAge'], ['legalHeirs', 'legalHeirs']] as const) {
      if (!nextO[ok] && facts[fk] != null) {
        nextO[ok] = String(facts[fk]);
        got.push(ok);
      }
    }
    setCompany(nextC);
    setOfficer(nextO);
    if (policies.length === 0 && existingPolicies.length) {
      setPolicies(existingPolicies.filter((p) => p.deathBenefit != null).map((p) => ({ category: p.categoryGuess, deathBenefit: String(p.deathBenefit), annualPremium: '', issueAge: '', peakYear: '', purpose: '' })));
      got.push('policies');
    }
    setFilled(got);
    setMsg(got.length ? `商談ログから ${got.length} 項目を補完しました（黄色の項目を確認してください）` : '商談ログから補完できる数値は見つかりませんでした');
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    setMsg('ファイルを読み込み中…');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const j = (await res.json()) as { text?: string; error?: string };
    if (!res.ok || !j.text) return setMsg(j.error ?? '読み込みに失敗しました');
    setLog(j.text);
    setMsg(`${file.name} を読み込みました`);
    void fillFromLog(j.text);
  }

  async function submit() {
    setBusy(true);
    setErrors([]);
    setMsg(null);
    const form: CaseForm = {
      company: {
        name: company.name!.trim(),
        industry: company.industry!,
        fiscalMonth: parseNum(company.fiscalMonth ?? ''),
        revenue: parseNum(company.revenue ?? '', true) ?? 0,
        ordinaryProfit: parseNum(company.ordinaryProfit ?? '', true),
        netAssets: parseNum(company.netAssets ?? '', true),
        loanTotal: parseNum(company.loanTotal ?? '', true) ?? 0,
        loanShortTerm: parseNum(company.loanShortTerm ?? '', true),
        loanMonthlyRepay: parseNum(company.loanMonthlyRepay ?? '', true),
        monthlyLabor: parseNum(company.monthlyLabor ?? '', true),
        monthlyFixed: parseNum(company.monthlyFixed ?? '', true),
        employeeCount: parseNum(company.employeeCount ?? '') ?? 0,
      },
      officer: {
        role: officer.role as CaseForm['officer']['role'],
        age: parseNum(officer.age ?? '') ?? 0,
        sex: officer.sex as 'M' | 'F',
        monthlyPay: parseNum(officer.monthlyPay ?? '', true) ?? 0,
        tenureYears: parseNum(officer.tenureYears ?? '') ?? 0,
        plannedRetireAge: parseNum(officer.plannedRetireAge ?? ''),
        legalHeirs: parseNum(officer.legalHeirs ?? ''),
        guaranteesLoan: guarantees,
      },
      existingPolicies: policies
        .filter((p) => p.category)
        .map((p) => ({ category: p.category, purpose: p.purpose || null, deathBenefit: parseNum(p.deathBenefit, true), annualPremium: parseNum(p.annualPremium, true), issueAge: parseNum(p.issueAge), peakYear: parseNum(p.peakYear), maturityAge: null, peakReturnRate: null, note: null })),
      rawLog: log,
      onDutyDeath: onDuty,
    };
    const res = await fetch('/api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    const j = (await res.json()) as { id?: string; error?: string; detail?: { path: string; message: string }[] };
    if (!res.ok || !j.id) {
      setBusy(false);
      setErrors(j.detail ?? []);
      setMsg(j.error ?? '保存に失敗しました');
      return;
    }
    router.push(`/cases/${j.id}?run=1`);
  }

  const errOf = (path: string) => errors.find((e) => e.path === path)?.message;
  const numField = (section: 'company' | 'officer', key: string, label: string, unit: string, opts: { required?: boolean; man?: boolean } = {}) => {
    const st = section === 'company' ? company : officer;
    const set = section === 'company' ? setCompany : setOfficer;
    const val = st[key] ?? '';
    const n = opts.man ? parseNum(val, true) : null;
    const err = errOf(`${section}.${key}`);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={`${section}-${key}`} className="flex items-center gap-1">
          {label}
          {opts.required && <span className="text-red-600">*</span>}
          {filled.includes(key) && <Badge tone="yellow">ログから補完</Badge>}
        </label>
        <div className="flex items-center gap-2">
          <input id={`${section}-${key}`} name={`${section}.${key}`} inputMode="decimal" className={cn('w-full', filled.includes(key) && 'border-amber-400 bg-amber-50', err && 'border-red-500')} value={val} onChange={(e) => set({ ...st, [key]: e.target.value })} />
          <span className="shrink-0 text-sm text-slate-500">{unit}</span>
        </div>
        {opts.man && n != null && n >= 10000 && <span className="text-xs text-slate-500">＝{formatMan(n)}</span>}
        {err && <span className="text-xs text-red-700">{err}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      {samples.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">サンプル：</span>
          {samples.map((x) => (
            <button key={x.id} type="button" className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50" onClick={() => loadSample(x.form)} data-testid={`sample-${x.id}`}>
              {x.title}
            </button>
          ))}
        </div>
      )}

      <Card title="商談ログ" actions={<span className="text-xs text-slate-500">社名・商品名は自動でマスキングされます</span>}>
        <textarea
          name="rawLog"
          className="min-h-40 w-full font-mono text-sm"
          placeholder={'議事録・文字起こしを貼り付けてください\n例）社長：銀行から1億2千万借りてて、俺が連帯保証してる。'}
          value={log}
          onChange={(e) => setLog(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t) setTimeout(() => void fillFromLog(t), 0);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            ファイルから読み込む
          </Button>
          <Button type="button" variant="secondary" onClick={() => fillFromLog()} disabled={!log.trim()}>
            ログから空欄を補完
          </Button>
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.vtt,.srt,.docx,.pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </Card>

      <Card title="企業情報">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="company-name">
              会社名<span className="text-red-600">*</span>
            </label>
            <input id="company-name" name="company.name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
            {errOf('company.name') && <span className="text-xs text-red-700">{errOf('company.name')}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="company-industry">業種</label>
            <select id="company-industry" value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })}>
              {industries.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          {numField('company', 'revenue', '年商', '万円', { required: true, man: true })}
          {numField('company', 'loanTotal', '借入金残高（合計）', '万円', { required: true, man: true })}
          {numField('company', 'employeeCount', '従業員数', '名', { required: true })}
        </div>
      </Card>

      <Card title="代表者（被保険者）">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="officer-role">役位</label>
            <select id="officer-role" value={officer.role} onChange={(e) => setOfficer({ ...officer, role: e.target.value })}>
              {['社長', '会長', '専務', '常務', '取締役'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="officer-sex">性別</label>
            <select id="officer-sex" value={officer.sex} onChange={(e) => setOfficer({ ...officer, sex: e.target.value })}>
              <option value="M">男性</option>
              <option value="F">女性</option>
            </select>
          </div>
          {numField('officer', 'age', '年齢', '歳', { required: true })}
          {numField('officer', 'monthlyPay', '役員報酬月額', '万円', { required: true, man: true })}
          {numField('officer', 'tenureYears', '役員在任年数', '年', { required: true })}
          {numField('officer', 'plannedRetireAge', '勇退予定年齢', '歳')}
        </div>
      </Card>

      <details className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" open={Boolean(initial) || filled.length > 0}>
        <summary className="cursor-pointer text-base font-bold text-navy">詳しい情報（任意・分かる範囲で）</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numField('company', 'ordinaryProfit', '経常利益', '万円', { man: true })}
          {numField('company', 'netAssets', '純資産', '万円', { man: true })}
          {numField('company', 'loanShortTerm', '一括返済が必要になり得る借入金・営業債務', '万円', { man: true })}
          {numField('company', 'loanMonthlyRepay', '月々の借入返済額', '万円', { man: true })}
          {numField('company', 'monthlyLabor', '月間人件費', '万円', { man: true })}
          {numField('company', 'monthlyFixed', '月間その他固定費', '万円', { man: true })}
          {numField('company', 'fiscalMonth', '決算月', '月')}
          {numField('officer', 'legalHeirs', '法定相続人数', '人')}
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={guarantees} onChange={(e) => setGuarantees(e.target.checked)} /> 代表者が会社借入の連帯保証人
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={onDuty} onChange={(e) => setOnDuty(e.target.checked)} /> 弔慰金を業務上の死亡で計算する
          </label>
        </div>
      </details>

      <Card
        title="既存の保険"
        actions={
          <Button type="button" variant="ghost" onClick={() => setPolicies([...policies, { category: 'TERM_LOW_CV', deathBenefit: '', annualPremium: '', issueAge: '', peakYear: '', purpose: '' }])}>
            ＋ 追加
          </Button>
        }
      >
        {policies.length === 0 && <p className="text-sm text-slate-500">なし（分からなければ空欄のままで構いません）{filled.includes('policies') && ''}</p>}
        <div className="space-y-3">
          {policies.map((p, i) => (
            <div key={i} className={cn('grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-5', filled.includes('policies') && 'border-amber-300 bg-amber-50')}>
              <select className="col-span-2" value={p.category} onChange={(e) => setPolicies(policies.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>
                {CATEGORY_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input placeholder="保障額（万円）" inputMode="decimal" value={p.deathBenefit} onChange={(e) => setPolicies(policies.map((x, j) => (j === i ? { ...x, deathBenefit: e.target.value } : x)))} />
              <input placeholder="年間保険料（万円）" inputMode="decimal" value={p.annualPremium} onChange={(e) => setPolicies(policies.map((x, j) => (j === i ? { ...x, annualPremium: e.target.value } : x)))} />
              <div className="col-span-2 flex gap-2 sm:col-span-1">
                <input className="w-full" placeholder="加入時年齢" inputMode="numeric" value={p.issueAge} onChange={(e) => setPolicies(policies.map((x, j) => (j === i ? { ...x, issueAge: e.target.value } : x)))} />
                <input className="w-full" placeholder="返戻率ピーク（経過年）" inputMode="numeric" value={p.peakYear} onChange={(e) => setPolicies(policies.map((x, j) => (j === i ? { ...x, peakYear: e.target.value } : x)))} />
                <button type="button" aria-label="削除" className="min-w-11 rounded text-red-700 hover:bg-red-50" onClick={() => setPolicies(policies.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {msg && <p className={cn('rounded-md p-3 text-sm', errors.length ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700')}>{msg}</p>}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <Button type="button" variant="accent" className="w-full py-3 text-base" onClick={submit} disabled={busy} data-testid="create-plans">
            {busy ? '保存中…' : '3案を作成'}
          </Button>
        </div>
      </div>
    </div>
  );
}
