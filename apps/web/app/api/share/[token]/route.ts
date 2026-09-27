import { audit, prisma } from '@p3/db';
import { renderDoc, scanRendered, type DocType } from '@p3/render';
import { apiUser, handle, HttpError } from '@/lib/api';
import { assertPresentable, loadCase, renderInputOf } from '@/lib/cases';
import { blockedPage } from '@/lib/blocked';

export const GET = handle(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const user = await apiUser();
  const token = (await params).token;
  const type = (new URL(req.url).searchParams.get('type') ?? 'summary') as DocType;
  if (!['summary', 'design', 'slides'].includes(type)) throw new HttpError(400, '不正な資料種別です');
  const row = await prisma.case.findUnique({ where: { shareToken: token }, select: { id: true, shareExpiresAt: true } });
  if (!row || !row.shareExpiresAt || row.shareExpiresAt < new Date()) throw new HttpError(404, '共有リンクが無効か期限切れです');
  const c = (await loadCase(row.id))!;
  const { input, knowledge } = await renderInputOf(c);
  try {
    assertPresentable(c, knowledge, type);
  } catch (e) {
    if (e instanceof HttpError) return blockedPage(e.message, []);
    throw e;
  }
  const html = renderDoc(type, input, { fontBase: '/fonts/noto-serif-jp', preview: true });
  const scan = scanRendered(type, html, input);
  if (scan.status === 'blocked') return blockedPage('出力前チェックで問題が見つかったため表示をブロックしました', scan.issues.map((i) => i.message));
  await audit(user.email, 'view_share', { type }, c.id);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});
