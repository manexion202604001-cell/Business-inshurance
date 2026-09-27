/**
 * Core types for the calculation engine.
 * All monetary values are in 万円 (10,000 JPY) and rounded half-up to integers.
 */

export type Unit = '万円' | '%' | '年' | '歳' | '倍' | 'か月' | '名' | '人';

/** A calculated quantity that can be traced back to its formula and inputs. */
export interface Money {
  value: number;
  unit: Unit;
  /** Stable identifier, e.g. "calc.coverage.gap". Used by grounding checks and templates. */
  calcId: string;
  /** Human readable formula (Japanese). */
  formula: string;
  inputs: Record<string, number>;
  source?: string;
  /** True when one or more inputs were assumed (仮置き). */
  assumed?: boolean;
}

export type OfficerRole = '会長' | '社長' | '専務' | '常務' | '取締役';

export interface OfficerInput {
  role: OfficerRole;
  age: number;
  sex: 'M' | 'F';
  /** 役員報酬月額（万円） */
  monthlyPay: number;
  /** 役員在任年数 */
  tenureYears: number;
  plannedRetireAge?: number | null;
  legalHeirs?: number | null;
  guaranteesLoan?: boolean;
}

export interface ExistingPolicyInput {
  category: string;
  purpose?: string | null;
  deathBenefit?: number | null;
  annualPremium?: number | null;
  issueAge?: number | null;
  maturityAge?: number | null;
  peakReturnRate?: number | null;
  /** 経過年数でのピーク時期 */
  peakYear?: number | null;
  note?: string | null;
}

export interface CompanyInput {
  name: string;
  industry: string;
  fiscalMonth?: number | null;
  revenue: number;
  ordinaryProfit?: number | null;
  netAssets?: number | null;
  loanTotal: number;
  loanShortTerm?: number | null;
  loanMonthlyRepay?: number | null;
  monthlyLabor?: number | null;
  monthlyFixed?: number | null;
  employeeCount: number;
}

/** Facts extracted from the meeting log that affect rules (Step 2 output subset). */
export interface CaseSignals {
  /** Issue tags detected in the log (loan_repayment, successor, inheritance, ...). */
  issueTags: string[];
  /** Whether the log mentions a deficit / loss-making year. */
  deficitMentioned?: boolean;
  /** Whether the company already has an employee retirement allowance funding scheme. */
  employeeRetirementPrepared?: boolean | null;
  /** Whether the officer retirement allowance funding is already prepared. */
  officerRetirementPrepared?: boolean | null;
  /** Whether the death is assumed to be work-related for condolence calculation. */
  onDutyDeath?: boolean;
}

export interface CaseInput {
  company: CompanyInput;
  /** The insured officer (usually the representative). */
  officer: OfficerInput;
  existingPolicies: ExistingPolicyInput[];
  signals: CaseSignals;
}

export interface TaxBracket {
  /** Upper bound of taxable income (万円), null for the top bracket. */
  upTo: number | null;
  rate: number;
  /** 控除額（万円） */
  deduction: number;
}

export interface EngineSettings {
  asOf: string;
  taxAsOf: string;
  rebuildMonths: number;
  workingCapitalMonths: number;
  effectiveTaxRate: number;
  inflationRate: number;
  condolenceMonthsOnDuty: number;
  condolenceMonthsOffDuty: number;
  adoptedMethod: 'A' | 'B';
  meritMultipliers: Record<OfficerRole, number>;
  inheritanceExemptPerHeir: number;
  budgetRates: { min: number; balanced: number; max: number };
  budgetRevenueFallbackRate: number;
  defaultRetireAge: number;
  defaultLegalHeirs: number;
  laborToRevenueFallback: number;
  fixedToRevenueFallback: number;
  loanRepayYearsFallback: number;
  incomeTaxBrackets: TaxBracket[];
  reconstructionSurtaxRate: number;
  residentTaxRate: number;
  /** 給与所得控除の上限（万円） used for the salary comparison (simplified). */
  salaryDeductionCap: number;
  /** 基礎控除等（万円） used for the salary comparison (simplified). */
  basicDeduction: number;
  /** Minimum premium-to-budget tolerance loop step, in 万円 of death benefit. */
  coverageStep: number;
  /** Rule threshold for R08: allowed gap (years) between peak and retirement. */
  peakMisalignmentYears: number;
  /** Minimum death benefit for a protection component (万円). */
  minimumBenefit: number;
  /** Share of the (inflation-adjusted) retirement target funded in the BALANCED plan. */
  balancedRetirementShare: number;
  /** Third-sector benefit sizing: officer monthly pay × months. */
  thirdSectorMonths: number;
  /** Welfare plan sizing: death benefit per employee (万円). */
  welfarePerEmployee: number;
  /** Protection term: planned retirement age + this many years (at least age + 10). */
  protectionTermExtra: number;
}

