import type { Money, Plan, PlanComponent } from '@p3/engine';
import { asOfLabel } from '@p3/knowledge';
import { roleLabel } from '@p3/llm';
import { inflationChart, ratioMeter } from './charts';
import { disclaimerBlock, htmlDoc } from './common';
import type { RenderInput, RenderOptions } from './types';
import { dateJa, h, list, man, TIER_JA, withAssumed } from './util';

const CSS = `
@page { size: A4 portrait; margin: 0; }
.page { width:210mm; min-height:297mm; padding:12mm 13mm 10mm; page-break-after:always; display:flex; flex-direction:column; gap:3.5mm; }
.page:last-child { page-break-after:auto; }
.ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--navy); padding-bottom:2mm; }
.ph h1 { font-size:14pt; }
.ph .pno { font-size:8pt; color:var(--gray); }
h2 { font-size:11pt; border-left:4px solid var(--accent); padding-left:6px; margin-top:1mm; }
h3 { font-size:10pt; }
.formula { font-size:7.6pt; color:var(--gray); }
tr.adopted td { background:#f6efe2; }
tr.total td { font-weight:700; border-top:1.5px solid var(--navy); }
.plan { border:1px solid var(--line); border-radius:5px; padding:3mm 4mm; page-break-inside:avoid; display:flex; flex-direction:column; gap:1.5mm; }
.plan.rec { border:2px solid var(--accent); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:3mm; }
.meter { height:6px; background:var(--light); border-radius:3px; overflow:hidden; }
.meter-fill { height:100%; background:var(--accent); }
.why li { margin-bottom:1mm; }
.note { background:var(--light); border-radius:4px; padding:2mm 3mm; font-size:8pt; }
.journal td, .journal th { font-size:7.6pt; }
`;

function pageHead(input: RenderInput, title: string, no: number, total: number): string {
  return `<div class="ph"><div><div class="small muted">${h(input.company.name)}様</div><h1>${h(title)}</h1></div><div class="pno">${h(dateJa(input.generatedAt))}　${no} / ${total}</div></div>`;
}

function row(label: string, m: Money, cls = ''): string {
  return `<tr class="${cls}"><td>${h(label)}<div class="formula">${h(m.formula)}</div></td><td class="num">${withAssumed(h(man(m)), m.assumed)}</td></tr>`;
}

