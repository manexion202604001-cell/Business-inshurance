'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Money, Plan, Tier } from '@p3/engine';
import type { CaseView } from '@/lib/cases';
import { Badge, Button, Card, cn, LinkButton, StatusBadge } from './ui';
import { man, planTitle, TIER_JA } from './format';
import { CalcBreakdown } from './CalcBreakdown';
import { TalkMemo } from './TalkMemo';

const STEPS: [number, string][] = [
  [1, '入力の正規化・マスキング'],
  [2, '商談ログの抽出'],
  [3, '必要保障額などの計算'],
  [4, '3案の構成'],
  [5, '提案文の作成'],
  [6, 'コンプライアンス検証'],
  [7, '資料のレンダリング'],
];

type StepState = { status: 'pending' | 'start' | 'done' | 'error'; ms?: number };
type Tab = 'plans' | 'docs' | 'memo' | 'calc';

export function CaseResult({ initial, autoRun, canApprove, canSeeInternal, issueLabels }: { initial: CaseView; autoRun: boolean; canApprove: boolean; canSeeInternal: boolean; issueLabels: Record<string, string> }) {
  const [view, setView] = useState(initial);
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [running, setRunning] = useState(false);
  const [earlyIssues, setEarlyIssues] = useState<{ tag: string; summary: string }[]>([]);
  const [tab, setTab] = useState<Tab>('plans');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const started = useRef(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/cases/${view.id}`, { cache: 'no-store' });
    if (res.ok) setView((await res.json()) as CaseView);
  }, [view.id]);

  const run = useCallback(() => {
    setRunning(true);
    setError(null);
    setEarlyIssues([]);
    setSteps(Object.fromEntries(STEPS.map(([n]) => [n, { status: 'pending' }])));
    const es = new EventSource(`/api/cases/${view.id}/generate`);
    es.addEventListener('progress', (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as { step: number; status: StepState['status']; ms?: number; data?: { issues?: { tag: string; summary: string }[] } };
      setSteps((s) => ({ ...s, [e.step]: { status: e.status, ms: e.ms } }));
      if (e.step === 2 && e.status === 'done' && e.data?.issues) setEarlyIssues(e.data.issues);
    });
    es.addEventListener('done', async () => {
      es.close();
      await reload();
      setRunning(false);
      if (window.location.search.includes('run=1')) window.history.replaceState(null, '', `/cases/${view.id}`);
    });
    es.addEventListener('failure', (ev) => {
      es.close();
      setRunning(false);
      setError((JSON.parse((ev as MessageEvent).data) as { error: string }).error);
      void reload();
    });
    es.onerror = () => {
      es.close();
      setRunning(false);
      void reload();
    };
  }, [view.id, reload]);

  useEffect(() => {
    if (autoRun && !started.current) {
      started.current = true;
      run();
    }
  }, [autoRun, run]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function setRecommended(tier: Tier) {
    const next = view.recommendedTier === tier ? null : tier;
    setView({ ...view, recommendedTier: next });
    await fetch(`/api/cases/${view.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recommendedTier: next }) });
  }

  async function approve(on: boolean) {
    const res = await fetch(`/api/cases/${view.id}/approve`, { method: on ? 'POST' : 'DELETE' });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) return flash(j.error ?? '承認できませんでした');
    await reload();
    flash(on ? '承認しました' : '承認を取り消しました');
  }

  async function share() {
    const res = await fetch(`/api/cases/${view.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days: 7 }) });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) return flash(j.error ?? '共有リンクを作成できませんでした');
    const full = `${window.location.origin}${j.url}`;
    await navigator.clipboard?.writeText(full).catch(() => {});
    await reload();
    flash('共有リンク（7日間・社内ログイン必須）をコピーしました');
  }

  async function remove() {
    if (!confirm('この案件を削除します。よろしいですか？')) return;
    const res = await fetch(`/api/cases/${view.id}`, { method: 'DELETE' });
    if (res.ok) window.location.href = '/cases';
  }

  const generated = Boolean(view.planSet && view.calc && view.narrative);
  const blocked = view.status === 'blocked';
  const needsApproval = view.requireApproval && !view.approvedAt;
  const outputLocked = blocked || needsApproval;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={running ? 'generating' : view.status} />
            <h1 className="truncate text-lg font-bold text-navy">{view.companyName}</h1>
          </div>
          <p className="text-xs text-slate-500">
            担当 {view.ownerName}
            {view.generatedAt && <> ／ 作成 {new Date(view.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {generated && !running && (
            <>
              <LinkButton href={outputLocked ? '#' : `/api/cases/${view.id}/pdf?type=summary`} variant="accent" className={cn(outputLocked && 'pointer-events-none opacity-50')} download>
                <span data-testid="pdf-summary">PDF（サマリー）</span>
              </LinkButton>
              <LinkButton href={`/cases/${view.id}/present`} className={cn(outputLocked && 'pointer-events-none opacity-50')}>
                スライド表示
              </LinkButton>
            </>
          )}
          <Button variant="secondary" onClick={run} disabled={running}>
            {generated ? '再生成' : '3案を作成'}
          </Button>
        </div>
      </div>

      {running || (Object.keys(steps).length > 0 && !generated) ? (
        <Card title="作成中…">
          <ol className="space-y-1 text-sm">
            {STEPS.map(([n, label]) => {
              const st = steps[n]?.status ?? 'pending';
              return (
                <li key={n} className="flex items-center gap-2">
                  <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-xs', st === 'done' ? 'bg-emerald-600 text-white' : st === 'start' ? 'animate-pulse bg-accent text-white' : st === 'error' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600')}>{st === 'done' ? '✓' : n}</span>
                  <span className={cn(st === 'pending' && 'text-slate-400')}>{label}</span>
                  {steps[n]?.ms != null && <span className="text-xs text-slate-400">{(steps[n]!.ms! / 1000).toFixed(1)}秒</span>}
                </li>
              );
            })}
          </ol>
          {earlyIssues.length > 0 && (
            <div className="mt-3 rounded-md bg-accent-soft p-3 text-sm">
              <div className="mb-1 font-semibold text-navy">商談ログから読み取った課題（先に確認できます）</div>
              <ul className="list-disc pl-5">
                {earlyIssues.map((i, k) => (
                  <li key={k}>
                    {issueLabels[i.tag] ?? i.tag}：{i.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : null}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">生成に失敗しました：{error}</p>}
      {view.status === 'error' && view.error && !running && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">前回の生成でエラーが発生しました：{view.error}</p>}

      {!generated && !running && (
        <Card>
          <p className="text-sm text-slate-600">まだ3案が作成されていません。</p>
          <Button className="mt-3 w-full" variant="accent" onClick={run} data-testid="run">
            3案を作成
          </Button>
        </Card>
      )}

      {generated && !running && (
        <>
          <ComplianceBar view={view} />
          {view.requireApproval && (
            <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md p-3 text-sm', view.approvedAt ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
              <span>{view.approvedAt ? `承認済み（${new Date(view.approvedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）` : '顧客提示前にマネージャーの承認が必要です'}</span>
              {canApprove && !blocked && (
                <Button variant={view.approvedAt ? 'secondary' : 'primary'} onClick={() => approve(!view.approvedAt)}>
                  {view.approvedAt ? '承認を取り消す' : '承認する'}
                </Button>
              )}
            </div>
          )}
          {!view.requireApproval && canApprove && !blocked && !view.approvedAt && (
            <div className="text-right">
              <Button variant="ghost" onClick={() => approve(true)}>
                マネージャー承認を記録
              </Button>
            </div>
          )}
          <AssumptionPanel view={view} onDone={async (ms) => {
            await reload();
            flash(`再計算しました（${(ms / 1000).toFixed(1)}秒）`);
          }} />

          <div className="sticky top-[49px] z-10 -mx-4 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur">
            <div className="flex gap-1" role="tablist">
              {(
                [
                  ['plans', '3案比較'],
                  ['docs', '顧客用資料'],
                  ['memo', 'トーク・根拠メモ'],
                  ['calc', '計算の内訳'],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold', tab === t ? 'border-accent text-navy' : 'border-transparent text-slate-500')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'plans' && <PlansTab view={view} onRecommend={setRecommended} />}
          {tab === 'docs' && <DocsTab view={view} locked={outputLocked} />}
          {tab === 'memo' && <TalkMemo view={view} canSeeInternal={canSeeInternal} issueLabels={issueLabels} />}
          {tab === 'calc' && <CalcBreakdown view={view} />}

          <Feedback caseId={view.id} target={tab} />

          <Card title="出力・共有">
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/api/cases/${view.id}/pdf?type=design`} className={cn(outputLocked && 'pointer-events-none opacity-50')} download>
                設計書型PDF
              </LinkButton>
              <LinkButton href={`/api/cases/${view.id}/pdf?type=memo`} className={cn(blocked && 'pointer-events-none opacity-50')} download>
                営業メモPDF（社内用）
              </LinkButton>
              <Button variant="secondary" onClick={share} disabled={outputLocked}>
                共有リンクを作成
              </Button>
              <Button variant="danger" onClick={remove}>
                案件を削除
              </Button>
            </div>
            {view.shareToken && view.shareExpiresAt && (
              <p className="mt-2 break-all text-xs text-slate-600">
                共有中：/share/{view.shareToken}（{new Date(view.shareExpiresAt).toLocaleDateString('ja-JP')}まで・社内ログイン必須）
              </p>
            )}
          </Card>

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">生成情報</summary>
            <div className="mt-1 space-y-0.5">
              <div>文章生成：{view.narrativeMeta?.source === 'llm' ? 'AI（Claude）' : view.narrativeMeta?.source === 'mixed' ? 'AI＋定型文（一部差し替え）' : '定型文'}（{view.metrics?.llmReason}）</div>
              <div>抽出：{view.extraction?.source === 'llm' ? 'AI抽出' : 'ルール抽出'}{view.narrativeMeta?.extractionError && `（AI抽出失敗：${view.narrativeMeta.extractionError}）`}</div>
              <div>モデル：{view.llmModel} ／ ナレッジ版：{view.knowledgeVersion} ／ プロンプト版：{view.promptVersion}</div>
              <div>
                所要時間：合計 {((view.metrics?.totalMs ?? 0) / 1000).toFixed(1)}秒（
                {Object.entries(view.metrics?.stepMs ?? {})
                  .map(([k, v]) => `Step${k} ${(Number(v) / 1000).toFixed(1)}s`)
                  .join(' / ')}
                ）{view.metrics?.usage?.length ? ` ／ トークン 入力${view.metrics.usage.reduce((s, u) => s + u.inputTokens, 0)}・出力${view.metrics.usage.reduce((s, u) => s + u.outputTokens, 0)}・キャッシュ読込${view.metrics.usage.reduce((s, u) => s + u.cacheReadTokens, 0)}` : ''}
              </div>
              {view.inputMaskHits.length > 0 && <div>入力時にマスキングした語：{view.inputMaskHits.map((h) => h.match).join('、')}</div>}
            </div>
          </details>
        </>
      )}

      <div>
        <Link href="/cases" className="text-sm text-navy underline">
          ← 案件一覧へ
        </Link>
      </div>
      {toast && <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md rounded-md bg-navy p-3 text-center text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function ComplianceBar({ view }: { view: CaseView }) {
  const c = view.compliance;
  const [open, setOpen] = useState(false);
  if (!c) return null;
  const tone = c.status === 'ok' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : c.status === 'warning' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-red-50 text-red-900 border-red-300';
  const label = c.status === 'ok' ? 'コンプラチェック OK' : c.status === 'warning' ? 'コンプラチェック 要確認' : 'コンプラチェック ブロック（出力できません）';
  return (
    <div className={cn('rounded-md border p-3 text-sm', tone)} data-testid="compliance">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)} disabled={!c.issues.length}>
        <span className="font-semibold">{label}</span>
        <span className="text-xs">
          社名・商品名 {c.counts.masking}／禁止表現 {c.counts.banned}／数値 {c.counts.grounding}／注記 {c.counts.disclaimer}
          {c.issues.length > 0 && (open ? ' ▲' : ' ▼')}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {c.issues.map((i, k) => (
            <li key={k} className="rounded bg-white/70 p-2">
              <Badge tone={i.severity === 'error' ? 'red' : 'yellow'}>{i.severity === 'error' ? 'エラー' : '警告'}</Badge> <span className="text-xs text-slate-500">{i.section}</span>
              <div>
                <mark className="bg-yellow-200">{i.match}</mark> {i.message}
              </div>
              {i.suggestion && <div className="text-xs text-slate-600">→ {i.suggestion}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EDITABLE: Record<string, { section: 'company' | 'officer'; key: string }> = {
  monthlyLabor: { section: 'company', key: 'monthlyLabor' },
  monthlyFixed: { section: 'company', key: 'monthlyFixed' },
  loanMonthlyRepay: { section: 'company', key: 'loanMonthlyRepay' },
  loanShortTerm: { section: 'company', key: 'loanShortTerm' },
  ordinaryProfit: { section: 'company', key: 'ordinaryProfit' },
  plannedRetireAge: { section: 'officer', key: 'plannedRetireAge' },
  legalHeirs: { section: 'officer', key: 'legalHeirs' },
  netAssets: { section: 'company', key: 'netAssets' },
};

function AssumptionPanel({ view, onDone }: { view: CaseView; onDone: (ms: number) => Promise<void> }) {
  const items = (view.calc?.assumptions ?? []).filter((a) => EDITABLE[a.field]);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!items.length) return null;
  async function save() {
    const target = EDITABLE[editing!]!;
    const n = value.trim() === '' ? null : Number(value.normalize('NFKC').replace(/,/g, ''));
    if (n != null && !Number.isFinite(n)) return setErr('数値を入力してください');
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/cases/${view.id}/recalc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [target.section]: { [target.key]: n } }) });
    const j = (await res.json()) as { ms?: number; error?: string };
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? '再計算に失敗しました');
    setEditing(null);
    await onDone(j.ms ?? 0);
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="assumptions">
      <div className="mb-2 font-semibold text-amber-900">仮置きの値があります（タップして修正すると計算からやり直します）</div>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <button key={a.field} className="rounded-md border border-amber-400 bg-white px-2 py-1.5 text-left text-xs hover:bg-amber-100" onClick={() => { setEditing(a.field); setValue(String(a.value)); setErr(null); }}>
            <span className="font-semibold">{a.label}</span>：{a.unit === '万円' ? man(a.value) : `${a.value}${a.unit}`}
            <span className="ml-1 rounded bg-amber-200 px-1">仮置き</span>
          </button>
        ))}
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="assume-value">{items.find((i) => i.field === editing)?.label}（{items.find((i) => i.field === editing)?.unit}）</label>
            <input id="assume-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </div>
          <Button onClick={save} disabled={busy}>
            {busy ? '再計算中…' : '確定して再計算'}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            キャンセル
          </Button>
          <p className="w-full text-xs text-amber-900">{items.find((i) => i.field === editing)?.reason}</p>
          {err && <p className="w-full text-xs text-red-700">{err}</p>}
        </div>
      )}
    </div>
  );
}

