/**
 * Data retention: delete cases (and orphaned companies) older than presentation.retentionDays
 * (default 365). Run periodically, e.g. from cron:  pnpm retention [--dry-run]
 */
import { audit, getActiveKnowledge, prisma } from '../packages/db/src';

async function main() {
  const dry = process.argv.includes('--dry-run');
  const k = await getActiveKnowledge();
  const days = k.presentation.retentionDays ?? 365;
  const cutoff = new Date(Date.now() - days * 86400000);
  const old = await prisma.case.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, companyId: true } });
  console.log(`${old.length} case(s) older than ${days} days (before ${cutoff.toISOString()})${dry ? ' [dry-run]' : ''}`);
  if (dry || old.length === 0) return;
  await prisma.case.deleteMany({ where: { id: { in: old.map((c) => c.id) } } });
  const orphan = await prisma.company.findMany({ where: { cases: { none: {} } }, select: { id: true } });
  await prisma.company.deleteMany({ where: { id: { in: orphan.map((c) => c.id) } } });
  await audit('system', 'retention_delete', { cases: old.length, companies: orphan.length, days });
}

main().finally(() => prisma.$disconnect());