function page1(input: RenderInput): string {
  const { calc, company: c, officer: o, narrative } = input;
  const cv = calc.coverage;
  const assumed = (f: string) => calc.assumptions.some((a) => a.field === f);
  const v = (f: string, val: number | null | undefined, unit = '万円') => {
    const shown = val == null ? '—' : unit === '万円' ? man(val) : `${val}${unit}`;
    return withAssumed(h(shown), assumed(f));
  };
  const assumedVal = (f: string) => calc.assumptions.find((a) => a.field === f)?.value;
  const inputs = `<table>
<tr><th>年商</th><td class="num">${v('revenue', c.revenue)}</td><th>経常利益</th><td class="num">${v('ordinaryProfit', c.ordinaryProfit)}</td></tr>
<tr><th>借入金残高</th><td class="num">${v('loanTotal', c.loanTotal)}</td><th>一括返済が必要な借入金等</th><td class="num">${v('loanShortTerm', c.loanShortTerm ?? assumedVal('loanShortTerm'))}</td></tr>
<tr><th>月々の借入返済額</th><td class="num">${v('loanMonthlyRepay', c.loanMonthlyRepay ?? assumedVal('loanMonthlyRepay'))}</td><th>従業員数</th><td class="num">${c.employeeCount}名</td></tr>
<tr><th>月間人件費</th><td class="num">${v('monthlyLabor', c.monthlyLabor ?? assumedVal('monthlyLabor'))}</td><th>月間その他固定費</th><td class="num">${v('monthlyFixed', c.monthlyFixed ?? assumedVal('monthlyFixed'))}</td></tr>
<tr><th>代表者</th><td class="num">${h(o.role)}・${o.age}歳</td><th>役員報酬月額</th><td class="num">${h(man(o.monthlyPay))}</td></tr>
<tr><th>役員在任年数</th><td class="num">${o.tenureYears}年</td><th>法定相続人数</th><td class="num">${v('legalHeirs', o.legalHeirs ?? assumedVal('legalHeirs'), '人')}</td></tr>
</table>`;
  const methods = `<table>
<tr><th>方式</th><th class="num">金額</th></tr>
<tr class="${cv.adopted === 'B' ? 'adopted' : ''}"><td><b>運転資金方式</b>${cv.adopted === 'B' ? ' <span class="badge accent">採用</span>' : ''}<div class="formula">当面の運転資金＋借入金の返済資金＋一括返済が必要な借入金・営業債務</div></td><td class="num"><b>${withAssumed(h(man(cv.methodB)), cv.methodB.assumed)}</b></td></tr>
${row('　当面の運転資金', cv.methodBParts.workingCapital)}
${row('　借入金の返済資金', cv.methodBParts.repayment)}
${row('　一括返済が必要な借入金・営業債務', cv.methodBParts.lumpSum)}
<tr class="${cv.adopted === 'A' ? 'adopted' : ''}"><td><b>積上げ方式</b>${cv.adopted === 'A' ? ' <span class="badge accent">採用</span>' : ''}<div class="formula">借入金相当額＋経営立て直し資金＋納税準備資金</div></td><td class="num"><b>${withAssumed(h(man(cv.methodA)), cv.methodA.assumed)}</b></td></tr>
${row('　借入金相当額', cv.methodAParts.loan)}
${row('　経営立て直し資金', cv.methodAParts.rebuild)}
${row('　納税準備資金', cv.methodAParts.taxReserve)}
</table>`;
  const totals = `<table>
${row('事業保障資金（採用方式）', cv.businessFund)}
${row('死亡退職金', cv.deathRetirement)}
${row('弔慰金（業務外の死亡）', cv.condolence)}
<tr class="total"><td>必要保障額<div class="formula">${h(cv.required.formula)}</div></td><td class="num">${withAssumed(h(man(cv.required)), cv.required.assumed)}</td></tr>
${row('既存の死亡保障', cv.existing)}
<tr class="total"><td>不足額<div class="formula">${h(cv.gap.formula)}</div></td><td class="num">${withAssumed(h(man(cv.gap)), cv.gap.assumed)}</td></tr>
</table>
<div class="small muted">参考：業務上の死亡の場合の弔慰金は${h(man(cv.condolenceOnDuty))}。死亡退職金の相続税の非課税枠は${h(man(cv.inheritanceExempt))}（${h(cv.inheritanceExempt.formula)}）。</div>`;
  const why = narrative.plans[0]?.whyThisCompany.slice(0, 3) ?? [];
  const assumptions = calc.assumptions.length
    ? `<div class="note"><b>仮置きしている値</b>${list(calc.assumptions.map((a) => `${a.label}：${a.reason}`))}</div>`
    : '';
  return `<div class="page">${pageHead(input, '必要保障額の算定根拠', 1, 3)}
<h2>算定の考え方</h2>${list(why, 'why')}
<h2>入力値</h2>${inputs}
${assumptions}
<div class="grid2"><div><h2>事業保障資金（2方式の比較）</h2>${methods}</div><div><h2>必要保障額と不足額</h2>${totals}</div></div>
<div class="note">${h(input.knowledge.disclaimers.loanTaxNote)}${h(input.knowledge.disclaimers.regulation)}</div>
</div>`;
}

function premiumCell(c: PlanComponent): string {
  if (c.premiumEstimate === 'DESIGN_SHEET_REQUIRED') return '設計書にて提示';
  return `約${man(c.premiumEstimate.low)}〜${man(c.premiumEstimate.high)}`;
}

