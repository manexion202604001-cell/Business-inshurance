export interface LlmConfig {
  enabled: boolean;
  reason: string;
  mainModel: string;
  fastModel: string;
  timeoutMs: number;
  maxRetries: number;
  /** Run the 3 plan narratives as parallel calls instead of a single call. */
  parallel: boolean;
}

/**
 * LLM usage is decided from the environment:
 * - P3_LLM_MODE=off  -> never call the API (deterministic template mode)
 * - P3_LLM_MODE=on   -> always call (fails if credentials are missing)
 * - otherwise (auto) -> call only when ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is set
 */
export function llmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const mode = (env.P3_LLM_MODE ?? 'auto').toLowerCase();
  const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const enabled = mode === 'on' || (mode !== 'off' && hasKey);
  return {
    enabled,
    reason: mode === 'off' ? 'P3_LLM_MODE=off' : enabled ? 'LLM有効' : 'APIキー未設定のため定型文モード',
    mainModel: env.ANTHROPIC_MODEL_MAIN || 'claude-sonnet-5',
    fastModel: env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001',
    timeoutMs: Number(env.P3_LLM_TIMEOUT_MS || 45000),
    maxRetries: 2,
    parallel: env.P3_LLM_PARALLEL === '1',
  };
}
