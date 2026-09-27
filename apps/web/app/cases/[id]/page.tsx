import { notFound } from 'next/navigation';
import { HttpError } from '@/lib/api';
import { getCaseFor, toView } from '@/lib/cases';
import { isManager, requireUser } from '@/lib/session';
import { CaseResult } from '@/components/CaseResult';
import { ISSUE_TAG_LABEL } from '@p3/llm';

export const dynamic = 'force-dynamic';

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { run } = await searchParams;
  let view;
  try {
    view = await toView(await getCaseFor(user, id));
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  return <CaseResult initial={view} autoRun={run === '1' && view.status === 'draft'} canApprove={isManager(user)} canSeeInternal={isManager(user)} issueLabels={ISSUE_TAG_LABEL} />;
}
