import { ISSUE_TAG_LABEL } from '@p3/llm';
import { htmlDoc } from './common';
import type { RenderInput, RenderOptions } from './types';
import { dateJa, h, list, man, TIER_JA } from './util';

const CSS = `
@page { size: A4 portrait; margin: 12mm; }
body { font-size:9.5pt; }
.page { width:210mm; padding:12mm 13mm; position:relative; }
@media print { .page { width:auto; padding:0; } }
.wm { position:fixed; inset:0; pointer-events:none; display:flex; align-items:center; justify-content:center; z-index:0; }
.wm span { font-size:90pt; color:rgba(200,30,30,.08); transform:rotate(-30deg); font-weight:700; letter-spacing:.2em; }
.content { position:relative; z-index:1; display:flex; flex-direction:column; gap:3mm; }
.internal { display:inline-block; border:1.5px solid #b42318; color:#b42318; padding:1px 8px; font-weight:700; border-radius:3px; }
h1 { font-size:14pt; }
h2 { font-size:11pt; border-left:4px solid var(--accent); padding-left:6px; margin-top:2mm; }
.script { background:var(--light); border-radius:4px; padding:2.5mm 3.5mm; }
.script p { margin:1mm 0; }
.label { font-size:8pt; color:var(--gray); }
td, th { font-size:8.6pt; }
`;

export function renderMemo(input: RenderInput, opts: RenderOptions): string {
  const { narrative: n, extraction: ex, calc, planSet, knowledge: k } = input;
  const t = n.talkScript;
  const money = new Map<string, string>();
  const collect = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(collect);
    const o = v as Record<string, unknown>;
    if (typeof o.calcId === 'string' && typeof o.value === 'number') money.set(o.calcId, o.unit === '万円' ? man(o.value) : `${o.value}${o.unit}`);
    else Object.values(o).forEach(collect);
  };
  collect(calc);
  collect(planSet.plans);
  const walk = t.planWalkthrough.map((w) => `<p><span class="label">${h(TIER_JA[w.tier])}</span><br>${h(w.script)}</p>`).join('');
  const objections = t.objectionHandling
    .map((o) => `<tr><td>${h(o.objection)}</td><td>${h(o.response)}${o.backedBy.length ? `<div class="label">根拠：${o.backedBy.map((b) => `${h(b)}＝${h(money.get(b) ?? '—')}`).join('、')}</div>` : ''}</td></tr>`)
    .join('');
  const issues = ex.issues.map((i) => `<tr><td>${h(ISSUE_TAG_LABEL[i.tag] ?? i.tag)}</td><td>${h(i.summary)}<div class="label">「${h(i.evidenceQuote)}」</div></td></tr>`).join('');
  const conflicts = ex.conflicts.map((c) => `${c.field}：入力 ${c.formValue ?? '—'} ／ ログ ${c.logValue ?? '—'}（「${c.quote}」）`);
  const assumptions = calc.assumptions.map((a) => `${a.label}：${a.reason}`);
  const usesVariable = planSet.plans.some((p) => p.components.some((c) => c.categoryCode === 'VARIABLE_TERM'));
  const cautions = [
    '顧客提示前に、重要事項の説明と意向把握（ご意向の確認）を実施してください。',
    '本資料の保険料・返戻率は参考値です。正式な設計書を取り寄せてから申込手続きに進んでください。',
    '節税を目的・効果として説明しないでください（通期での節税効果はありません）。',
    '他社・他商品との優劣比較はしないでください。',
    ...(usesVariable ? ['変額保険（定期型）は変額保険販売資格を持つ募集人が説明してください。運用リスク・諸費用・解約控除を漏れなく説明します。'] : []),
    ...(planSet.plans.some((p) => p.components.some((c) => c.categoryCode === 'ENDOWMENT_HALF')) ? ['養老保険（福利厚生プラン）は、原則として全従業員を対象とする普遍的加入が要件です。役員のみの加入はできません。'] : []),
  ];
  const internal =
    opts.showInternalRefs && k.internalRefs.length
      ? `<section data-internal-refs><h2>内部参照（社内限定・顧客提示禁止）</h2><table>${k.internalRefs.map((r) => `<tr><td>${h(r.categoryCode)} / ${h(r.variant)}</td><td>${h(r.internalRef)}</td></tr>`).join('')}</table></section>`
      : '';
  const scores = Object.entries(planSet.categoryScores)
    .sort((a, b) => b[1] - a[1])
    .map(([code, s]) => `${k.categories.find((c) => c.code === code)?.name ?? code}：${s}`);
  const body = `<div class="page"><div class="wm"><span>社内用</span></div><div class="content">
<div style="display:flex;justify-content:space-between;align-items:center"><div><span class="internal">社内用・顧客提示禁止</span><h1>${h(input.company.name)}様　営業向けメモ</h1></div><div class="small muted">${h(dateJa(input.generatedAt))}${input.ownerName ? `　担当：${h(input.ownerName)}` : ''}</div></div>
<h2>トークスクリプト（話す順番）</h2>
<div class="script"><p><span class="label">① オープニング</span><br>${h(t.opening)}</p><p><span class="label">② 課題の言語化</span><br>${h(t.problemFraming)}</p><p><span class="label">③ 3案の説明</span></p>${walk}<p><span class="label">④ クロージングの質問</span><br>${h(t.closingQuestion)}</p></div>
<h2>想定反論と切り返し</h2><table><tr><th>想定される反論</th><th>切り返し</th></tr>${objections}</table>
<h2>各数値の説明方法（根拠メモ）</h2>${list(n.rationaleMemo)}
<h2>商談ログから抽出した課題</h2><table>${issues || '<tr><td class="muted">抽出された課題はありません</td></tr>'}</table>
${ex.interests.length ? `<div><b>関心・価値観</b>${list(ex.interests)}</div>` : ''}
${ex.smallTalkInsights.length ? `<div><b>雑談からの示唆</b>${list(ex.smallTalkInsights)}</div>` : ''}
<h2>確認できていない情報・次回ヒアリング項目</h2>
${list([...ex.missingInfo.map((m) => `未確認：${m}`), ...assumptions.map((a) => `仮置き：${a}`), ...conflicts.map((c) => `食い違い：${c}`)]) || '<div class="muted">なし</div>'}
<h2>募集上の注意</h2>${list(cautions)}
<h2>判断ロジックの適用状況</h2>${list(planSet.ruleHits.map((r) => `${r.id} ${r.name}：${r.rationale}`))}<div class="small muted">カテゴリ評価：${h(scores.join('／'))}</div>
${internal}
<div class="small muted">抽出：${ex.source === 'llm' ? 'AI抽出' : 'ルール抽出'}／ナレッジ版 ${h(k.version)}</div>
</div></div>`;
  return htmlDoc(`${input.company.name}様 営業向けメモ（社内用）`, body, CSS, input, opts);
}
