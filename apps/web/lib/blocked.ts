import 'server-only';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** HTML shown in place of a document whose output was blocked (fail-closed). */
export function blockedPage(message: string, issues: string[]): Response {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>出力ブロック</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;color:#7a1a12;background:#fff5f4"><h1 style="font-size:18px">⛔ ${esc(message)}</h1>${issues.length ? `<ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}<p style="color:#555">該当箇所を修正して再生成してください。</p></body></html>`;
  return new Response(html, { status: 423, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
