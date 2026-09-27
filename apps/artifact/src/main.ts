/**
 * PROPOSAL-3 browser app (claude.ai Artifact build).
 * Runs the same engine / compliance / templates as the server app, entirely in the browser.
 * Capabilities: db + user (cases stored privately per viewer), downloads (PDF/HTML), sample (Claude writing).
 */
import { formatMan, type Money, type Plan, type Tier } from '@p3/engine';
import { loadSeedKnowledge } from '@p3/knowledge';
import { extractWithRules, ISSUE_TAG_LABEL, knowledgeBlock, llmConfig, SYSTEM_BASE, type NarrativeCaller } from '@p3/llm';
import { INDUSTRIES, normalizeLog, runPipeline, toRenderInput, type CaseForm, type PipelineResult } from '@p3/pipeline';
import { renderDoc, scanRendered, type DocType } from '@p3/render';
import caseA from '../../../fixtures/cases/case-a.json';
import caseB from '../../../fixtures/cases/case-b.json';
import caseC from '../../../fixtures/cases/case-c.json';

// ---------------------------------------------------------------------------
// Types & constants

interface StoredCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  form: CaseForm;
  result: PipelineResult;
  recommendedTier: Tier | null;
  sample?: boolean;
}

type View = { name: 'list' } | { name: 'new'; draft?: CaseForm } | { name: 'case'; id: string };
type Tab = 'plans' | 'docs' | 'memo' | 'calc';

const K = loadSeedKnowledge();
const OFF = llmConfig({ P3_LLM_MODE: 'off' } as unknown as NodeJS.ProcessEnv);
const FONT_CSS = "@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap');";
const SAMPLES: { id: string; title: string; form: CaseForm }[] = [caseA, caseB, caseC].map((f) => ({
  id: f.id,
  title: f.title,
  form: { company: f.company, officer: f.officer, existingPolicies: f.existingPolicies, rawLog: f.rawLog } as unknown as CaseForm,
}));
const TIER_JA: Record<Tier, string> = { MIN: '最小プラン', BALANCED: 'バランス型プラン', MAX: '最大活用型プラン' };
const CATEGORY_OPTIONS: [string, string][] = K.categories.map((c) => [c.code, c.name]);

// ---------------------------------------------------------------------------
// Utilities

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const man = (m: Money | number | null | undefined) => (m == null ? '—' : formatMan(typeof m === 'number' ? m : m.value));
const planTitle = (t: string) => t.replace(/^「(.+)」.*$/, '$1');
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** "12,000", "1億2000", "1億2千" (万円). */
function parseNum(v: string, manUnits = false): number | null {
  const t = (v ?? '').normalize('NFKC').replace(/[,\s万円]/g, '');
  if (!t) return null;
  if (manUnits && /億|千/.test(t)) {
    const m = t.match(/^(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)千)?(\d+)?$/);
    if (m) return Math.round(Number(m[1] ?? 0) * 10000 + Number(m[2] ?? 0) * 1000 + Number(m[3] ?? 0));
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Runtime capabilities (all optional)

type Cap = { use: (name: string) => Promise<unknown> };
const claudeRt = (window as unknown as { claude?: Cap }).claude;
const use = <T>(name: string): Promise<T | null> => (claudeRt?.use ? (claudeRt.use(name) as Promise<T | null>).catch(() => null) : Promise.resolve(null));

interface DbDoc {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DbRef {
  get(): Promise<DbDoc>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface DbColl {
  doc(id?: string): DbRef;
  get(): Promise<{ docs: (DbDoc & { id: string })[] }>;
}
interface Db {
  collection(path: string): DbColl;
}
type Sample = ((input: string, o?: Record<string, unknown>) => Promise<{ text: string }>) & { json: (input: string, o?: Record<string, unknown>) => Promise<unknown> };
type Downloads = { save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> };

// ---------------------------------------------------------------------------
// Storage: account (db, private per viewer) → this browser (localStorage) → memory

interface Store {
  kind: 'account' | 'browser' | 'memory';
  list(): Promise<StoredCase[]>;
  save(c: StoredCase): Promise<void>;
  remove(id: string): Promise<void>;
}

const memoryStore = (): Store => {
  const m = new Map<string, StoredCase>();
  return { kind: 'memory', list: async () => [...m.values()], save: async (c) => void m.set(c.id, c), remove: async (id) => void m.delete(id) };
};

function browserStore(): Store | null {
  const KEY = 'proposal3.cases.v1';
  try {
    localStorage.setItem('proposal3.probe', '1');
    localStorage.removeItem('proposal3.probe');
  } catch {
    return null;
  }
  const read = (): Record<string, StoredCase> => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, StoredCase>;
    } catch {
      return {};
    }
  };
  const write = (v: Record<string, StoredCase>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* quota or blocked: keep working in memory */
    }
  };
  return {
    kind: 'browser',
    list: async () => Object.values(read()),
    save: async (c) => write({ ...read(), [c.id]: c }),
    remove: async (id) => {
      const v = read();
      delete v[id];
      write(v);
    },
  };
}

function accountStore(db: Db, uid: string): Store {
  const coll = db.collection(`data/users/${uid}`);
  return {
    kind: 'account',
    list: async () => (await coll.get()).docs.filter((d) => d.exists).map((d) => d.data() as unknown as StoredCase),
    save: async (c) => coll.doc(c.id).set(clone(c) as unknown as Record<string, unknown>),
    remove: async (id) => coll.doc(id).delete(),
  };
}

// ---------------------------------------------------------------------------
// State

const state = {
  store: memoryStore() as Store,
  cases: [] as StoredCase[],
  current: null as StoredCase | null,
  view: { name: 'list' } as View,
  tab: 'plans' as Tab,
  docType: 'summary' as DocType,
  busy: null as string | null,
  aiProgress: [] as string[],
  aiAbort: null as AbortController | null,
  toast: null as string | null,
  compOpen: false,
  editing: null as string | null,
  confirmDelete: false,
  formErrors: {} as Record<string, string>,
  filled: [] as string[],
  sample: null as Sample | null,
  downloads: null as Downloads | null,
  capsReady: false,
};

const app = document.getElementById('app')!;

const toastEl = document.createElement('div');
toastEl.className = 'toast';
toastEl.setAttribute('role', 'status');
toastEl.hidden = true;
document.body.appendChild(toastEl);

