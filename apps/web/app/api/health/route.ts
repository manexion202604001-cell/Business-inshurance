import { NextResponse } from 'next/server';
import { llmConfig } from '@p3/llm';

export function GET() {
  const cfg = llmConfig();
  return NextResponse.json({ ok: true, llm: { enabled: cfg.enabled, reason: cfg.reason } });
}
