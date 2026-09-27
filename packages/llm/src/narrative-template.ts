import { formatMan, type Money, type Plan, type PlanComponent, type Tier } from '@p3/engine';
import type { NarrativeContext } from './context';
import type { Narrative, PlanNarrative } from './schemas';

const man = (m: Money | number) => formatMan(typeof m === 'number' ? m : m.value);
const pct = (m: Money) => `${m.value.toFixed(1)}%`;
const hasDigits = (s: string) => /[0-9０-９]|[一二三四五六七八九十百千万億]{1,}(万|億|円|千)/.test(s);

function componentList(p: Plan): string {
  return p.components.map((c) => `${c.label}（${roleLabel(c)}・保障額${man(c.deathBenefit)}）`).join('、');
}

export function roleLabel(c: PlanComponent): string {
  switch (c.role) {
    case 'protection':
      return '事業保障';
    case 'retirement':
      return '退職金準備＋事業保障';
    case 'third_sector':
      return '就業不能への備え';
    case 'welfare':
      return '従業員の福利厚生';
    case 'succession':
      return '承継・相続への備え';
  }
}

function premiumSentence(p: Plan): string {
  if (!p.totalPremium) return '保険料は保険会社の設計書にてご提示します。';
  return `保険料は年${man(p.totalPremium)}程度が目安です（参考値。正式には設計書でご確認ください）。`;
}

function planHeadline(ctx: NarrativeContext, tier: Tier): string {
  const loanBased = ctx.company.loanTotal > 0;
  if (tier === 'MIN') return loanBased ? '借入金の返済資金を、負担を抑えて先に確保' : '当面の運転資金を、負担を抑えて先に確保';
  if (tier === 'BALANCED') return '会社を守る保障と退職金準備を両立';
  return '必要保障額の全額と将来の備えを一体で設計';
}

function factsSentence(ctx: NarrativeContext): string {
  const { company: c, officer: o, calc } = ctx;
  const parts = [`御社の年商は${man(c.revenue)}、借入金は${man(c.loanTotal)}、従業員は${c.employeeCount}名です`];
  parts.push(`代表者は${o.age}歳、役員報酬は月額${man(o.monthlyPay)}${o.guaranteesLoan ? 'で、会社の借入金の連帯保証人になっています' : 'です'}`);
  const existing = calc.coverage.existing.value > 0 ? `現在の法人契約の死亡保障は${man(calc.coverage.existing)}です` : '現在、法人契約の死亡保障はありません';
  return `${parts.join('。')}。${existing}。`;
}

function criteriaSentence(ctx: NarrativeContext): string {
  const cv = ctx.calc.coverage;
  if (cv.adopted === 'B') {
    const b = cv.methodBParts;
    return `経営者に万一のことがあった場合の事業保障資金は、一般に運転資金の6〜12か月分が目安とされています。ここでは当面の運転資金${man(b.workingCapital)}、借入金の返済資金${man(b.repayment)}、一括返済が必要になり得る借入金${man(b.lumpSum)}を合計して算定しました（運転資金方式）。`;
  }
  const a = cv.methodAParts;
  return `事業保障資金は、借入金相当額${man(a.loan)}、経営を立て直すまでの資金${man(a.rebuild)}、これらを保険金で受け取る際の納税準備資金${man(a.taxReserve)}を積み上げて算定しました（積上げ方式）。`;
}

function calcSentence(ctx: NarrativeContext): string {
  const cv = ctx.calc.coverage;
  return `その結果、事業保障資金${man(cv.businessFund)}に、死亡退職金${man(cv.deathRetirement)}と弔慰金${man(cv.condolence)}を加えた必要保障額は${man(cv.required)}、既存の保障を差し引いた不足額は${man(cv.gap)}となります。`;
}

