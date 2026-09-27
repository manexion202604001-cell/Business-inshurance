import type { Plan, PlanComponent } from '@p3/engine';
import type { PlanNarrative } from '@p3/llm';
import { coverageChart, ratioMeter } from './charts';
import { documentDisclaimers, htmlDoc } from './common';
import { asOfLabel } from '@p3/knowledge';
import type { RenderInput, RenderOptions } from './types';
import { dateJa, h, man, ordered, TIER_JA, withAssumed } from './util';

const CSS = `
@page { size: A4 landscape; margin: 0; }
.page { width:297mm; height:210mm; padding:7mm 10mm 5mm; display:flex; flex-direction:column; gap:2.6mm; }
.head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--navy); padding-bottom:2mm; }
.head h1 { font-size:16pt; letter-spacing:.02em; }
.lead { font-size:8.6pt; color:var(--gray); margin-top:1mm; }
.row1 { display:grid; grid-template-columns: 29% 37% 34%; gap:3.5mm; height:58mm; }
.row1 > * { min-height:0; overflow:hidden; }
.status td, .status th { font-size:7.9pt; padding:2px 4px; }
.disc-inline { font-size:6.1pt; line-height:1.4; color:#3b4250; border-top:1px solid var(--line); padding-top:1.2mm; }
.keynums { display:grid; grid-template-columns:1fr 1fr; gap:2mm; margin-bottom:2mm; }
.keynum { background:var(--light); border-radius:4px; padding:2mm; text-align:center; }
.keynum .v { font-size:12.5pt; color:var(--navy); font-weight:700; }
.keynum .l { font-size:7.4pt; color:var(--gray); }
.next { background:var(--navy); color:#fff; border-radius:4px; padding:3mm; font-size:9pt; }
.next b { color:#f3e6cf; }
.cards { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; flex:1; min-height:0; }
.card { border:1px solid var(--line); border-radius:5px; padding:2.2mm 3mm; display:flex; flex-direction:column; gap:1mm; position:relative; min-height:0; }
.card.rec { border:2px solid var(--accent); box-shadow:0 0 0 2px #f3e6cf inset; }
.card .tier { font-size:7.6pt; color:var(--accent); font-weight:700; }
.card h3 { font-size:10.2pt; }
.card .headline { font-size:8.6pt; font-weight:700; color:var(--navy2); }
.card .concept { font-size:7.8pt; color:var(--gray); }
.comp { font-size:7.8pt; border-top:1px dotted var(--line); padding-top:1mm; }
.comp div { display:flex; justify-content:space-between; gap:2mm; }
.meter { height:5px; background:var(--light); border-radius:3px; overflow:hidden; }
.meter-fill { height:100%; background:var(--accent); }
.kv { display:flex; justify-content:space-between; font-size:7.8pt; }
.fit { font-size:7.6pt; color:var(--gray); margin-top:auto; }
.rec-badge { position:absolute; top:-2.2mm; right:3mm; }
`;

function premiumRange(p: Plan): string {
  const est = p.components.map((c) => c.premiumEstimate).filter((e): e is Exclude<PlanComponent['premiumEstimate'], 'DESIGN_SHEET_REQUIRED'> => e !== 'DESIGN_SHEET_REQUIRED');
  if (!est.length) return '設計書にて提示';
  const lo = est.reduce((a, e) => a + e.low.value, 0);
  const hi = est.reduce((a, e) => a + e.high.value, 0);
  const partial = est.length < p.components.length ? '＋設計書にて提示' : '';
  return `約${man(lo)}〜${man(hi)}${partial}`;
}

