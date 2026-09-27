import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { getCaseFor } from '@/lib/cases';
import { HttpError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Full-screen web slides for showing the customer (the sales memo is never included). */
export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  try {
    await getCaseFor(user, id);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  return (
    <div className="fixed inset-0 z-50 bg-[#10182b]">
      <iframe title="ご提案スライド" src={`/api/cases/${id}/doc?type=slides`} className="h-full w-full border-0" allow="fullscreen" />
      <Link href={`/cases/${id}`} className="fixed left-3 top-3 rounded bg-white/80 px-3 py-2 text-xs text-navy">
        ✕ 閉じる
      </Link>
    </div>
  );
}
