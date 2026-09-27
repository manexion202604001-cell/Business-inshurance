import { NextResponse } from 'next/server';
import { audit, prisma, type Prisma } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';
import { CaseFormSchema } from '@/lib/schemas';

export const POST = handle(async (req: Request) => {
  const user = await apiUser();
  const parsed = CaseFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, '入力内容を確認してください', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const f = parsed.data;
  const company = await prisma.company.create({
    data: {
      ownerId: user.id,
      ...f.company,
      officers: { create: [{ ...f.officer, guaranteesLoan: Boolean(f.officer.guaranteesLoan) }] },
      policies: { create: f.existingPolicies.map((p) => ({ ...p })) },
    },
  });
  const c = await prisma.case.create({
    data: { companyId: company.id, ownerId: user.id, rawLog: f.rawLog, form: f as unknown as Prisma.InputJsonValue, status: 'draft' },
  });
  await audit(user.email, 'create_case', { company: f.company.name }, c.id);
  return NextResponse.json({ id: c.id });
});
