import { NextResponse } from 'next/server';
import { apiUser, handle, HttpError } from '@/lib/api';
import { fileToText } from '@/lib/files';

export const POST = handle(async (req: Request) => {
  await apiUser();
  const fd = await req.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'ファイルを選択してください');
  if (file.size > 10 * 1024 * 1024) throw new HttpError(413, 'ファイルが大きすぎます（10MBまで）');
  const text = await fileToText(file.name, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ text, name: file.name });
});
