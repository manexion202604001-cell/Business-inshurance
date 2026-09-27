import { z } from 'zod';

export const ISSUE_TAGS = ['loan_repayment', 'successor', 'retirement', 'key_person', 'cashflow', 'employee_benefit', 'health', 'inheritance', 'other'] as const;
export type IssueTag = (typeof ISSUE_TAGS)[number];

export const ISSUE_TAG_LABEL: Record<IssueTag, string> = {
  loan_repayment: '借入金の返済',
  successor: '後継者・事業承継',
  retirement: '役員の勇退・退職金',
  key_person: '経営者への依存',
  cashflow: '資金繰り',
  employee_benefit: '従業員の福利厚生・退職金',
  health: '経営者の健康',
  inheritance: '相続',
  other: 'その他',
};

const num = z.number().nullable();

export const ExtractionSchema = z.object({
  companyFacts: z.object({
    revenue: num,
    ordinaryProfit: num,
    netAssets: num,
    loanTotal: num,
    loanShortTerm: num,
    loanMonthlyRepay: num,
    monthlyLabor: num,
    monthlyFixed: num,
    employeeCount: num,
    ceoAge: num,
    monthlyPay: num,
    tenureYears: num,
    plannedRetireAge: num,
    legalHeirs: num,
  }),
  conflicts: z.array(z.object({ field: z.string(), formValue: z.number().nullable(), logValue: z.number().nullable(), quote: z.string() })),
  issues: z.array(z.object({ tag: z.enum(ISSUE_TAGS), summary: z.string(), evidenceQuote: z.string(), confidence: z.number() })),
  interests: z.array(z.string()),
  objections: z.array(z.string()),
  existingPolicies: z.array(z.object({ categoryGuess: z.string(), deathBenefit: num, note: z.string() })),
  smallTalkInsights: z.array(z.string()),
  missingInfo: z.array(z.string()),
  signals: z.object({
    deficitMentioned: z.boolean().nullable(),
    employeeRetirementPrepared: z.boolean().nullable(),
    officerRetirementPrepared: z.boolean().nullable(),
    taxSavingRequested: z.boolean().nullable(),
  }),
});
export type ExtractionCore = z.infer<typeof ExtractionSchema>;
export type Extraction = ExtractionCore & { source: 'llm' | 'rules'; droppedQuotes?: number };

const tier = z.enum(['MIN', 'BALANCED', 'MAX']);

export const PlanNarrativeSchema = z.object({
  tier,
  headline: z.string(),
  whyThisCompany: z.array(z.string()),
  whyThisCompanyRefs: z.array(z.array(z.string())),
  merits: z.array(z.string()),
  cautions: z.array(z.string()),
  fitFor: z.string(),
});
export type PlanNarrative = z.infer<typeof PlanNarrativeSchema>;

export const NarrativeSchema = z.object({
  plans: z.array(PlanNarrativeSchema),
  onePaper: z.object({ title: z.string(), lead: z.string(), closing: z.string() }),
  talkScript: z.object({
    opening: z.string(),
    problemFraming: z.string(),
    planWalkthrough: z.array(z.object({ tier, script: z.string() })),
    closingQuestion: z.string(),
    objectionHandling: z.array(z.object({ objection: z.string(), response: z.string(), backedBy: z.array(z.string()) })),
  }),
  rationaleMemo: z.array(z.string()),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const ReviewSchema = z.object({
  findings: z.array(z.object({ kind: z.enum(['insurer_or_product_name', 'tax_saving_appeal', 'assurance', 'comparison', 'other']), quote: z.string(), reason: z.string() })),
});
export type Review = z.infer<typeof ReviewSchema>;
