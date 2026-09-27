'use client';
import { useCallback, useEffect, useState } from 'react';
import type { LogicRule } from '@p3/engine';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import { Badge, Button, Card, cn } from './ui';

type Tab = 'rules' | 'categories' | 'tax' | 'masking' | 'banned' | 'rates' | 'stats' | 'settings' | 'template' | 'versions';
const TABS: [Tab, string][] = [
  ['rules', 'ロジック辞書'],
  ['categories', '保険種別'],
  ['tax', '税務ルール'],
  ['masking', 'マスキング辞書'],
  ['banned', '禁止表現'],
  ['rates', '参考料率'],
  ['stats', '統計値'],
  ['settings', '設定・注記'],
  ['template', 'テンプレート'],
  ['versions', '版の公開'],
];

interface Version {
  id: string;
  label: string;
  publishedAt: string;
  publishedBy: string;
}

async function put(kind: string, value: unknown): Promise<string | null> {
  const res = await fetch(`/api/admin/knowledge/${kind}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '保存に失敗しました';
}

export function AdminKnowledge({ cases }: { cases: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<Tab>('rules');
  const [draft, setDraft] = useState<KnowledgeSnapshot | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch('/api/admin/knowledge', { cache: 'no-store' });
    const j = (await res.json()) as { draft: KnowledgeSnapshot; versions: Version[] };
    setDraft(j.draft);
    setVersions(j.versions);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const saved = async (err: string | null, okText = '下書きに保存しました（公開すると生成に反映されます）') => {
    setMsg(err ? { text: err, ok: false } : { text: okText, ok: true });
    if (!err) await load();
  };
  if (!draft) return <p className="text-sm text-slate-500">読み込み中…</p>;
  return (
    <div className="space-y-3">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-1">
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => { setTab(t); setMsg(null); }} className={cn('min-h-11 shrink-0 rounded-md px-3 text-sm', tab === t ? 'bg-navy text-white' : 'border border-slate-300 bg-white')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className={cn('rounded-md p-2 text-sm', msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>{msg.text}</p>}
      {tab === 'rules' && <RulesEditor rules={draft.logicRules} cases={cases} onSave={async (rules) => saved(await put('logicRules', rules))} />}
      {tab === 'categories' && <JsonEditor title="保険種別マスタ" value={draft.categories} onSave={async (v) => saved(await put('categories', v))} help="顧客提示では name（＋A/B/Cの記号）だけが使われます。mandatoryDisclaimers は必須注記として資料に必ず表示されます。" />}
      {tab === 'tax' && <JsonEditor title="税務区分ルール（表示用）" value={draft.taxRules} onSave={async (v) => saved(await put('taxRules', v))} help="区分の判定・資産計上額の計算は engine（コード）で行います。ここでは資料に表示する説明文と出典・基準日を管理します。" />}
      {tab === 'masking' && (
        <RowsEditor
          title="マスキング辞書"
          rows={draft.maskingTerms as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'term', label: '語句／正規表現' },
            { key: 'kind', label: '種類', options: ['insurer', 'product', 'fund', 'docId', 'agency'] },
            { key: 'replacement', label: '置換後' },
            { key: 'isRegex', label: '正規表現', bool: true },
          ]}
          empty={{ term: '', kind: 'insurer', replacement: '保険会社', isRegex: false }}
          onSave={async (rows) => saved(await put('maskingTerms', rows))}
        />
      )}
      {tab === 'banned' && (
        <RowsEditor
          title="禁止表現"
          rows={draft.bannedPhrases as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'phrase', label: '表現／正規表現' },
            { key: 'isRegex', label: '正規表現', bool: true },
            { key: 'category', label: '分類', options: ['tax_saving', 'assurance', 'comparison', 'fear', 'other'] },
            { key: 'severity', label: '重大度', options: ['error', 'warning'] },
            { key: 'suggestion', label: '言い換え方針' },
          ]}
          empty={{ phrase: '', isRegex: false, category: 'other', severity: 'error', suggestion: '', allowContext: [] }}
          onSave={async (rows) => saved(await put('bannedPhrases', rows))}
        />
      )}
      {tab === 'rates' && <RatesEditor draft={draft} onDone={saved} />}
      {tab === 'stats' && <JsonEditor title="統計値（出典・基準日必須）" value={draft.statistics} onSave={async (v) => saved(await put('statistics', v))} help="根拠文で引用できる統計値です。source（出典）と asOf（基準日）がないものは保存できません。" />}
      {tab === 'settings' && <SettingsEditor draft={draft} onSaved={saved} />}
      {tab === 'template' && <TemplatePreview />}
      {tab === 'versions' && <Versions versions={versions} onDone={saved} />}
    </div>
  );
}

function JsonEditor({ title, value, onSave, help }: { title: string; value: unknown; onSave: (v: unknown) => Promise<void>; help?: string }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <Card title={title}>
      {help && <p className="mb-2 text-xs text-slate-600">{help}</p>}
      <textarea className="h-[60vh] w-full font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <Button
        className="mt-2"
        onClick={async () => {
          try {
            setErr(null);
            await onSave(JSON.parse(text));
          } catch (e) {
            setErr(`JSONの形式が不正です：${e instanceof Error ? e.message : ''}`);
          }
        }}
      >
        下書きに保存
      </Button>
    </Card>
  );
}

type Col = { key: string; label: string; options?: string[]; bool?: boolean };

function RowsEditor({ title, rows: initial, columns, empty, onSave }: { title: string; rows: Record<string, unknown>[]; columns: Col[]; empty: Record<string, unknown>; onSave: (rows: Record<string, unknown>[]) => Promise<void> }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState('');
  useEffect(() => setRows(initial), [initial]);
  const set = (i: number, k: string, v: unknown) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Card title={`${title}（${rows.length}件）`} actions={<Button variant="ghost" onClick={() => setRows([{ ...empty }, ...rows])}>＋ 追加</Button>}>
      <input className="mb-2 w-full" placeholder="絞り込み" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="p-1">
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              filter && !JSON.stringify(r).includes(filter) ? null : (
                <tr key={i} className="border-t border-slate-100">
                  {columns.map((c) => (
                    <td key={c.key} className="p-1">
                      {c.bool ? (
                        <input type="checkbox" checked={Boolean(r[c.key])} onChange={(e) => set(i, c.key, e.target.checked)} />
                      ) : c.options ? (
                        <select value={String(r[c.key] ?? '')} onChange={(e) => set(i, c.key, e.target.value)}>
                          {c.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input className="w-full min-w-32 font-mono text-xs" value={String(r[c.key] ?? '')} onChange={(e) => set(i, c.key, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td className="p-1">
                    <button className="min-h-11 min-w-11 text-red-700" aria-label="削除" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <Button className="mt-2" onClick={() => onSave(rows)}>
        下書きに保存
      </Button>
    </Card>
  );
}

interface TestResult {
  matched: boolean;
  errors: { id: string; message: string }[];
  hit: { rationale: string } | null;
  facts: Record<string, unknown>;
  before: { tier: string; title: string; components: string[]; ratio: number }[];
  after: { tier: string; title: string; components: string[]; ratio: number }[];
}

const NEW_RULE: LogicRule = { id: 'R09', name: '新しいルール', enabled: true, priority: 9, condition: { '>=': [{ var: 'employeeCount' }, 50] }, effect: { scores: { THIRD_SECTOR: 1 } }, rationale: '' };

function RulesEditor({ rules: initial, cases, onSave }: { rules: LogicRule[]; cases: { id: string; name: string }[]; onSave: (rules: LogicRule[]) => Promise<void> }) {
  const [rules, setRules] = useState(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [cond, setCond] = useState('');
  const [eff, setEff] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => setRules(initial), [initial]);
  const current = sel != null ? rules[sel] : null;
  const open = (i: number) => {
    setSel(i);
    setCond(JSON.stringify(rules[i]!.condition, null, 2));
    setEff(JSON.stringify(rules[i]!.effect, null, 2));
    setResult(null);
    setErr(null);
  };
  const parsed = (): LogicRule | null => {
    try {
      return { ...current!, condition: JSON.parse(cond), effect: JSON.parse(eff) };
    } catch (e) {
      setErr(`JSONの形式が不正です：${e instanceof Error ? e.message : ''}`);
      return null;
    }
  };
  const update = (patch: Partial<LogicRule>) => setRules(rules.map((r, j) => (j === sel ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
      <Card title="ルール一覧" actions={<Button variant="ghost" data-testid="add-rule" onClick={() => { const next = [...rules, { ...NEW_RULE, id: `R${String(rules.length + 1).padStart(2, '0')}` }]; setRules(next); setSel(next.length - 1); setCond(JSON.stringify(NEW_RULE.condition, null, 2)); setEff(JSON.stringify(NEW_RULE.effect, null, 2)); setResult(null); }}>＋ 追加</Button>}>
        <ul className="space-y-1 text-sm">
          {rules.map((r, i) => (
            <li key={i}>
              <button onClick={() => open(i)} className={cn('flex w-full items-center gap-2 rounded p-2 text-left', sel === i ? 'bg-accent-soft' : 'hover:bg-slate-50')}>
                <Badge tone={r.enabled ? 'navy' : 'gray'}>{r.id}</Badge>
                <span className="truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button className="mt-3 w-full" onClick={async () => { if (current) { const p = parsed(); if (!p) return; const next = rules.map((r, j) => (j === sel ? p : r)); setRules(next); await onSave(next); } else await onSave(rules); }} data-testid="save-rules">
          ルールを下書きに保存
        </Button>
      </Card>
      {current ? (
        <Card title={`${current.id} の編集`}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label>ID</label>
              <input value={current.id} onChange={(e) => update({ id: e.target.value })} data-testid="rule-id" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label>ルール名</label>
              <input value={current.name} onChange={(e) => update({ name: e.target.value })} data-testid="rule-name" />
            </div>
            <div className="flex flex-col gap-1">
              <label>優先順位</label>
              <input inputMode="numeric" value={String(current.priority ?? 0)} onChange={(e) => update({ priority: Number(e.target.value) || 0 })} />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={current.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> 有効
            </label>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <label>条件（JSON Logic）</label>
            <textarea className="h-36 font-mono text-xs" value={cond} onChange={(e) => setCond(e.target.value)} spellCheck={false} data-testid="rule-condition" />
            <p className="text-xs text-slate-500">使える変数：loanToRevenue, guaranteesLoan, gap, profitMargin, yearsToRetire, retirementPrepared, ceoAge, employeeCount, employeeRetirementPrepared, tags（商談ログの課題タグ）, deficit, netAssetsToRevenue, peakMisalignment ほか（テスト実行で一覧表示）</p>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <label>効果（effect）</label>
            <textarea className="h-28 font-mono text-xs" value={eff} onChange={(e) => setEff(e.target.value)} spellCheck={false} data-testid="rule-effect" />
            <p className="text-xs text-slate-500">scores（カテゴリ加点）, minBudgetFactor, addToMax（最大プランへの追加）, penalizeTaxBucketGte, penalizeLongVariable, memoPoint</p>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <label>根拠の骨子（{'{変数}'} で差し込み可）</label>
            <textarea className="h-16 text-sm" value={current.rationale} onChange={(e) => update({ rationale: e.target.value })} data-testid="rule-rationale" />
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label>テスト対象の案件</label>
              <select value={caseId} onChange={(e) => setCaseId(e.target.value)} data-testid="rule-test-case">
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="secondary"
              disabled={!caseId}
              data-testid="rule-test"
              onClick={async () => {
                const rule = parsed();
                if (!rule) return;
                setErr(null);
                const res = await fetch('/api/admin/rules/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule, caseId }) });
                const j = await res.json();
                if (!res.ok) return setErr((j as { error: string }).error);
                setResult(j as TestResult);
              }}
            >
              テスト実行
            </Button>
            <Button variant="danger" onClick={() => { setRules(rules.filter((_, j) => j !== sel)); setSel(null); }}>
              削除
            </Button>
          </div>
          {!cases.length && <p className="mt-2 text-xs text-slate-500">テストには3案を作成済みの案件が必要です。</p>}
          {result && (
            <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-sm" data-testid="rule-test-result">
              <div>
                判定：{result.matched ? <Badge tone="green">該当する</Badge> : <Badge>該当しない</Badge>}
                {result.hit && <span className="ml-2">{result.hit.rationale}</span>}
              </div>
              {result.errors.map((e, i) => (
                <div key={i} className="text-red-700">
                  エラー：{e.message}
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-2">
                {(['before', 'after'] as const).map((k) => (
                  <div key={k}>
                    <div className="font-semibold">{k === 'before' ? 'このルールなし' : 'このルールあり'}</div>
                    {result[k].map((p) => (
                      <div key={p.tier} className="text-xs">
                        {p.title}（充足率{p.ratio}%）：{p.components.join('、')}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer text-xs">判定に使った変数（facts）</summary>
                <pre className="overflow-auto text-[11px]">{JSON.stringify(result.facts, null, 2)}</pre>
              </details>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">左の一覧からルールを選ぶか、「＋ 追加」で新しいルールを作成してください。</p>
        </Card>
      )}
    </div>
  );
}

function RatesEditor({ draft, onDone }: { draft: KnowledgeSnapshot; onDone: (err: string | null, ok?: string) => Promise<void> }) {
  const [csv, setCsv] = useState('category,sex,age,termToAge,annualPremiumPer1000man,peakReturnRate,peakYear,source,asOf\n');
  const [mode, setMode] = useState<'append' | 'replace' | 'replaceSamples'>('replaceSamples');
  const summary = new Map<string, { n: number; sample: number }>();
  for (const r of draft.referenceRates) {
    const s = summary.get(r.category) ?? { n: 0, sample: 0 };
    s.n++;
    if (r.isSample) s.sample++;
    summary.set(r.category, s);
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title={`参考料率（${draft.referenceRates.length}行）`}>
        <table className="w-full text-sm">
          <tbody>
            {[...summary].map(([cat, s]) => (
              <tr key={cat} className="border-t border-slate-100">
                <td className="p-1">{draft.categories.find((c) => c.code === cat)?.name ?? cat}</td>
                <td className="p-1 text-right">{s.n}行</td>
                <td className="p-1">{s.sample > 0 && <Badge tone="yellow">サンプル {s.sample}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-600">初期状態は開発用サンプル料率（実在の商品の料率ではありません）です。保険会社の設計システム等から取得した料率をCSVで取り込んでください。料率がないカテゴリは「保険料は設計書にて提示」になります。</p>
      </Card>
      <Card title="CSVインポート">
        <textarea className="h-56 w-full font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="replaceSamples">サンプル料率を置き換えて追加</option>
            <option value="append">追加</option>
            <option value="replace">すべて置き換え</option>
          </select>
          <Button
            onClick={async () => {
              const res = await fetch('/api/admin/rates/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, mode }) });
              const j = (await res.json()) as { imported?: number; total?: number; error?: string };
              await onDone(res.ok ? null : (j.error ?? '取り込みに失敗しました'), `${j.imported}行を取り込みました（合計${j.total}行）`);
            }}
          >
            取り込む
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SettingsEditor({ draft, onSaved }: { draft: KnowledgeSnapshot; onSaved: (err: string | null) => Promise<void> }) {
  const [p, setP] = useState(draft.presentation);
  useEffect(() => setP(draft.presentation), [draft.presentation]);
  return (
    <div className="space-y-3">
      <Card title="表示・運用設定">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.requireApproval} onChange={(e) => setP({ ...p, requireApproval: e.target.checked })} /> 顧客提示前にマネージャー承認を必須にする
          </label>
          <div className="flex flex-col gap-1">
            <label>アクセントカラー</label>
            <input value={p.accentColor} onChange={(e) => setP({ ...p, accentColor: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <label>ブランド名（ロゴ表記）</label>
            <input value={p.brandName} onChange={(e) => setP({ ...p, brandName: e.target.value })} />
          </div>
        </div>
        <Button className="mt-2" onClick={async () => onSaved(await put('presentation', p))}>
          下書きに保存
        </Button>
      </Card>
      <JsonEditor title="計算の設定値（月数・実効税率・物価上昇率・功績倍率・予算の目安 など）" value={draft.settings} onSave={async (v) => onSaved(await put('settings', v))} help="adoptedMethod（A:積上げ／B:運転資金）、rebuildMonths、workingCapitalMonths、effectiveTaxRate、inflationRate、meritMultipliers、budgetRates、incomeTaxBrackets（速算表）、asOf／taxAsOf（基準日）などを変更できます。" />
      <JsonEditor title="必須注記" value={draft.disclaimers} onSave={async (v) => onSaved(await put('disclaimers', v))} />
    </div>
  );
}

function TemplatePreview() {
  const [type, setType] = useState('summary');
  const [n, setN] = useState(0);
  return (
    <Card title="テンプレートのプレビュー（編集中の設定・注記を反映）" actions={<Button variant="ghost" onClick={() => setN(n + 1)}>再読み込み</Button>}>
      <div className="mb-2 flex gap-2">
        {['summary', 'design', 'memo', 'slides'].map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn('min-h-11 rounded px-3 text-sm', type === t ? 'bg-navy text-white' : 'border border-slate-300')}>
            {{ summary: 'サマリー型', design: '設計書型', memo: '営業メモ', slides: 'スライド' }[t]}
          </button>
        ))}
      </div>
      <iframe key={`${type}-${n}`} title="プレビュー" src={`/api/admin/preview?type=${type}`} className="h-[70vh] w-full rounded border border-slate-200" />
    </Card>
  );
}

function Versions({ versions, onDone }: { versions: Version[]; onDone: (err: string | null, ok?: string) => Promise<void> }) {
  const [label, setLabel] = useState('');
  return (
    <div className="space-y-3">
      <Card title="新しい版を公開">
        <div className="flex flex-wrap gap-2">
          <input className="min-w-60 flex-1" placeholder="変更内容（例：R09 追加、功績倍率の更新）" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="publish-label" />
          <Button
            variant="accent"
            data-testid="publish"
            onClick={async () => {
              const res = await fetch('/api/admin/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
              const j = (await res.json()) as { id?: string; error?: string };
              await onDone(res.ok ? null : (j.error ?? '公開に失敗しました'), `版 ${j.id} を公開しました。以降の生成に反映されます`);
              setLabel('');
            }}
          >
            公開する
          </Button>
        </div>
      </Card>
      <Card title="公開済みの版">
        <ul className="space-y-1 text-sm">
          {versions.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1">
              <span>
                <Badge tone={i === 0 ? 'green' : 'gray'}>{v.id}</Badge> {v.label}
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(v.publishedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}／{v.publishedBy}
                </span>
              </span>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`版 ${v.id} の内容を編集中の下書きに読み込みます。よろしいですか？`)) return;
                  const res = await fetch('/api/admin/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId: v.id }) });
                  await onDone(res.ok ? null : '復元に失敗しました', `版 ${v.id} を下書きに読み込みました`);
                }}
              >
                下書きに読み込む
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
