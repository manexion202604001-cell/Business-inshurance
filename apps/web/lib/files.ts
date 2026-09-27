import 'server-only';
import { stripSubtitles } from '@p3/pipeline';
import { HttpError } from './api';

/** Convert an uploaded meeting log (.txt .md .vtt .srt .docx .pdf) to plain text. */
export async function fileToText(name: string, buf: Buffer): Promise<string> {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['txt', 'md', 'csv', 'log'].includes(ext)) return decode(buf);
  if (ext === 'vtt' || ext === 'srt') return stripSubtitles(decode(buf)).trim();
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value.trim();
  }
  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).trim();
  }
  throw new HttpError(415, `未対応のファイル形式です（.${ext}）。txt / md / vtt / srt / docx / pdf に対応しています`);
}

function decode(buf: Buffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  try {
    return new TextDecoder('shift_jis').decode(buf);
  } catch {
    return utf8;
  }
}