export interface CalcResult {
  coverage: {
    methodA: Money;
    methodAParts: { loan: Money; rebuild: Money; taxReserve: Money };
    methodB: Money;
    methodBParts: { workingCapital: Money; repayment: Money; lumpSum: Money };
    adopted: 'A' | 'B';
    businessFund: Money;
    deathRetirement: Money;
    condolence: Money;
    condolenceOnDuty: Money;
    inheritanceExempt: Money;
    required: Money;
    existing: Money;
    gap: Money;
  };
  retirement: {
    yearsToRetire: Money;
    totalTenure: Money;
    multiplier: Money;
    target: Money;
    inflationAdjusted: Money;
    inflationDiff: Money;
    deduction: Money;
    taxable: Money;
    taxOnRetirement: Money;
    taxIfSalary: Money;
    netVsSalary: Money;
    specialOfficer: boolean;
  };
  budget: { min: Money; balanced: Money; max: Money; assumed: boolean };
  ratios: { loanToRevenue: Money; profitMargin: Money | null };
  assumptions: Assumption[];
  asOf: string;
}

export interface Assumption {
  field: string;
  label: string;
  value: number;
  unit: Unit;
  reason: string;
}

export type Tier = 'MIN' | 'BALANCED' | 'MAX';

export interface PremiumEstimate {
  low: Money;
  high: Money;
  mid: Money;
  rateSource: string;
  isSample: boolean;
}

export interface PlanComponent {
  categoryCode: string;
  label: string;
  role: 'protection' | 'retirement' | 'third_sector' | 'welfare' | 'succession';
  deathBenefit: Money;
  termToAge: number;
  purpose: string;
  premiumEstimate: PremiumEstimate | 'DESIGN_SHEET_REQUIRED';
  taxBucket?: 1 | 2 | 3 | 4 | null;
  taxTreatment?: string;
  peakReturnRate?: number | null;
  peakYear?: number | null;
  peakAge?: number | null;
  /** Estimated surrender value at the peak (万円), when a reference rate exists. */
  peakCashValue?: Money | null;
  taxDetail?: {
    summary: string;
    fullyDeductible: boolean;
    assetPeriodYears: number;
    reversalStartYear: number;
    firstYearAsset: number;
    firstYearExpense: number;
    lastYearExpense: number;
    lastYearReversal: number;
  } | null;
}

export interface Plan {
  tier: Tier;
  title: string;
  concept: string;
  components: PlanComponent[];
  coverageRatio: number;
  coverageRatioMoney: Money;
  totalDeathBenefit: Money;
  totalPremium: Money | null;
  budgetCap: Money;
  reducedForBudget: boolean;
  retirementFundRatio: number | null;
  ruleHits: string[];
  notes: string[];
}

export interface PlanSet {
  plans: Plan[];
  categoryScores: Record<string, number>;
  ruleHits: RuleHit[];
  memoPoints: string[];
}

export interface RuleHit {
  id: string;
  name: string;
  rationale: string;
}

/** JSON Logic-like expression. */
export type LogicExpr = unknown;

export interface LogicRuleEffect {
  scores?: Record<string, number>;
  /** Multiply the MIN budget cap by this factor (e.g. 0.8). */
  minBudgetFactor?: number;
  /** Additional components to add to the MAX plan. */
  addToMax?: string[];
  /** Penalize categories whose typical tax bucket is >= this value. */
  penalizeTaxBucketGte?: number;
  /** Add a review point to the sales memo. */
  memoPoint?: string;
  /** Penalize long-term variable plans (R04). */
  penalizeLongVariable?: boolean;
}

export interface LogicRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: LogicExpr;
  effect: LogicRuleEffect;
  rationale: string;
  priority?: number;
}

export interface ReferenceRate {
  category: string;
  sex: 'M' | 'F';
  age: number;
  termToAge: number;
  /** 保険金額1,000万円あたりの年払保険料（万円） */
  annualPremiumPer1000man: number;
  peakReturnRate: number | null;
  peakYear: number | null;
  source: string;
  asOf: string;
  isSample?: boolean;
}

export interface CategoryInfo {
  code: string;
  name: string;
  /** Typical tax bucket, used by R07. */
  typicalTaxBucket?: number | null;
  /** Whether this category is suitable to fund a retirement allowance. */
  retirementFunding?: boolean;
  /** Whether the category is a long-term variable plan (R04). */
  longVariable?: boolean;
}
