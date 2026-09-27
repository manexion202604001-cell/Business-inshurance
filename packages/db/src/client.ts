import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** Find the repository root (directory containing pnpm-workspace.yaml) from the working directory. */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Default to the development SQLite database so that `pnpm dev` works without extra setup.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'file:./dev.db') {
  process.env.DATABASE_URL = `file:${join(repoRoot(), 'prisma', 'dev.db')}`;
}

const g = globalThis as unknown as { __p3prisma?: PrismaClient };
export const prisma: PrismaClient = g.__p3prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__p3prisma = prisma;
