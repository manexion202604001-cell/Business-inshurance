import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import type { z } from 'zod';
import type { LlmConfig } from './config';
import { knowledgeBlock, SYSTEM_BASE } from './prompts';

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ms: number;
}

let cached: { key: string; client: Anthropic } | null = null;

export function getClient(cfg: LlmConfig): Anthropic {
  const key = `${cfg.timeoutMs}:${cfg.maxRetries}`;
  if (!cached || cached.key !== key) cached = { key, client: new Anthropic({ timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries }) };
  return cached.client;
}

/** Test hook: replace the client (e.g. with a fake). */
export function setClientForTests(client: Anthropic | null) {
  cached = client ? { key: 'test', client } : null;
}

/**
 * One structured-output call. The knowledge block is the first system block with cache_control so
 * repeated generations share the cached prefix.
 */
export async function structuredCall<S extends z.ZodType>(params: {
  cfg: LlmConfig;
  model: string;
  knowledge: KnowledgeSnapshot;
  schema: S;
  user: string;
  temperature: number;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
  const client = getClient(params.cfg);
  const started = Date.now();
  const isHaiku = /haiku/.test(params.model);
  const response = await client.messages.parse({
    model: params.model,
    max_tokens: params.maxTokens ?? 16000,
    system: [
      { type: 'text', text: `${SYSTEM_BASE}\n\n${knowledgeBlock(params.knowledge)}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: params.user }],
    // Sampling parameters are only accepted by older/Haiku models; newer models use effort instead.
    ...(isHaiku ? { temperature: params.temperature } : {}),
    output_config: {
      format: zodOutputFormat(params.schema),
      ...(isHaiku ? {} : { effort: 'low' as const }),
    },
  });
  if (response.stop_reason === 'refusal') throw new Error('LLM refused the request');
  if (response.stop_reason === 'max_tokens') throw new Error('LLM output was truncated (max_tokens)');
  if (response.parsed_output == null) throw new Error('LLM output did not match the schema');
  const u = response.usage;
  return {
    data: response.parsed_output as z.infer<S>,
    usage: {
      model: params.model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      ms: Date.now() - started,
    },
  };
}
