import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**/*.ts', 'packages/compliance/src/**/*.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