function conclusionSentence(ctx: NarrativeContext, p: Plan): string {
  const r = ctx.calc.retirement;
  const main = p.components[0];
  const ratio = `必要保障額に対する充足率は約${pct(p.coverageRatioMoney)}です。`;
  if (p.tier === 'MIN') {
    if (!main) return ratio;
    const priority = main.role === 'protection' ? (ctx.company.loanTotal > 0 ? '最も優先度の高い借入金の返済資金' : '最も優先度の高い当面の運転資金') : '勇退退職金の財源';
    return `このうち${priority}について、保険料を抑えやすい${main.label}で${man(main.deathBenefit)}を確保します。${ratio}`;
  }
  if (p.tier === 'BALANCED') {
    const ret = p.components.find((c) => c.role === 'retirement');
    const retText = ret
      ? `あわせて、勇退予定まで${r.yearsToRetire.value}年あることから、${ret.label}の解約返戻金を勇退退職金（目標${man(r.target)}）の財源の一部として準備します。`
      : '勇退退職金の準備は、保険料の目安の範囲では構成に含めていません。';
    return `不足する保障を確保しつつ、${retText}${ratio}`;
  }
  const extras = p.components.filter((c) => c.role === 'third_sector' || c.role === 'welfare' || c.role === 'succession').map((c) => roleLabel(c));
  return `必要保障額の確保に加え、物価上昇（年${(ctx.knowledge.settings.inflationRate * 100).toFixed(1)}%）を考慮した勇退退職金${man(r.inflationAdjusted)}の財源づくり${extras.length ? `、${extras.join('・')}` : ''}までを一体で設計します。${ratio}`;
}

function refsFor(ctx: NarrativeContext, p: Plan): string[][] {
  const adopted = ctx.calc.coverage.adopted === 'B' ? 'calc.coverage.methodB' : 'calc.coverage.methodA';
  const planRefs = [`plan.${p.tier}.coverageRatio`, ...p.components.map((c) => c.deathBenefit.calcId)];
  if (p.tier !== 'MIN') planRefs.push('calc.retirement.target', 'calc.retirement.inflationAdjusted');
  return [
    ['calc.coverage.existing'],
    [adopted],
    ['calc.coverage.businessFund', 'calc.coverage.deathRetirement', 'calc.coverage.condolence', 'calc.coverage.required', 'calc.coverage.gap'],
    planRefs,
  ];
}

function merits(ctx: NarrativeContext, p: Plan): string[] {
  const out: string[] = [];
  for (const c of p.components) {
    const cat = ctx.knowledge.categories.find((x) => x.code === c.categoryCode);
    if (cat) out.push(...cat.pros.map((pro) => `${c.label}：${pro}`));
  }
  if (!p.reducedForBudget && p.totalPremium) out.push('保険料の目安の範囲内で設計しています');
  return [...new Set(out)];
}

function cautions(ctx: NarrativeContext, p: Plan): string[] {
  const out: string[] = [];
  for (const c of p.components) {
    const cat = ctx.knowledge.categories.find((x) => x.code === c.categoryCode);
    if (cat) out.push(...cat.mandatoryDisclaimers, ...cat.cons);
  }
  out.push(...p.notes);
  return [...new Set(out)];
}

function fitFor(p: Plan): string {
  if (p.tier === 'MIN') return 'まずは資金繰りを優先しながら、最も大きなリスクから備えたい経営者に向いています。';
  if (p.tier === 'BALANCED') return '会社を守る保障と、ご自身の勇退退職金の準備を無理なく同時に進めたい経営者に向いています。';
  const roles = new Set(p.components.map((c) => c.role));
  const extra = [roles.has('succession') ? '事業承継' : '', roles.has('third_sector') ? '就業不能' : '', roles.has('welfare') ? '従業員の退職金' : ''].filter(Boolean);
  return `${extra.length ? `${extra.join('・')}まで` : '将来まで'}見据えて、備えを一度に整えたい経営者に向いています。`;
}

export function templatePlanNarrative(ctx: NarrativeContext, p: Plan): PlanNarrative {
  return {
    tier: p.tier,
    headline: planHeadline(ctx, p.tier),
    whyThisCompany: [factsSentence(ctx), criteriaSentence(ctx), calcSentence(ctx), conclusionSentence(ctx, p)],
    whyThisCompanyRefs: refsFor(ctx, p),
    merits: merits(ctx, p),
    cautions: cautions(ctx, p),
    fitFor: fitFor(p),
  };
}

