import { apiUser, HttpError } from '@/lib/api';
import { generateCase, getCaseFor } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/** Server-Sent Events: streams step progress while Steps 1–7 run. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user;
  try {
    user = await apiUser();
    await getCaseFor(user, id);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'error' }), { status, headers: { 'content-type': 'application/json' } });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 10000);
      try {
        const r = await generateCase(user, id, (e) => send('progress', e));
        send('done', { status: r.compliance.status, totalMs: r.metrics.totalMs, narrative: r.narrativeMeta.source });
      } catch (e) {
        send('failure', { error: e instanceof Error ? e.message : String(e) });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}
