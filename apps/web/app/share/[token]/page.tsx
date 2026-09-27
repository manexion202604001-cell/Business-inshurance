import { notFound } from 'next/navigation';
import { prisma } from '@p3/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Internal share link: requires sign-in, expires, shows customer documents only. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await requireUser();
  const { token } = await params;
  const c = await prisma.case.findUnique({ where: { shareToken: token }, include: { company: true } });
  if (!c || !c.shareExpiresAt || c.shareExpiresAt < new Date()) notFound();
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-navy">{c.company.name}様 ご提案資料（共有）</h1>
      <p className="text-xs text-slate-500">有効期限：{c.shareExpiresAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      <iframe title="サマリー" src={`/api/share/${token}?type=summary`} className="h-[80vh] w-full rounded border border-slate-200" />
      <a className="text-sm text-navy underline" href={`/api/share/${token}?type=design`} target="_blank">
        設計書型を開く
      </a>
    </div>
  );
}