function objectionResponse(ctx: NarrativeContext, objection: string): { response: string; backedBy: string[] } {
  const { calc } = ctx;
  if (/節税|税負担|税金/.test(objection)) {
    return {
      response: '法人保険は万一の際の保障を目的とするものです。保険料を損金算入しても、受け取る保険金や解約返戻金は益金に算入されるため、通期での節税効果はありません。経理処理の取扱いは設計書をもとに、顧問税理士の先生とご確認ください。',
      backedBy: [],
    };
  }
  if (/保険料|負担/.test(objection)) {
    return {
      response: `最小プランは、保険料を年${man(calc.budget.min)}程度の目安に収めることを前提に、最も大きなリスクから先に備える設計です。業績や資金繰りに合わせて、後から保障を追加・見直しすることもできます。`,
      backedBy: ['calc.budget.min'],
    };
  }
  if (/運用|元本/.test(objection)) {
    return {
      response: '変額保険（定期型）は運用実績によって解約返戻金が変動し、解約返戻金に最低保証はありません。一方で、死亡保険金は基本保険金額が最低保証されます。運用による変動を避けたい場合は、定額の長期平準定期保険で設計することもできます。',
      backedBy: [],
    };
  }
  if (/貸し剥がし|金融機関/.test(objection)) {
    return {
      response: `事業保障資金として${man(calc.coverage.businessFund)}を準備しておくことで、万一の際も借入金の返済や当面の運転資金に充てられ、金融機関や取引先との関係を保つ備えになります。`,
      backedBy: ['calc.coverage.businessFund'],
    };
  }
  return { response: 'ご懸念の点は、設計書をお取り寄せする際に条件を調整してご提示します。', backedBy: [] };
}

