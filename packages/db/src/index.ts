import type { Prisma } from '@prisma/client';
import { prisma } from './client';

export * from './client';
export * from './knowledge';
export * from './password';
export type { Prisma } from '@prisma/client';

export async function audit(actor: string, action: string, payload?: unknown, caseId?: string | null): Promise<void> {
  await prisma.auditEvent.create({ data: { actor, action, payload: (payload ?? {}) as Prisma.InputJsonValue, caseId: caseId ?? null } });
}