/** Toasts and the busy notice live outside #app so they never re-render (and reload) the previews. */
function paintToast() {
  const msg = state.busy ?? state.toast;
  toastEl.hidden = !msg;
  toastEl.textContent = msg ?? '';
}

function flash(msg: string) {
  state.toast = msg;
  paintToast();
  setTimeout(() => {
    if (state.toast === msg) {
      state.toast = null;
      paintToast();
    }
  }, 3200);
}

// ---------------------------------------------------------------------------
// Pipeline

async function generate(form: CaseForm, opts: { reuse?: StoredCase; caller?: NarrativeCaller } = {}): Promise<PipelineResult> {
  const r = opts.reuse?.result;
  return runPipeline(form, K, {
    llm: OFF,
    fontCss: FONT_CSS,
    ...(r ? { reuse: { normalizedLog: r.normalizedLog, inputMaskHits: r.inputMaskHits, extraction: r.extraction } } : {}),
    ...(opts.caller ? { narrativeCaller: opts.caller } : {}),
  });
}

async function createCase(form: CaseForm, sample = false): Promise<StoredCase> {
  const result = await generate(form);
  const now = new Date().toISOString();
  return { id: newId(), createdAt: now, updatedAt: now, form, result, recommendedTier: null, sample };
}

async function persist(c: StoredCase) {
  c.updatedAt = new Date().toISOString();
  c.sample = false;
  try {
    await state.store.save(c);
  } catch (e) {
    const code = (e as { code?: string }).code;
    flash(code === 'quota_exceeded' ? '保存できる件数の上限に達しました。古い案件を削除してください' : '保存に失敗しました（このブラウザにのみ表示されています）');
  }
  const i = state.cases.findIndex((x) => x.id === c.id);
  if (i >= 0) state.cases[i] = c;
  else state.cases.unshift(c);
}

// ---------------------------------------------------------------------------
// Documents: render → scan (fail-closed) → preview / PDF / HTML

function docHtml(c: StoredCase, type: DocType, preview: boolean): { html: string; blocked: string[] } {
  const ri = toRenderInput(c.result, K, { recommendedTier: c.recommendedTier });
  const html = renderDoc(type, ri, { fontBase: '', fontCss: FONT_CSS, preview });
  const scan = scanRendered(type, html, ri);
  return { html, blocked: scan.status === 'blocked' ? scan.issues.map((i) => i.message) : [] };
}

type JsPdfCtor = new (o: Record<string, unknown>) => {
  addPage(format?: string, orientation?: string): void;
  addImage(data: string, fmt: string, x: number, y: number, w: number, h: number): void;
  output(t: 'blob'): Blob;
};

