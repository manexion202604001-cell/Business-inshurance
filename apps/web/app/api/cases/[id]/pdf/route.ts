import { audit } from '@p3/db';
import { htmlToPdf, PDF_FONT_BASE, renderDoc, scanRendered, type DocType } from '@p3/render';
import { apiUser, handle, HttpError } from '@/lib/api';
import { assertPresentable, getCaseFor, renderInputOf } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TYPES: DocType[] = ['summary', 'design', 'memo'];
const NAME: Record<string, string> = { summary: 'サマリー', design: '設計書型', memo: '営業メモ_社内用' };

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const type = new URL(req.url).searchParams.get('type') as DocType;
  if (!TYPES.includes(type)) throw new HttpError(400, '不正な資料種別です');
  const c = await getCaseFor(user, (await params).id);
  const { input, knowledge } = await renderInputOf(c);
  assertPresentable(c, knowledge, type);
  const html = renderDoc(type, input, { fontBase: PDF_FONT_BASE });
  const scan = scanRendered(type, html, input);
  if (scan.status === 'blocked') throw new HttpError(423, 'PDF化の直前チェックで問題が見つかったため出力をブロックしました', scan.issues);
  const pdf = await htmlToPdf(html, { landscape: type === 'summary' });
  await audit(user.email, 'export_pdf', { type, bytes: pdf.length }, c.id);
  const filename = `${input.company.name}_${NAME[type]}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="proposal-${type}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'cache-control': 'no-store',
    },
  });
});
