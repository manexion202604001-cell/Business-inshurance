import { prisma, readDraftKnowledge } from '@p3/db';
import { renderDoc, type DocType } from '@p3/render';
import { apiUser, handle, HttpError } from '@/lib/api';
import { loadCase, renderInputOf } from '@/lib/cases';

/** Template preview: render a generated case with the draft knowledge (branding, disclaimers). */
export const GET = handle(async (req: Request) => {
  await apiUser(['admin']);
  const url = new URL(req.url);
  const type = (url.searchParams.get('type') ?? 'summary') as DocType;
  const caseId = url.searchParams.get('caseId') ?? (await prisma.case.findFirst({ where: { status: { in: ['generated', 'approved', 'presented'] } }, orderBy: { updatedAt: 'desc' }, select: { id: true } }))?.id;
  if (!caseId) throw new HttpError(409, '3案を作成済みの案件がありません');
  const c = await loadCase(caseId);
  if (!c) throw new HttpError(404, '案件が見つかりません');
  const { input } = await renderInputOf(c);
  const draft = await readDraftKnowledge();
  const html = renderDoc(type, { ...input, knowledge: { ...input.knowledge, presentation: draft.presentation, disclaimers: draft.disclaimers } }, { fontBase: '/fonts/noto-serif-jp', preview: true });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});