async function makePdf(html: string, landscape: boolean): Promise<Blob> {
  const w = window as unknown as { html2canvas?: (el: HTMLElement, o: Record<string, unknown>) => Promise<HTMLCanvasElement>; jspdf?: { jsPDF: JsPdfCtor } };
  if (!w.html2canvas || !w.jspdf) throw new Error('PDF用のライブラリを読み込めませんでした');
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${landscape ? 1123 : 794}px;height:1200px;border:0;`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((res) => {
      frame.onload = () => res();
      frame.srcdoc = html;
    });
    const doc = frame.contentDocument!;
    await doc.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));
    const pages = [...doc.querySelectorAll<HTMLElement>('.page')];
    const pdf = new w.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pw = landscape ? 297 : 210;
    const ph = landscape ? 210 : 297;
    let first = true;
    for (const page of pages) {
      page.style.margin = '0';
      page.style.boxShadow = 'none';
      const canvas = await w.html2canvas(page, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: page.scrollWidth });
      const sliceH = Math.floor((canvas.width * ph) / pw);
      for (let y = 0; y < canvas.height - 4; y += sliceH) {
        const h = Math.min(sliceH, canvas.height - y);
        const part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = h;
        part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
        first = false;
        pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, (h * pw) / canvas.width);
      }
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

const DOC_NAME: Record<DocType, string> = { summary: 'サマリー', design: '設計書型', memo: '営業メモ_社内用', slides: 'スライド' };

async function saveFile(filename: string, data: Blob | string) {
  if (state.downloads) {
    try {
      await state.downloads.save({ filename, data });
      flash('保存しました');
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return;
      if (code === 'rate_limited') return flash('保存の確認が開いています。先にそちらに答えてください');
      flash('この画面ではファイルを保存できません');
    }
    return;
  }
  // Outside a claude.ai viewer (e.g. a saved copy): a normal browser download.
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: 'text/html' }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportDoc(type: DocType, format: 'pdf' | 'html') {
  const c = state.current;
  if (!c) return;
  const { html, blocked } = docHtml(c, type, false);
  if (blocked.length) return flash('出力前チェックで問題が見つかったため保存できません');
  const base = `${c.form.company.name}_${DOC_NAME[type]}`;
  if (format === 'html') return saveFile(`${base}.html`, html);
  state.busy = 'PDFを作成しています…';
  paintToast();
  try {
    const blob = await makePdf(html, type === 'summary');
    state.busy = null;
    paintToast();
    await saveFile(`${base}.pdf`, blob);
  } catch (e) {
    state.busy = null;
    flash(`PDFを作成できませんでした：${e instanceof Error ? e.message : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Claude writing (sample capability)

async function polishWithClaude() {
  const c = state.current;
  if (!c || !state.sample) return;
  const sample = state.sample;
  const ctl = new AbortController();
  state.aiAbort = ctl;
  state.aiProgress = ['Claudeが提案文を作成しています（30〜90秒ほどかかります）'];
  render();
  let n = 0;
  const caller: NarrativeCaller = async (prompt) => {
    n++;
    if (n > 1) {
      state.aiProgress = [...state.aiProgress, `数値・表現チェックで見つかった点を直してもらっています（${n}回目）`];
      render();
    }
    const input = `${SYSTEM_BASE}\n\n${knowledgeBlock(K)}\n\n${prompt}\n\n出力は DRAFT と同じ構造の JSON オブジェクト1つだけにしてください（前後に説明文を付けない）。`;
    const data = await sample.json(input, { signal: ctl.signal, modelTier: 'default', cache: false });
    return { data };
  };
  try {
    const result = await generate(c.form, { reuse: c, caller });
    if (ctl.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    const meta = result.narrativeMeta;
    if (meta.source === 'template') {
      const msg = meta.error ?? '';
      if (/not_granted/.test(msg)) flash('Claudeの利用が許可されなかったため、定型文のままです');
      else if (/cancelled/.test(msg)) flash('中止しました');
      else flash('Claudeの文章がチェックを通らなかったため、定型文のままにしました');
      return;
    }
    c.result = result;
    await persist(c);
    flash(meta.source === 'llm' ? 'Claudeの文章に更新しました（数値・表現チェック済み）' : 'Claudeの文章に更新しました（チェックを通らなかった箇所は定型文のまま）');
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== 'cancelled') flash('Claudeの文章作成に失敗しました。時間をおいて試してください');
  } finally {
    state.aiAbort = null;
    state.aiProgress = [];
    render();
  }
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  const v = state.view;
  const nav = (name: View['name'], label: string) => `<button data-act="nav-${name}" ${v.name === name ? 'aria-current="page"' : ''}>${label}</button>`;
  const storeLabel = state.store.kind === 'account' ? '保存先：あなたのアカウント（本人のみ閲覧可）' : state.store.kind === 'browser' ? '保存先：このブラウザ' : state.capsReady ? '保存先：なし（ページを閉じると消えます）' : '';
  let body = '';
  if (v.name === 'list') body = listView();
  else if (v.name === 'new') body = formView(v.draft ?? null);
  else body = caseView();
  const active = document.activeElement as HTMLElement | null;
  const focusId = active?.id;
  app.innerHTML = `
<header class="bar"><div class="bar-in">
  <div class="brand"><b>PROPOSAL-3</b><span>法人保険 即時提案</span></div>
  <nav class="nav">${nav('list', '案件一覧')}${nav('new', '＋ 新規作成')}</nav>
  ${storeLabel ? `<div class="store">${storeLabel}</div>` : ''}
</div></header>
<main class="wrap">${body}</main>`;
  paintToast();
  if (focusId) document.getElementById(focusId)?.focus();
  mountFrames();
}

function listView(): string {
  const items = [...state.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const list = items.length
    ? `<ul class="cases">${items
        .map((c) => {
          const cv = c.result.calc.coverage;
          const st = c.result.compliance.status === 'blocked' ? '<span class="chip bad">ブロック</span>' : '<span class="chip ok">作成済み</span>';
          return `<li><button data-act="open" data-id="${c.id}"><span class="name">${st}${esc(c.form.company.name)}</span><span class="xs muted">${new Date(c.updatedAt).toLocaleString('ja-JP')} ／ 必要保障額 ${man(cv.required)}・不足額 ${man(cv.gap)}</span></button></li>`;
        })
        .join('')}</ul>`
    : `<div class="card"><p style="margin:0">まだ案件がありません。サンプルの架空企業で試すか、「＋ 新規作成」から始めてください。</p><div class="samples" style="margin-top:10px">${SAMPLES.map((s) => `<button data-act="demo" data-id="${s.id}">${esc(s.title)}</button>`).join('')}</div></div>`;
  return `<div class="row" style="justify-content:space-between"><h1 style="font-size:20px">案件一覧</h1><button class="btn brass" data-act="nav-new">＋ 新規作成</button></div>
${list}
<p class="xs muted">商談ログと企業情報から、根拠付きの3パターン提案（最小／バランス／最大活用）と顧客提示用の資料を作成します。保険料は開発用サンプル料率による概算で、実在の商品の保険料ではありません。</p>`;
}

// --- Form -------------------------------------------------------------------

function formView(draft: CaseForm | null): string {
  const c = (draft?.company ?? {}) as unknown as Record<string, unknown>;
  const o = (draft?.officer ?? {}) as unknown as Record<string, unknown>;
  const val = (x: unknown) => (x == null ? '' : esc(x));
  const err = (k: string) => (state.formErrors[k] ? `<span class="err-text">${esc(state.formErrors[k])}</span>` : '');
  const num = (sec: 'company' | 'officer', key: string, label: string, unit: string, req = false) => {
    const src = sec === 'company' ? c : o;
    const filled = state.filled.includes(key);
    return `<div class="field"><label for="f-${sec}-${key}">${label}${req ? '<span class="req">*</span>' : ''}${filled ? '<span class="chip warn">ログから補完</span>' : ''}</label>
<div class="unit"><input id="f-${sec}-${key}" name="${sec}.${key}" inputmode="decimal" value="${val(src[key])}" class="${filled ? 'filled' : ''} ${state.formErrors[`${sec}.${key}`] ? 'err' : ''}"><span>${unit}</span></div>${err(`${sec}.${key}`)}</div>`;
  };
  const policies = (draft?.existingPolicies ?? [])
    .map(
      (p, i) => `<div class="policy" data-policy="${i}">
<select name="p.category" aria-label="保険の種類">${CATEGORY_OPTIONS.map(([v, l]) => `<option value="${v}" ${p.category === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
<input name="p.deathBenefit" inputmode="decimal" placeholder="保障額（万円）" aria-label="保障額（万円）" value="${val(p.deathBenefit)}">
<input name="p.peakYear" inputmode="numeric" placeholder="返戻率ピーク（経過年）" aria-label="返戻率ピーク（経過年）" value="${val(p.peakYear)}">
<button class="btn ghost danger" data-act="del-policy" data-i="${i}" aria-label="削除">✕</button>
<input type="hidden" name="p.issueAge" value="${val(p.issueAge)}"><input type="hidden" name="p.purpose" value="${val(p.purpose)}"></div>`,
    )
    .join('');
  return `<form id="caseform" novalidate>
<div class="row" style="justify-content:space-between"><h1 style="font-size:20px">新規案件</h1></div>
<div class="samples"><span class="xs muted">サンプル：</span>${SAMPLES.map((s) => `<button type="button" data-act="load-sample" data-id="${s.id}">${esc(s.title)}</button>`).join('')}</div>
<section class="card"><h2>商談ログ</h2>
<textarea id="f-log" name="rawLog" placeholder="議事録・文字起こしを貼り付けてください&#10;例）社長：銀行から1億2千万借りてて、俺が連帯保証してる。">${esc(draft?.rawLog ?? '')}</textarea>
<div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="fill-from-log">ログから空欄を補完</button>
<label class="btn" for="f-file">ファイルから読み込む</label><input id="f-file" type="file" accept=".txt,.md,.vtt,.srt" hidden></div>
<p class="hint">社名・商品名は自動で伏せ字にしてから処理します。対応形式：txt / md / vtt / srt</p></section>
<section class="card"><h2>企業情報</h2><div class="grid2">
<div class="field"><label for="f-company-name">会社名<span class="req">*</span></label><input id="f-company-name" name="company.name" value="${val(c.name)}" class="${state.formErrors['company.name'] ? 'err' : ''}">${err('company.name')}</div>
<div class="field"><label for="f-company-industry">業種</label><select id="f-company-industry" name="company.industry">${INDUSTRIES.map((i) => `<option value="${i.code}" ${c.industry === i.code ? 'selected' : ''}>${i.label}</option>`).join('')}</select></div>
${num('company', 'revenue', '年商', '万円', true)}${num('company', 'loanTotal', '借入金残高（合計）', '万円', true)}${num('company', 'employeeCount', '従業員数', '名', true)}
</div></section>
<section class="card"><h2>代表者（被保険者）</h2><div class="grid2">
<div class="field"><label for="f-officer-role">役位</label><select id="f-officer-role" name="officer.role">${['社長', '会長', '専務', '常務', '取締役'].map((r) => `<option ${o.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
<div class="field"><label for="f-officer-sex">性別</label><select id="f-officer-sex" name="officer.sex"><option value="M" ${o.sex !== 'F' ? 'selected' : ''}>男性</option><option value="F" ${o.sex === 'F' ? 'selected' : ''}>女性</option></select></div>
${num('officer', 'age', '年齢', '歳', true)}${num('officer', 'monthlyPay', '役員報酬月額', '万円', true)}${num('officer', 'tenureYears', '役員在任年数', '年', true)}${num('officer', 'plannedRetireAge', '勇退予定年齢', '歳')}
</div></section>
<details class="card" ${draft ? 'open' : ''}><summary>詳しい情報（任意・分かる範囲で）</summary><div class="grid2" style="margin-top:10px">
${num('company', 'ordinaryProfit', '経常利益', '万円')}${num('company', 'netAssets', '純資産', '万円')}${num('company', 'loanShortTerm', '一括返済が必要になり得る借入金・営業債務', '万円')}${num('company', 'loanMonthlyRepay', '月々の借入返済額', '万円')}
${num('company', 'monthlyLabor', '月間人件費', '万円')}${num('company', 'monthlyFixed', '月間その他固定費', '万円')}${num('officer', 'legalHeirs', '法定相続人数', '人')}
<label class="row small"><input type="checkbox" name="officer.guaranteesLoan" ${o.guaranteesLoan ? 'checked' : ''} style="width:20px;height:20px"> 代表者が会社借入の連帯保証人</label>
</div></details>
<section class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">既存の保険</h2><button type="button" class="btn ghost" data-act="add-policy">＋ 追加</button></div>
<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${policies || '<p class="small muted" style="margin:0">なし（分からなければ空欄で構いません）</p>'}</div></section>
<div class="stickyfoot"><button type="submit" class="btn brass" ${state.busy ? 'disabled' : ''}>${state.busy ? '作成中…' : '3案を作成'}</button></div>
</form>`;
}

/** Read the form into a CaseForm (keeps the current draft in the view so re-renders don't lose input). */
function readForm(): CaseForm {
  const f = document.getElementById('caseform') as HTMLFormElement;
  const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
  const policies = [...f.querySelectorAll<HTMLElement>('[data-policy]')].map((row) => {
    const q = (n: string) => (row.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? '';
    return { category: q('p.category'), deathBenefit: parseNum(q('p.deathBenefit'), true), peakYear: parseNum(q('p.peakYear')), issueAge: parseNum(q('p.issueAge')), purpose: q('p.purpose') || null, annualPremium: null, maturityAge: null, peakReturnRate: null, note: null };
  });
  return {
    company: {
      name: get('company.name').trim(),
      industry: get('company.industry') || 'other',
      revenue: parseNum(get('company.revenue'), true) as number,
      ordinaryProfit: parseNum(get('company.ordinaryProfit'), true),
      netAssets: parseNum(get('company.netAssets'), true),
      loanTotal: parseNum(get('company.loanTotal'), true) as number,
      loanShortTerm: parseNum(get('company.loanShortTerm'), true),
      loanMonthlyRepay: parseNum(get('company.loanMonthlyRepay'), true),
      monthlyLabor: parseNum(get('company.monthlyLabor'), true),
      monthlyFixed: parseNum(get('company.monthlyFixed'), true),
      employeeCount: parseNum(get('company.employeeCount')) as number,
    },
    officer: {
      role: (get('officer.role') || '社長') as CaseForm['officer']['role'],
      sex: (get('officer.sex') || 'M') as 'M' | 'F',
      age: parseNum(get('officer.age')) as number,
      monthlyPay: parseNum(get('officer.monthlyPay'), true) as number,
      tenureYears: parseNum(get('officer.tenureYears')) as number,
      plannedRetireAge: parseNum(get('officer.plannedRetireAge')),
      legalHeirs: parseNum(get('officer.legalHeirs')),
      guaranteesLoan: (f.elements.namedItem('officer.guaranteesLoan') as HTMLInputElement | null)?.checked ?? false,
    },
    existingPolicies: policies,
    rawLog: get('rawLog'),
  };
}

function validate(f: CaseForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.company.name) e['company.name'] = '会社名を入力してください';
  if (!(f.company.revenue > 0)) e['company.revenue'] = '年商を入力してください';
  if (f.company.loanTotal == null || f.company.loanTotal < 0) e['company.loanTotal'] = '借入金を入力してください（なければ0）';
  if (f.company.employeeCount == null || f.company.employeeCount < 0) e['company.employeeCount'] = '従業員数を入力してください';
  if (!(f.officer.age >= 18 && f.officer.age <= 100)) e['officer.age'] = '年齢を入力してください';
  if (!(f.officer.monthlyPay > 0)) e['officer.monthlyPay'] = '役員報酬月額を入力してください';
  if (f.officer.tenureYears == null || f.officer.tenureYears < 0) e['officer.tenureYears'] = '在任年数を入力してください';
  return e;
}

function fillFromLog(text?: string) {
  const form = readForm();
  const log = text ?? form.rawLog;
  if (!log.trim()) return;
  const norm = normalizeLog(log, K.maskingTerms);
  const ex = extractWithRules(norm.text, { company: {}, officer: form.officer.age ? { age: form.officer.age } : {}, existingPolicies: [] });
  const got: string[] = [];
  const c = form.company as unknown as Record<string, unknown>;
  for (const k of ['revenue', 'ordinaryProfit', 'netAssets', 'loanTotal', 'loanShortTerm', 'loanMonthlyRepay', 'monthlyLabor', 'monthlyFixed', 'employeeCount'] as const) {
    if ((c[k] == null || c[k] === '') && ex.companyFacts[k] != null) {
      c[k] = ex.companyFacts[k];
      got.push(k);
    }
  }
  const o = form.officer as unknown as Record<string, unknown>;
  for (const [fk, ok] of [['ceoAge', 'age'], ['monthlyPay', 'monthlyPay'], ['tenureYears', 'tenureYears'], ['plannedRetireAge', 'plannedRetireAge'], ['legalHeirs', 'legalHeirs']] as const) {
    if (o[ok] == null && ex.companyFacts[fk] != null) {
      o[ok] = ex.companyFacts[fk];
      got.push(ok);
    }
  }
  if (form.existingPolicies.length === 0 && ex.existingPolicies.length) {
    form.existingPolicies = ex.existingPolicies.filter((p) => p.deathBenefit != null).map((p) => ({ category: p.categoryGuess, deathBenefit: p.deathBenefit, note: null }));
  }
  form.rawLog = log;
  state.filled = got;
  state.view = { name: 'new', draft: form };
  render();
  flash(got.length ? `商談ログから ${got.length} 項目を補完しました（黄色の項目を確認してください）` : '補完できる数値は見つかりませんでした');
}

// --- Case view -----------------------------------------------------------------

function caseView(): string {
  const c = state.current;
  if (!c) return listView();
  const r = c.result;
  const comp = r.compliance;
  const blocked = comp.status === 'blocked';
  const src = r.narrativeMeta.source === 'llm' ? 'AI（Claude）' : r.narrativeMeta.source === 'mixed' ? 'AI＋定型文' : '定型文';
  const sampleFlag = c.sample
    ? `<div class="sample-flag"><span>サンプル（架空企業）です。まだ保存されていません。</span><button class="btn" data-act="save-sample">この案件を保存</button></div>`
    : '';
  const aiBox = state.aiProgress.length
    ? `<div class="ai" role="status"><div class="progress">${state.aiProgress.map((p, i) => `<div class="s"><span class="dot ${i === state.aiProgress.length - 1 ? 'run' : 'done'}">${i === state.aiProgress.length - 1 ? '…' : '✓'}</span>${esc(p)}</div>`).join('')}</div><div class="row" style="margin-top:8px"><button class="btn" data-act="ai-stop">中止</button></div></div>`
    : '';
  const del = state.confirmDelete
    ? `<div class="confirm">この案件を削除します。元に戻せません。<button class="btn danger" data-act="delete-yes">削除する</button><button class="btn" data-act="delete-no">やめる</button></div>`
    : '';
  const tabs: [Tab, string][] = [
    ['plans', '3案比較'],
    ['docs', '顧客用資料'],
    ['memo', 'トーク・根拠メモ'],
    ['calc', '計算の内訳'],
  ];
  let content = '';
  if (state.tab === 'plans') content = plansTab(c);
  else if (state.tab === 'docs') content = docsTab(c, blocked);
  else if (state.tab === 'memo') content = memoTab(c);
  else content = calcTab(c);
  return `${sampleFlag}
<div class="head"><div><h1>${esc(c.form.company.name)}</h1><div class="meta">${new Date(r.generatedAt).toLocaleString('ja-JP')} 作成 ／ 文章：${src} ／ ナレッジ版 ${esc(r.metrics.knowledgeVersion)}</div></div>
<div class="row">
<button class="btn brass" data-act="pdf" data-type="summary" ${blocked ? 'disabled' : ''}>PDF（サマリー）を保存</button>
<button class="btn" data-act="present" ${blocked ? 'disabled' : ''}>スライドで見せる</button>
${state.sample ? `<button class="btn" data-act="ai" ${state.aiProgress.length ? 'disabled' : ''} title="あなたのClaudeの利用枠を使います">Claudeで文章を磨く</button>` : ''}
</div></div>
${aiBox}
${compBar(comp)}
${assumePanel(c)}
<div class="tabs" role="tablist">${tabs.map(([t, l]) => `<button role="tab" data-act="tab" data-tab="${t}" aria-selected="${state.tab === t}">${l}</button>`).join('')}</div>
${content}
<div class="row" style="justify-content:space-between;margin-top:8px"><button class="btn ghost" data-act="nav-list">← 案件一覧へ</button><div class="row"><button class="btn" data-act="duplicate">複製して新規作成</button>${c.sample ? '' : '<button class="btn danger" data-act="delete">削除</button>'}</div></div>
${del}`;
}

function compBar(comp: PipelineResult['compliance']): string {
  const label = comp.status === 'ok' ? 'コンプラチェック OK' : comp.status === 'warning' ? 'コンプラチェック 要確認' : 'コンプラチェック ブロック（資料は出力できません）';
  const list = state.compOpen && comp.issues.length ? `<ul>${comp.issues.map((i) => `<li><b>${i.severity === 'error' ? 'エラー' : '警告'}</b> ${esc(i.message)}${i.suggestion ? ` → ${esc(i.suggestion)}` : ''}</li>`).join('')}</ul>` : '';
  return `<div class="comp ${comp.status}"><button data-act="comp-toggle" ${comp.issues.length ? '' : 'disabled'}><b>${label}</b><span class="xs">社名・商品名 ${comp.counts.masking}／禁止表現 ${comp.counts.banned}／数値 ${comp.counts.grounding}／注記 ${comp.counts.disclaimer}</span></button>${list}</div>`;
}

const EDITABLE: Record<string, 'company' | 'officer'> = {
  monthlyLabor: 'company',
  monthlyFixed: 'company',
  loanMonthlyRepay: 'company',
  loanShortTerm: 'company',
  ordinaryProfit: 'company',
  netAssets: 'company',
  plannedRetireAge: 'officer',
  legalHeirs: 'officer',
};

function assumePanel(c: StoredCase): string {
  const items = c.result.calc.assumptions.filter((a) => EDITABLE[a.field]);
  if (!items.length) return '';
  const ed = items.find((a) => a.field === state.editing);
  return `<div class="assume"><b class="small">仮置きの値があります。タップして修正すると計算からやり直します。</b>
<div class="items">${items.map((a) => `<button data-act="edit-assume" data-field="${a.field}"><b>${esc(a.label)}</b>：${a.unit === '万円' ? man(a.value) : `${a.value}${a.unit}`} <span class="chip warn">仮置き</span></button>`).join('')}</div>
${ed ? `<div class="row" style="margin-top:8px;align-items:flex-end"><div class="field"><label for="assume-val">${esc(ed.label)}（${ed.unit}）</label><input id="assume-val" inputmode="decimal" value="${ed.value}"></div><button class="btn primary" data-act="assume-save">確定して再計算</button><button class="btn ghost" data-act="assume-cancel">やめる</button><p class="xs muted" style="width:100%;margin:0">${esc(ed.reason)}</p></div>` : ''}</div>`;
}

function plansTab(c: StoredCase): string {
  const r = c.result;
  const cv = r.calc.coverage;
  const kpi = (l: string, m: Money, strong = false) => `<div class="kpi ${strong ? 'strong' : ''}"><div class="l">${l}</div><div class="v">${man(m)}</div>${m.assumed ? '<span class="chip warn">仮置き</span>' : ''}</div>`;
  const plans = c.recommendedTier ? [...r.planSet.plans].sort((a, b) => (a.tier === c.recommendedTier ? -1 : b.tier === c.recommendedTier ? 1 : 0)) : r.planSet.plans;
  return `<div class="kpis">${kpi('必要保障額', cv.required)}${kpi('既存の保障', cv.existing)}${kpi('不足額', cv.gap, true)}${kpi('勇退退職金（物価考慮）', r.calc.retirement.inflationAdjusted)}</div>
<div class="plans">${plans.map((p) => planCard(c, p)).join('')}</div>`;
}

function planCard(c: StoredCase, p: Plan): string {
  const n = c.result.narrative.plans.find((x) => x.tier === p.tier);
  const rec = c.recommendedTier === p.tier;
  const comps = p.components
    .map(
      (x) => `<li><div class="t"><span>${esc(x.label)}</span><b>${man(x.deathBenefit)}</b></div><div class="xs muted">${esc(x.purpose)}／${x.categoryCode === 'WHOLE_LIFE' ? '終身' : `${x.termToAge}歳まで`}${x.premiumEstimate !== 'DESIGN_SHEET_REQUIRED' ? `／年 約${man(x.premiumEstimate.low)}〜${man(x.premiumEstimate.high)}` : '／保険料は設計書にて'}</div>${x.peakAge != null && x.role === 'retirement' ? `<div class="xs muted">返戻率のピーク：${x.peakAge}歳ごろ</div>` : ''}</li>`,
    )
    .join('');
  return `<article class="plan ${rec ? 'rec' : ''}">
<div class="tier"><span>${TIER_JA[p.tier]}</span><button class="rec-btn" data-act="rec" data-tier="${p.tier}" aria-pressed="${rec}">${rec ? '★ 推し' : '☆ 推しにする'}</button></div>
<h3>${esc(planTitle(p.title))}</h3>${n ? `<div class="headline">${esc(n.headline)}</div>` : ''}
<ul class="comps">${comps}</ul>
<div class="kv"><span>充足率（既存保障を含む）</span><b>${p.coverageRatioMoney.value.toFixed(1)}%</b></div><div class="meter"><i style="width:${Math.min(100, p.coverageRatio * 100).toFixed(1)}%"></i></div>
<div class="kv"><span>保険料の目安（合計）</span><b>${p.totalPremium ? `年 約${man(p.totalPremium)}` : '設計書にて提示'}</b></div>
${p.notes.length ? `<ul class="notes">${p.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${n ? `<details><summary>提案根拠・メリット・注意点</summary><ol>${n.whyThisCompany.map((w) => `<li>${esc(w)}</li>`).join('')}</ol><b>メリット</b><ul>${n.merits.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><b>ご注意いただきたい点</b><ul>${n.cautions.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="muted">${esc(n.fitFor)}</p></details>` : ''}
</article>`;
}

function docsTab(c: StoredCase, blocked: boolean): string {
  const t = state.docType;
  const types: [DocType, string][] = [
    ['summary', 'サマリー型'],
    ['design', '設計書型'],
    ['slides', 'スライド'],
  ];
  if (blocked) return `<div class="note bad">コンプライアンスチェックでブロックされているため、顧客用資料は表示できません。</div>`;
  const exportBtns =
    t === 'slides'
      ? `<button class="btn" data-act="fullscreen">全画面で表示</button><button class="btn" data-act="html" data-type="slides">HTMLを保存</button>`
      : `<button class="btn brass" data-act="pdf" data-type="${t}" ${state.busy ? 'disabled' : ''}>PDFを保存</button><button class="btn" data-act="html" data-type="${t}">HTMLを保存</button>`;
  void c;
  return `<div class="row" style="justify-content:space-between"><div class="seg" role="group" aria-label="資料の種類">${types.map(([v, l]) => `<button data-act="doctype" data-type="${v}" aria-pressed="${t === v}">${l}</button>`).join('')}</div><div class="row">${exportBtns}</div></div>
<div class="slidebox" id="slidebox"><iframe class="docframe ${t === 'slides' ? 'slides' : ''}" title="資料プレビュー" data-doc="${t}"></iframe></div>
<p class="xs muted">資料は明朝体で作成されます。表示と保存の直前に、社名・商品名・禁止表現・必須注記を再チェックしています。スライドは矢印キーまたはスワイプで送れます。</p>`;
}

function memoTab(c: StoredCase): string {
  const n = c.result.narrative;
  const t = n.talkScript;
  const ex = c.result.extraction;
  return `<div class="internal">社内用：このタブの内容は顧客に見せないでください</div>
<section class="card"><h2>トークスクリプト（話す順番）</h2><ol class="script small" style="padding-left:20px;margin:0">
<li><span class="label">オープニング</span><div>${esc(t.opening)}</div></li>
<li><span class="label">課題の言語化</span><div>${esc(t.problemFraming)}</div></li>
<li><span class="label">3案の説明</span>${t.planWalkthrough.map((w) => `<div style="margin-top:4px"><b style="color:var(--brass)">${TIER_JA[w.tier]}：</b>${esc(w.script)}</div>`).join('')}</li>
<li><span class="label">クロージングの質問</span><div><b>${esc(t.closingQuestion)}</b></div></li></ol></section>
<section class="card"><h2>想定反論と切り返し</h2>${t.objectionHandling.map((o) => `<p class="small" style="margin:0 0 8px"><b>「${esc(o.objection)}」</b><br>→ ${esc(o.response)}</p>`).join('')}</section>
<section class="card"><h2>根拠メモ（数値の説明方法）</h2><ul class="small" style="margin:0;padding-left:20px">${n.rationaleMemo.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>
<section class="card"><h2>商談ログから読み取った内容</h2><ul class="small" style="margin:0;padding-left:20px">${ex.issues.map((i) => `<li><span class="chip brass">${esc(ISSUE_TAG_LABEL[i.tag] ?? i.tag)}</span> ${esc(i.summary)}<div class="xs muted">「${esc(i.evidenceQuote)}」</div></li>`).join('') || '<li class="muted">抽出された課題はありません</li>'}</ul>
${ex.objections.length ? `<p class="small">懸念：${esc(ex.objections.join('／'))}</p>` : ''}
${ex.missingInfo.length || ex.conflicts.length ? `<div class="note warn">${ex.missingInfo.length ? `次回ヒアリング：${esc(ex.missingInfo.join('、'))}<br>` : ''}${ex.conflicts.map((x) => `入力とログの食い違い：${esc(x.field)}（入力 ${x.formValue ?? '—'}／ログ ${x.logValue ?? '—'}）`).join('<br>')}</div>` : ''}
${c.result.inputMaskHits.length ? `<p class="xs muted">伏せ字にした語：${esc(c.result.inputMaskHits.map((h) => h.match).join('、'))}</p>` : ''}</section>
<div class="row"><button class="btn" data-act="pdf" data-type="memo" ${state.busy ? 'disabled' : ''}>営業メモをPDFで保存</button><button class="btn" data-act="html" data-type="memo">営業メモをHTMLで保存</button></div>`;
}

function calcTab(c: StoredCase): string {
  const k = c.result.calc;
  const cv = k.coverage;
  const rt = k.retirement;
  const row = (label: string, m: Money, strong = false) =>
    `<tr class="${strong ? 'strong' : ''}"><td>${esc(label)}<div class="f">${esc(m.formula)}</div></td><td class="num">${m.unit === '万円' ? man(m) : `${m.value}${m.unit}`}${m.assumed ? ' <span class="chip warn">仮置き</span>' : ''}</td></tr>`;
  const table = (title: string, rows: string) => `<section class="card"><h2>${title}</h2><div class="tbl-wrap"><table class="calc"><tbody>${rows}</tbody></table></div></section>`;
  return `<div class="grid2">
${table('事業保障資金（2方式）', row(`運転資金方式${cv.adopted === 'B' ? '（採用）' : ''}`, cv.methodB, cv.adopted === 'B') + row('　当面の運転資金', cv.methodBParts.workingCapital) + row('　借入金の返済資金', cv.methodBParts.repayment) + row('　一括返済が必要な借入金等', cv.methodBParts.lumpSum) + row(`積上げ方式${cv.adopted === 'A' ? '（採用）' : ''}`, cv.methodA, cv.adopted === 'A') + row('　借入金相当額', cv.methodAParts.loan) + row('　経営立て直し資金', cv.methodAParts.rebuild) + row('　納税準備資金', cv.methodAParts.taxReserve))}
${table('必要保障額と不足額', row('事業保障資金', cv.businessFund) + row('死亡退職金', cv.deathRetirement) + row('弔慰金', cv.condolence) + row('必要保障額', cv.required, true) + row('既存の保障', cv.existing) + row('不足額', cv.gap, true) + row('死亡退職金の相続税非課税枠', cv.inheritanceExempt))}
${table('勇退退職金', row('勇退までの年数', rt.yearsToRetire) + row('勇退退職金の目安', rt.target, true) + row('物価上昇を考慮した額', rt.inflationAdjusted) + row('退職所得控除', rt.deduction) + row('課税退職所得', rt.taxable) + row('受取方法による個人の税負担の差', rt.netVsSalary))}
${table('保険料予算の目安（年額・上限）', row('最小プラン', k.budget.min) + row('バランス型プラン', k.budget.balanced) + row('最大活用型プラン', k.budget.max))}
</div>
<section class="card"><h2>適用した判断ロジック</h2><ul class="small" style="margin:0;padding-left:20px">${c.result.planSet.ruleHits.map((h) => `<li><span class="chip navy">${h.id}</span> ${esc(h.name)}：${esc(h.rationale)}</li>`).join('') || '<li class="muted">該当なし</li>'}</ul>
${c.result.planSet.memoPoints.length ? `<div class="note warn" style="margin-top:8px">${esc(c.result.planSet.memoPoints.join(' '))}</div>` : ''}</section>`;
}

/** Inject document HTML into preview iframes after each render (srcdoc keeps scripts working). */
function mountFrames() {
  const c = state.current;
  if (!c) return;
  for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe[data-doc]')) {
    const type = f.dataset.doc as DocType;
    const { html, blocked } = docHtml(c, type, type !== 'slides');
    f.srcdoc = blocked.length
      ? `<p style="font-family:sans-serif;color:#9b1c1c;padding:16px">出力前チェックで問題が見つかったため表示をブロックしました：${blocked.map(esc).join(' / ')}</p>`
      : html;
  }
}

// ---------------------------------------------------------------------------
// Events

function openCase(c: StoredCase) {
  state.current = c;
  state.view = { name: 'case', id: c.id };
  state.tab = 'plans';
  state.editing = null;
  state.confirmDelete = false;
  state.compOpen = false;
  render();
  window.scrollTo(0, 0);
}

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = readForm();
  const errs = validate(form);
  state.formErrors = errs;
  if (Object.keys(errs).length) {
    state.view = { name: 'new', draft: form };
    render();
    flash('必須項目を入力してください');
    return;
  }
  state.busy = '3案を作成しています…';
  state.view = { name: 'new', draft: form };
  render();
  try {
    const c = await createCase(form);
    await persist(c);
    state.busy = null;
    state.filled = [];
    openCase(c);
  } catch (err) {
    state.busy = null;
    render();
    flash(`作成できませんでした：${err instanceof Error ? err.message : ''}`);
  }
});

app.addEventListener('paste', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'f-log') return;
  const text = e.clipboardData?.getData('text');
  if (text) setTimeout(() => fillFromLog(), 0);
});

app.addEventListener('change', async (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'f-file' || !t.files?.[0]) return;
  const file = t.files[0];
  const raw = await file.text();
  const text = /\.(vtt|srt)$/i.test(file.name) ? raw.replace(/^WEBVTT.*$/m, '').split(/\r?\n/).filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l)).join('\n') : raw;
  (document.getElementById('f-log') as HTMLTextAreaElement).value = text;
  fillFromLog(text);
});

app.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const act = el.dataset.act!;
  const c = state.current;
  switch (act) {
    case 'nav-list':
      state.view = { name: 'list' };
      return render();
    case 'nav-new':
      state.view = { name: 'new' };
      state.formErrors = {};
      state.filled = [];
      return render();
    case 'open': {
      const found = state.cases.find((x) => x.id === el.dataset.id);
      if (found) openCase(found);
      return;
    }
    case 'demo': {
      const s = SAMPLES.find((x) => x.id === el.dataset.id);
      if (s) openCase(await createCase(clone(s.form), true));
      return;
    }
    case 'load-sample': {
      const s = SAMPLES.find((x) => x.id === el.dataset.id);
      if (!s) return;
      state.filled = [];
      state.formErrors = {};
      state.view = { name: 'new', draft: clone(s.form) };
      return render();
    }
    case 'fill-from-log':
      return fillFromLog();
    case 'add-policy': {
      const form = readForm();
      form.existingPolicies.push({ category: 'TERM_LOW_CV', deathBenefit: null });
      state.view = { name: 'new', draft: form };
      return render();
    }
    case 'del-policy': {
      const form = readForm();
      form.existingPolicies.splice(Number(el.dataset.i), 1);
      state.view = { name: 'new', draft: form };
      return render();
    }
    case 'tab':
      state.tab = el.dataset.tab as Tab;
      return render();
    case 'doctype':
      state.docType = el.dataset.type as DocType;
      return render();
    case 'comp-toggle':
      state.compOpen = !state.compOpen;
      return render();
    case 'rec':
      if (!c) return;
      c.recommendedTier = c.recommendedTier === el.dataset.tier ? null : (el.dataset.tier as Tier);
      render();
      if (!c.sample) await persist(c);
      return;
    case 'pdf':
      if (state.busy) return;
      return exportDoc(el.dataset.type as DocType, 'pdf');
    case 'html':
      return exportDoc(el.dataset.type as DocType, 'html');
    case 'present':
      state.tab = 'docs';
      state.docType = 'slides';
      render();
      document.getElementById('slidebox')?.requestFullscreen?.().catch(() => flash('全画面にできない環境です。スライドはこの画面でそのまま操作できます'));
      return;
    case 'fullscreen':
      document.getElementById('slidebox')?.requestFullscreen?.().catch(() => flash('全画面にできない環境です'));
      return;
    case 'ai':
      return polishWithClaude();
    case 'ai-stop':
      state.aiAbort?.abort();
      return;
    case 'save-sample':
      if (!c) return;
      await persist(c);
      render();
      return flash('保存しました');
    case 'duplicate':
      if (!c) return;
      state.view = { name: 'new', draft: { ...clone(c.form), rawLog: '' } };
      state.filled = [];
      state.formErrors = {};
      render();
      return window.scrollTo(0, 0);
    case 'delete':
      state.confirmDelete = true;
      return render();
    case 'delete-no':
      state.confirmDelete = false;
      return render();
    case 'delete-yes':
      if (!c) return;
      try {
        await state.store.remove(c.id);
      } catch {
        return flash('削除できませんでした');
      }
      state.cases = state.cases.filter((x) => x.id !== c.id);
      state.current = null;
      state.view = { name: 'list' };
      render();
      return flash('削除しました');
    case 'edit-assume':
      state.editing = el.dataset.field ?? null;
      render();
      document.getElementById('assume-val')?.focus();
      return;
    case 'assume-cancel':
      state.editing = null;
      return render();
    case 'assume-save': {
      if (!c || !state.editing) return;
      const raw = (document.getElementById('assume-val') as HTMLInputElement).value;
      const n = raw.trim() === '' ? null : parseNum(raw);
      if (raw.trim() !== '' && n == null) return flash('数値を入力してください');
      const form = clone(c.form);
      const sec = EDITABLE[state.editing]!;
      (form[sec] as unknown as Record<string, unknown>)[state.editing] = n;
      const t0 = performance.now();
      c.form = form;
      c.result = await generate(form, { reuse: c });
      state.editing = null;
      if (!c.sample) await persist(c);
      render();
      return flash(`再計算しました（${((performance.now() - t0) / 1000).toFixed(1)}秒）`);
    }
  }
});

// ---------------------------------------------------------------------------
// Boot: show a working sample immediately, then light up storage and capabilities.

async function boot() {
  openCase(await createCase(clone(SAMPLES[0]!.form), true));
  const [db, user, downloads, sample] = await Promise.all([use<Db>('db'), use<{ id(): Promise<string | null> }>('user'), use<Downloads>('downloads'), use<Sample>('sample')]);
  state.downloads = downloads;
  state.sample = sample;
  const uid = user ? await user.id().catch(() => null) : null;
  if (db && uid) state.store = accountStore(db, uid);
  else state.store = browserStore() ?? memoryStore();
  state.capsReady = true;
  try {
    state.cases = await state.store.list();
  } catch {
    state.store = browserStore() ?? memoryStore();
    state.cases = await state.store.list();
  }
  if (state.cases.length && state.current?.sample) {
    state.view = { name: 'list' };
    state.current = null;
  }
  render();
}

void boot();
