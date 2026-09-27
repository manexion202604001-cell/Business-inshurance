import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@p3/engine', '@p3/knowledge', '@p3/compliance', '@p3/llm', '@p3/render', '@p3/pipeline', '@p3/db'],
  serverExternalPackages: ['@prisma/client', 'playwright-core', 'mammoth', 'unpdf'],
  typedRoutes: false,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default config;
