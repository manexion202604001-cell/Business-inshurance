import { audit } from '@p3/db';
import { renderDoc, scanRendered, type DocType } from '@p3/render';
import { apiUser, handle, HttpError } from '@/lib/api';
import { assertPresentable, getCaseFor, renderInputOf } from '@/lib/cases';
import { isManager } from '@/lib/session';
import { blockedPage } from '@/lib/blocked';

const TYPES: DocType[] = ['summary', 'design', 'memo', 'slides'];

/** HTML preview of a document (fonts served from /fonts). Rendered text is re-scanned before display. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const url = new URL(req.url);
  const type = url.searchParams.get('type') as DocType;
  if (!TYPES.includes(type)) throw new HttpError(400, '不正な資料種別です');
  const c = await getCaseFor(user, (await params).id);
  const { input, knowledge } = await renderInputOf(c);
  try {
    assertPresentable(c, knowledge, type);
  } catch (e) {
    if (e instanceof HttpError) return blockedPage(e.message, []);
    throw e;
  }
  const internal = url.searchParams.get('internal') === '1' && isManager(user);
  const html = renderDoc(type, input, { fontBase: '/fonts/noto-serif-jp', preview: true, showInternalRefs: internal });
  const scan = scanRendered(type, html, input);
  if (scan.status === 'blocked') return blockedPage('出力前チェックで問題が見つかったため表示をブロックしました', scan.issues.map((i) => i.message));
  if (type === 'slides') await audit(user.email, 'present_slides', {}, c.id);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' } });
});
