import { prisma } from '@p3/db';
import { requireUser } from '@/lib/session';
import { AdminKnowledge } from '@/components/AdminKnowledge';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  await requireUser(['admin']);
  const cases = await prisma.case.findMany({
    where: { status: { in: ['generated', 'approved', 'presented', 'blocked'] } },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { id: true, company: { select: { name: true } } },
  });
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-navy">ナレッジ管理</h1>
      <p className="text-sm text-slate-600">編集内容は「編集中」の下書きに保存されます。「版の公開」で新しい版を公開すると、以降の生成に反映されます（作成済みの案件は作成時の版のまま表示されます）。</p>
      <AdminKnowledge cases={cases.map((c) => ({ id: c.id, name: c.company.name }))} />
    </div>
  );
}
