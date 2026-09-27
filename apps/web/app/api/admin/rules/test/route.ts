import { NextResponse } from 'next/server';
import { prisma, readDraftKnowledge } from '@p3/db';
import { buildFacts, calculate, evaluateRules, runEngine, type CaseInput, type LogicRule } from '@p3/engine';
import { toCategoryInfo, toEngineKnowledge } from '@p3/knowledge';
import { apiUser, handle, HttpError } from '@/lib/api';

/** Test a (possibly unsaved) rule against a generated case: does it fire, and how do the plans change? */
export const POST = handle(async (req: Request) => {
  await apiUser(['admin']);
  const body = (await req.json().catch(() => ({}))) as { rule?: LogicRule; caseId?: string };
  if (!body.rule || !body.caseId) throw new HttpError(400, 'rule と caseId を指定してください');
  const c = await prisma.case.findUnique({ where: { id: body.caseId } });
  if (!c?.engineInput) throw new HttpError(409, '3案を作成済みの案件を選んでください');
  const input = c.engineInput as unknown as CaseInput;
  const draft = await readDraftKnowledge();
  const ek = toEngineKnowledge(draft);
  const calc = calculate(input, ek.settings);
  const facts = buildFacts(input, calc, toCategoryInfo(draft), ek.settings);
  const rule = { ...body.rule, enabled: true };
  const single = evaluateRules([rule], facts, ek.categories);
  const others = ek.rules.filter((r) => r.id !== rule.id);
  const before = runEngine(input, { ...ek, rules: others });
  const after = runEngine(input, { ...ek, rules: [...others, rule] });
  const summary = (o: typeof before) => o.planSet.plans.map((p) => ({ tier: p.tier, title: p.title, components: p.components.map((x) => `${x.label} ${x.deathBenefit.value}万円`), ratio: p.coverageRatioMoney.value }));
  return NextResponse.json({
    matched: single.hits.length > 0,
    errors: single.errors,
    hit: single.hits[0] ?? null,
    facts,
    before: summary(before),
    after: summary(after),
  });
});
