/**
 * Seed: users, knowledge tables (from packages/knowledge/seed) and the first published version,
 * plus the three fixture cases as drafts for the sales user.
 *   pnpm db:reset && pnpm db:seed
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSeedKnowledge, SEED_VERSION } from '../packages/knowledge/src';
import { hashPassword, prisma, writeKnowledgeTables, type Prisma } from '../packages/db/src';

const USERS = [
  { email: 'sales@example.com', name: '営業 太郎', role: 'sales' },
  { email: 'manager@example.com', name: '管理 花子', role: 'manager' },
  { email: 'admin@example.com', name: '管理者 一郎', role: 'admin' },
];
const PASSWORD = process.env.P3_SEED_PASSWORD ?? 'password';

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({ where: { email: u.email }, update: { name: u.name, role: u.role }, create: { ...u, passwordHash: hashPassword(PASSWORD) } });
  }
  const k = loadSeedKnowledge();
  await writeKnowledgeTables(k);
  await prisma.knowledgeVersion.upsert({
    where: { id: SEED_VERSION },
    update: {},
    create: { id: SEED_VERSION, label: k.label, snapshot: k as unknown as Prisma.InputJsonValue, publishedAt: new Date(k.publishedAt), publishedBy: 'seed' },
  });

  const sales = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@example.com' } });
  const dir = join(import.meta.dirname, '..', 'fixtures', 'cases');
  const existing = await prisma.case.count();
  if (existing === 0) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const fx = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const company = await prisma.company.create({
        data: {
          ownerId: sales.id,
          ...fx.company,
          officers: { create: [fx.officer] },
          policies: { create: fx.existingPolicies.map((p: Record<string, unknown>) => ({ ...p })) },
        },
      });
      await prisma.case.create({
        data: {
          companyId: company.id,
          ownerId: sales.id,
          rawLog: fx.rawLog,
          form: { company: fx.company, officer: fx.officer, existingPolicies: fx.existingPolicies, rawLog: fx.rawLog } as Prisma.InputJsonValue,
          status: 'draft',
        },
      });
    }
  }
  console.log(`seeded: ${USERS.length} users (password: ${PASSWORD}), knowledge ${SEED_VERSION}, cases ${await prisma.case.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
