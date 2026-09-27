import Link from 'next/link';
import { prisma } from '@p3/db';
import { formatMan, type CalcResult } from '@p3/engine';
import { requireUser, isManager } from '@/lib/session';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CasesPage() {
  const user = await requireUser();
  const cases = await prisma.case.findMany({
    where: isManager(user) ? {} : { ownerId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { company: { select: { name: true, industry: true } }, owner: { select: { name: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-navy">案件一覧</h1>
        <Link href="/cases/new" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-bold text-white shadow" data-testid="new-case">
          ＋ 新規作成
        </Link>
      </div>
      {cases.length === 0 && <p className="text-sm text-slate-600">まだ案件がありません。「新規作成」から始めてください。</p>}
      <ul className="space-y-2">
        {cases.map((c) => {
          const calc = c.calc as unknown as CalcResult | null;
          return (
            <li key={c.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 p-3">
                <Link href={`/cases/${c.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <span className="truncate font-semibold">{c.company.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {c.updatedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    {isManager(user) && <> ／ 担当 {c.owner.name}</>}
                    {calc && <> ／ 必要保障額 {formatMan(calc.coverage.required.value)}・不足額 {formatMan(calc.coverage.gap.value)}</>}
                  </div>
                </Link>
                <Link href={`/cases/new?from=${c.id}`} className="shrink-0 rounded px-2 py-2 text-xs text-navy hover:bg-slate-100">
                  複製
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