function card(input: RenderInput, p: Plan, n: PlanNarrative | undefined, rec: boolean): string {
  const comps = p.components
    .map((c) => `<div><span>${h(c.label)}</span><b>${h(man(c.deathBenefit))}</b></div><div class="muted"><span>${h(c.purpose.replace(/（.*?）/g, ''))}</span><span>〜${c.categoryCode === 'WHOLE_LIFE' ? '終身' : `${c.termToAge}歳`}</span></div>`)
    .join('</div><div class="comp">');
  const range = premiumRange(p);
  return `<div class="card${rec ? ' rec' : ''}">
  ${rec ? '<span class="badge accent rec-badge">おすすめ</span>' : ''}
  <div class="tier">${h(TIER_JA[p.tier])}</div>
  <h3>${h(p.title.replace(/^「(.+)」.*$/, '$1'))}</h3>
  <div class="headline">${h(n?.headline ?? '')}</div>
  <div class="comp">${comps}</div>
  <div class="kv"><span>充足率（既存保障を含む）</span><b>${p.coverageRatioMoney.value.toFixed(1)}%</b></div>
  ${ratioMeter(p)}
  <div class="kv"><span>年間保険料の目安${p.reducedForBudget ? '（予算の目安に合わせ調整）' : ''}</span><span>${h(range)}</span></div>
  <div class="fit">${h(n?.fitFor ?? '')}</div>
</div>`;
}

export function renderSummary(input: RenderInput, opts: RenderOptions): string {
  const { company: c, officer: o, calc, narrative, planSet } = input;
  const assumed = (f: string) => calc.assumptions.some((a) => a.field === f);
  const status = `<table class="status">
<tr><th>年商</th><td class="num">${h(man(c.revenue))}</td></tr>
<tr><th>経常利益</th><td class="num">${c.ordinaryProfit != null ? h(man(c.ordinaryProfit)) : '<span class="muted">未入力</span>'}</td></tr>
<tr><th>借入金</th><td class="num">${h(man(c.loanTotal))}</td></tr>
<tr><th>従業員</th><td class="num">${c.employeeCount}名</td></tr>
<tr><th>代表者</th><td class="num">${h(o.role)}・${o.age}歳・報酬月額${h(man(o.monthlyPay))}</td></tr>
<tr><th>勇退予定</th><td class="num">${withAssumed(`${o.age + calc.retirement.yearsToRetire.value}歳`, assumed('plannedRetireAge'))}</td></tr>
<tr><th>既存の保障</th><td class="num">${h(man(calc.coverage.existing))}</td></tr>
</table>`;
  const plans = ordered(planSet.plans, null);
  const cards = plans.map((p) => card(input, p, narrative.plans.find((x) => x.tier === p.tier), input.recommendedTier === p.tier)).join('');
  const body = `<div class="page">
  <div class="head"><div><h1>${h(narrative.onePaper.title)}</h1><div class="lead">${h(narrative.onePaper.lead)}</div></div><div class="small muted" style="text-align:right;white-space:nowrap">${h(dateJa(input.generatedAt))}</div></div>
  <div class="row1">
    <div class="box"><div class="box-title">御社の現状</div>${status}</div>
    <div class="box"><div class="box-title">必要保障額の算定</div>${coverageChart(calc, { height: 150 })}<div class="xsmall muted">事業保障資金は${calc.coverage.adopted === 'B' ? '運転資金方式' : '積上げ方式'}で算定。${calc.coverage.businessFund.assumed ? '一部に仮置きの値を含みます。' : ''}</div></div>
    <div><div class="keynums"><div class="keynum"><div class="l">必要保障額</div><div class="v">${h(man(calc.coverage.required))}</div></div><div class="keynum"><div class="l">不足額</div><div class="v">${h(man(calc.coverage.gap))}</div></div><div class="keynum"><div class="l">勇退退職金の目安</div><div class="v">${h(man(calc.retirement.target))}</div></div><div class="keynum"><div class="l">物価上昇を考慮すると</div><div class="v">${h(man(calc.retirement.inflationAdjusted))}</div></div></div>
    <div class="next"><b>次のアクション</b><br>${h(narrative.onePaper.closing)}</div></div>
  </div>
  <div class="cards">${cards}</div>
  <div class="disc-inline">${documentDisclaimers(input).map((d) => h(d)).join('／')}　（ナレッジ基準日：${h(asOfLabel(input.knowledge.settings.asOf))}・版 ${h(input.knowledge.version)}）</div>
</div>`;
  return htmlDoc(narrative.onePaper.title, body, CSS, input, opts);
}
