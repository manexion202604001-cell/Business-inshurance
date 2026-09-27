import { z } from 'zod';

const num = z.number().finite();
const opt = num.nullable().optional();

export const CaseFormSchema = z.object({
  company: z.object({
    name: z.string().min(1, '会社名を入力してください'),
    industry: z.string().min(1),
    fiscalMonth: z.number().int().min(1).max(12).nullable().optional(),
    revenue: num.positive('年商を入力してください'),
    ordinaryProfit: opt,
    netAssets: opt,
    loanTotal: num.min(0),
    loanShortTerm: opt,
    loanMonthlyRepay: opt,
    monthlyLabor: opt,
    monthlyFixed: opt,
    employeeCount: z.number().int().min(0),
  }),
  officer: z.object({
    role: z.enum(['会長', '社長', '専務', '常務', '取締役']),
    age: z.number().int().min(18).max(100),
    sex: z.enum(['M', 'F']),
    monthlyPay: num.positive('役員報酬月額を入力してください'),
    tenureYears: z.number().int().min(0).max(70),
    plannedRetireAge: z.number().int().min(30).max(100).nullable().optional(),
    legalHeirs: z.number().int().min(0).max(20).nullable().optional(),
    guaranteesLoan: z.boolean().optional(),
  }),
  existingPolicies: z.array(
    z.object({
      category: z.string(),
      purpose: z.string().nullable().optional(),
      deathBenefit: opt,
      annualPremium: opt,
      issueAge: opt,
      maturityAge: opt,
      peakReturnRate: opt,
      peakYear: opt,
      note: z.string().nullable().optional(),
    }),
  ),
  rawLog: z.string().max(200000),
  onDutyDeath: z.boolean().optional(),
});