export function templateNarrative(ctx: NarrativeContext): Narrative {
  const { calc, planSet, extraction, company } = ctx;
  const cv = calc.coverage;
  const r = calc.retirement;
  const plans = planSet.plans.map((p) => templatePlanNarrative(ctx, p));
  const issueQuote = extraction.issues.find((i) => (i.tag === 'key_person' || i.tag === 'loan_repayment' || i.tag === 'cashflow') && !hasDigits(i.evidenceQuote));

  const objections = extraction.objections.length ? extraction.objections : ['保険料の負担が心配'];
  const objectionHandling = objections.map((o) => ({ objection: o, ...objectionResponse(ctx, o) }));
  if (!objectionHandling.some((o) => /今/.test(o.objection))) {
    objectionHandling.push({
      objection: '今すぐでなくてもよいのでは',
      response: `経営者に万一のことがあるかどうかは誰にも分かりません。不足額${man(cv.gap)}のうち、まずは最小プランで最も大きなリスクに備え、残りは設計書を見ながら段階的にご検討いただく方法もあります。`,
      backedBy: ['calc.coverage.gap'],
    });
  }

  const adoptedLabel = cv.adopted === 'B' ? '運転資金方式' : '積上げ方式';
  const other = cv.adopted === 'B' ? cv.methodA : cv.methodB;
  const rationaleMemo: string[] = [
    `必要保障額${man(cv.required)}の内訳：事業保障資金${man(cv.businessFund)}（${adoptedLabel}）＋死亡退職金${man(cv.deathRetirement)}（${cv.deathRetirement.formula}）＋弔慰金${man(cv.condolence)}（${cv.condolence.formula}）。「どうしてこの金額なのか」と聞かれたら、この3つの合計であることを順に説明します。`,
    `事業保障資金は2つの方式で試算しています。運転資金方式${man(cv.methodB)}、積上げ方式${man(cv.methodA)}。今回は${adoptedLabel}を採用しており、もう一方の${man(other)}も参考値としてお見せできます。`,
    `不足額${man(cv.gap)}＝必要保障額${man(cv.required)}−既存の保障${man(cv.existing)}。既存契約の保障内容（保障額・期間）は保険証券で確認してください。`,
    `死亡退職金の相続税の非課税枠は${man(cv.inheritanceExempt)}（${cv.inheritanceExempt.formula}）です。死亡退職金と弔慰金を別々に支給するには「役員退職慰労金・弔慰金規程」の整備が必要です。`,
    `勇退退職金の目標${man(r.target)}（${r.target.formula}）。物価上昇を考慮すると勇退時には${man(r.inflationAdjusted)}（差額${man(r.inflationDiff)}）が必要になる計算です。`,
    `退職所得控除${man(r.deduction)}、課税退職所得${man(r.taxable)}${r.specialOfficer ? '（勤続5年以下の役員のため1/2課税の対象外）' : '（1/2課税）'}。同額を役員報酬で受け取る場合と比べた個人の税負担の差は約${man(r.netVsSalary)}です（概算・社会保険料は考慮外）。`,
    `保険料の目安は経常利益をもとにした設定値です：最小${man(calc.budget.min)}／バランス${man(calc.budget.balanced)}／最大活用${man(calc.budget.max)}（いずれも年額・上限の目安）${calc.budget.assumed ? '。経常利益が不明なため年商から仮置きしています' : ''}。`,
    ...planSet.ruleHits.map((h) => `判断ロジック${h.id}（${h.name}）：${h.rationale}`),
    ...planSet.memoPoints.map((m) => `見直し論点：${m}`),
  ];
  if (calc.assumptions.length) rationaleMemo.push(`仮置きした値：${calc.assumptions.map((a) => `${a.label}（${a.reason}）`).join('／')}。次回ヒアリングで確認してください。`);
  if (extraction.missingInfo.length) rationaleMemo.push(`次回ヒアリング項目：${extraction.missingInfo.join('、')}`);
  if (extraction.conflicts.length) rationaleMemo.push(`入力値と商談ログの食い違い：${extraction.conflicts.map((c) => c.field).join('、')}（入力フォームの値で計算しています。どちらが正しいか確認してください）`);
  if (planSet.plans.some((p) => p.components.some((c) => c.categoryCode === 'VARIABLE_TERM'))) {
    rationaleMemo.push('変額保険（定期型）は変額保険販売資格を持つ募集人が説明してください。特別勘定の運用リスク・諸費用・解約控除を漏れなく説明します。');
  }
  rationaleMemo.push('顧客提示の前に、重要事項の説明と意向把握（ご意向の確認）を実施してください。');

  return {
    plans,
    onePaper: {
      title: `${company.name}様　経営リスクへの備え　3つのご提案`,
      lead: `代表者に万一のことがあった場合でも会社が存続できる資金と、勇退時の退職金の財源を、御社の数値から算定しました。必要保障額${man(cv.required)}に対し、${cv.existing.value > 0 ? `現在の保障は${man(cv.existing)}、不足額は${man(cv.gap)}です。` : `現在は法人契約の死亡保障がないため、全額の${man(cv.gap)}が不足しています。`}`,
      closing: 'ご希望のプランで、保険会社の正式な設計書をお取り寄せします。',
    },
    talkScript: {
      opening: '本日はお時間をいただきありがとうございます。先ほど伺ったお話をもとに、社長に万一のことがあった場合の会社への影響と、その備え方を3つのパターンに整理しました。5分ほどお時間をください。',
      problemFraming: `${issueQuote ? `先ほど「${issueQuote.evidenceQuote}」とおっしゃっていました。` : ''}仮に社長に万一のことがあると、取引先や金融機関からの信用が揺らぎ、売上の減少や借入金の返済を求められるおそれがあります。試算では、会社が落ち着くまでに必要な事業保障資金は${man(cv.businessFund)}、死亡退職金・弔慰金を含めると${man(cv.required)}です。現在の保障を差し引くと${man(cv.gap)}が不足しています。`,
      planWalkthrough: planSet.plans.map((p) => ({
        tier: p.tier,
        script: `${p.title}は、${p.concept}プランです。構成は${componentList(p)}です。必要保障額に対する充足率は約${pct(p.coverageRatioMoney)}です。${premiumSentence(p)}`,
      })),
      closingQuestion: '3つのうち、どのパターンで正式な設計書をお取り寄せしましょうか。まずは最小プランから始めて、段階的に広げていく方法もございます。',
      objectionHandling,
    },
    rationaleMemo,
  };
}