function planBlock(input: RenderInput, p: Plan): string {
  const n = input.narrative.plans.find((x) => x.tier === p.tier);
  const retireAge = input.officer.age + input.calc.retirement.yearsToRetire.value;
  const rows = p.components
    .map(
      (c) => `<tr><td>${h(c.label)}<div class="formula">${h(roleLabel(c))}：${h(c.purpose)}</div></td><td class="num">${h(man(c.deathBenefit))}</td><td class="num">${c.categoryCode === 'WHOLE_LIFE' ? '終身' : `${c.termToAge}歳まで`}</td><td class="num">${h(premiumCell(c))}</td><td class="small">${h(c.taxTreatment ?? '')}${c.peakAge != null && c.role === 'retirement' ? `<div class="formula">返戻率のピーク：${c.peakAge}歳ごろ（勇退予定${retireAge}歳）</div>` : ''}</td></tr>`,
    )
    .join('');
  const journals = p.components
    .filter((c) => c.taxDetail)
    .map((c) => {
      const t = c.taxDetail!;
      if (t.fullyDeductible) return `<tr><td>${h(c.label)}</td><td colspan="3">${h(t.summary)}</td></tr>`;
      const prem = c.premiumEstimate === 'DESIGN_SHEET_REQUIRED' ? 0 : c.premiumEstimate.mid.value;
      return `<tr><td>${h(c.label)}<div class="formula">${h(t.summary)}</div></td><td class="num">前払保険料 ${h(man(t.firstYearAsset))}<br>支払保険料 ${h(man(t.firstYearExpense))}</td><td class="num">現金・預金 ${h(man(prem))}</td><td class="num">満了前年度：支払保険料 ${h(man(t.lastYearExpense))}（うち取崩 ${h(man(t.lastYearReversal))}）</td></tr>`;
    })
    .join('');
  return `<div class="plan${input.recommendedTier === p.tier ? ' rec' : ''}">
<div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${h(TIER_JA[p.tier])}：${h(p.title.replace(/^「(.+)」.*$/, '$1'))}</h3>${input.recommendedTier === p.tier ? '<span class="badge accent">おすすめ</span>' : ''}</div>
<div class="small"><b>${h(n?.headline ?? '')}</b>　${h(p.concept)}</div>
${list((n?.whyThisCompany ?? []).slice(-1), 'why small')}
<table><tr><th>構成</th><th class="num">保障額</th><th class="num">保険期間</th><th class="num">年間保険料の目安</th><th>経理処理の区分</th></tr>${rows}</table>
<div class="grid2"><div><div class="small">充足率（既存保障を含む）<b>${p.coverageRatioMoney.value.toFixed(1)}%</b>${p.totalPremium ? `　保険料の目安 合計 年約${h(man(p.totalPremium))}` : ''}</div>${ratioMeter(p)}</div><div class="small muted">${h(n?.fitFor ?? '')}</div></div>
<div class="grid2 small"><div><b>メリット</b>${list(n?.merits ?? [])}</div><div><b>ご注意いただきたい点</b>${list(n?.cautions ?? [])}</div></div>
${journals ? `<table class="journal"><tr><th>経理処理の例（1年目・参考保険料ベース）</th><th class="num">借方</th><th class="num">貸方</th><th class="num">取崩期間</th></tr>${journals}</table>` : ''}
</div>`;
}

function page2(input: RenderInput): string {
  const plans = input.planSet.plans.map((p) => planBlock(input, p)).join('');
  return `<div class="page">${pageHead(input, '3つのご提案の詳細', 2, 3)}${plans}
<div class="note small">${h(input.knowledge.disclaimers.taxNoSaving)} 経理処理の例は参考保険料にもとづく概算で、最高解約返戻率の区分（法人税基本通達9-3-5の2、${h(asOfLabel(input.knowledge.settings.taxAsOf))}現在）により取扱いが異なります。</div></div>`;
}

function page3(input: RenderInput): string {
  const r = input.calc.retirement;
  const k = input.knowledge;
  const stats = k.statistics.filter((s) => ['purpose_death_retirement', 'purpose_retirement', 'inflation_real_value', 'ceo_age_peak', 'healthy_life_male'].includes(s.key));
  return `<div class="page">${pageHead(input, '勇退退職金の考え方', 3, 3)}
<h2>役員退職金の目安（功績倍率方式）</h2>
<table>${row('勇退退職金の目安', r.target)}${row('功績倍率', { ...r.multiplier, value: r.multiplier.value })}${row('勇退までの年数', r.yearsToRetire)}</table>
<h2>物価上昇を考慮した必要額</h2>
<div style="max-width:120mm">${inflationChart(input.calc)}</div>
<table>${row('勇退時に必要な額（物価上昇 年' + (k.settings.inflationRate * 100).toFixed(1) + '%）', r.inflationAdjusted)}${row('物価上昇による差額', r.inflationDiff)}</table>
<h2>退職金で受け取る場合の税務（個人）</h2>
<table>${row('退職所得控除', r.deduction)}${row('課税退職所得', r.taxable)}${row('所得税・住民税の概算（退職金で受け取る場合）', r.taxOnRetirement)}${row('所得税・住民税の増加額の概算（役員報酬に上乗せした場合）', r.taxIfSalary)}</table>
<div class="note">退職金は①ほかの所得と分けて課税される（分離課税）、②勤続年数に応じた退職所得控除がある、③控除後の金額の1/2が課税対象となる${r.specialOfficer ? '（ただし役員等勤続年数5年以下の場合は1/2課税の対象外）' : ''}、という仕組みがあり、役員報酬で受け取る場合と比べて個人の税負担が異なります。記載は概算であり、社会保険料・住民税の均等割等は考慮していません。</div>
<h2>参考となる統計</h2>
${list(stats.map((s) => `${s.text}（出典：${s.source.title}）`), 'small')}
${disclaimerBlock(input)}
</div>`;
}

export function renderDesignSheet(input: RenderInput, opts: RenderOptions): string {
  return htmlDoc(`${input.company.name}様 設計書型資料`, page1(input) + page2(input) + page3(input), CSS, input, opts);
}