function PlansTab({ view, onRecommend }: { view: CaseView; onRecommend: (t: Tier) => void }) {
  const plans = view.planSet!.plans;
  const ordered = view.recommendedTier ? [...plans].sort((a, b) => (a.tier === view.recommendedTier ? -1 : b.tier === view.recommendedTier ? 1 : 0)) : plans;
  const cv = view.calc!.coverage;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="必要保障額" m={cv.required} />
        <Kpi label="既存の保障" m={cv.existing} />
        <Kpi label="不足額" m={cv.gap} strong />
        <Kpi label="勇退退職金（物価考慮）" m={view.calc!.retirement.inflationAdjusted} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {ordered.map((p) => (
          <PlanCard key={p.tier} plan={p} view={view} recommended={view.recommendedTier === p.tier} onRecommend={() => onRecommend(p.tier)} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, m, strong }: { label: string; m: Money; strong?: boolean }) {
  return (
    <div className={cn('rounded-md border p-2 text-center', strong ? 'border-accent bg-accent-soft' : 'border-slate-200 bg-white')}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-bold text-navy">
        {man(m)}
        {m.assumed && <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-normal text-amber-900">仮置き</span>}
      </div>
    </div>
  );
}

function PlanCard({ plan: p, view, recommended, onRecommend }: { plan: Plan; view: CaseView; recommended: boolean; onRecommend: () => void }) {
  const n = view.narrative!.plans.find((x) => x.tier === p.tier);
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm', recommended ? 'border-2 border-accent' : 'border-slate-200')} data-testid={`plan-${p.tier}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-accent">{TIER_JA[p.tier]}</span>
        <button onClick={onRecommend} className={cn('min-h-9 rounded px-2 text-xs', recommended ? 'bg-accent text-white' : 'border border-slate-300 text-slate-600')} aria-pressed={recommended}>
          {recommended ? '★ 推し' : '☆ 推しにする'}
        </button>
      </div>
      <h3 className="font-bold text-navy">{planTitle(p.title)}</h3>
      {n && <p className="text-sm font-semibold text-navy2">{n.headline}</p>}
      <ul className="space-y-1 text-sm">
        {p.components.map((c) => (
          <li key={c.categoryCode + c.role} className="rounded bg-slate-50 p-2">
            <div className="flex justify-between gap-2">
              <span>{c.label}</span>
              <b>{man(c.deathBenefit)}</b>
            </div>
            <div className="text-xs text-slate-500">
              {c.purpose}／{c.categoryCode === 'WHOLE_LIFE' ? '終身' : `${c.termToAge}歳まで`}
              {c.premiumEstimate !== 'DESIGN_SHEET_REQUIRED' ? `／年 約${man(c.premiumEstimate.low)}〜${man(c.premiumEstimate.high)}` : '／保険料は設計書にて'}
            </div>
            {c.peakAge != null && c.role === 'retirement' && <div className="text-xs text-slate-500">返戻率のピーク：{c.peakAge}歳ごろ</div>}
          </li>
        ))}
      </ul>
      <div>
        <div className="flex justify-between text-xs">
          <span>充足率（既存保障を含む）</span>
          <b>{p.coverageRatioMoney.value.toFixed(1)}%</b>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, p.coverageRatio * 100)}%` }} />
        </div>
      </div>
      <div className="flex justify-between text-xs">
        <span>保険料の目安（合計）</span>
        <span>{p.totalPremium ? `年 約${man(p.totalPremium)}` : '設計書にて提示'}（目安上限 {man(p.budgetCap)}）</span>
      </div>
      {p.notes.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-slate-600">
          {p.notes.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      {n && (
        <details className="text-sm">
          <summary className="cursor-pointer text-navy">提案根拠・メリット・注意点</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {n.whyThisCompany.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ol>
          <div className="mt-2 font-semibold">メリット</div>
          <ul className="list-disc pl-5">
            {n.merits.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <div className="mt-2 font-semibold">ご注意いただきたい点</div>
          <ul className="list-disc pl-5">
            {n.cautions.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <p className="mt-2 text-slate-600">{n.fitFor}</p>
        </details>
      )}
      {p.ruleHits.length > 0 && <div className="text-xs text-slate-400">適用ロジック：{p.ruleHits.join(', ')}</div>}
    </div>
  );
}

function DocsTab({ view, locked }: { view: CaseView; locked: boolean }) {
  const [type, setType] = useState<'summary' | 'design' | 'slides'>('summary');
  const reports = view.docReports;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['summary', 'サマリー型'],
            ['design', '設計書型'],
            ['slides', 'スライド'],
          ] as const
        ).map(([t, l]) => (
          <button key={t} onClick={() => setType(t)} className={cn('min-h-11 rounded-md px-3 text-sm', type === t ? 'bg-navy text-white' : 'border border-slate-300 bg-white')}>
            {l}
            {reports?.[t] && reports[t].status !== 'ok' && <span className="ml-1">⚠</span>}
          </button>
        ))}
        {type !== 'slides' && (
          <LinkButton href={`/api/cases/${view.id}/pdf?type=${type}`} variant="accent" className={cn('ml-auto', locked && 'pointer-events-none opacity-50')} download>
            PDFダウンロード
          </LinkButton>
        )}
      </div>
      {locked ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{view.status === 'blocked' ? 'コンプライアンスチェックでブロックされているため、顧客用資料は表示できません。' : '顧客提示前にマネージャーの承認が必要です。'}</p>
      ) : (
        <iframe key={type} title="資料プレビュー" src={`/api/cases/${view.id}/doc?type=${type}`} className={cn('w-full rounded-md border border-slate-200 bg-slate-200', type === 'slides' ? 'aspect-video' : 'h-[75vh]')} />
      )}
      <p className="text-xs text-slate-500">資料は明朝体（Noto Serif JP）で作成されます。表示・PDF化の直前に社名・商品名・禁止表現・必須注記を再チェックしています。</p>
    </div>
  );
}

function Feedback({ caseId, target }: { caseId: string; target: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState<1 | -1 | null>(null);
  useEffect(() => {
    setSent(null);
    setRating(null);
    setComment('');
  }, [target]);
  async function send(r: 1 | -1) {
    setRating(r);
    await fetch(`/api/cases/${caseId}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, rating: r, comment }) });
    setSent('ありがとうございます');
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
      <span className="text-slate-600">この内容はそのまま顧客に見せられますか？</span>
      <Button variant={rating === 1 ? 'primary' : 'secondary'} onClick={() => send(1)} aria-label="良い">
        👍
      </Button>
      <Button variant={rating === -1 ? 'primary' : 'secondary'} onClick={() => send(-1)} aria-label="改善が必要">
        👎
      </Button>
      <input className="min-w-40 flex-1" placeholder="コメント（任意）" value={comment} onChange={(e) => setComment(e.target.value)} />
      {sent && <span className="text-xs text-emerald-700">{sent}</span>}
    </div>
  );
}
