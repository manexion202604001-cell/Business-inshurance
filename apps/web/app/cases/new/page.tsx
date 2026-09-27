import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma, repoRoot } from '@p3/db';
import { INDUSTRIES, type CaseForm } from '@p3/pipeline';
import { requireUser, isManager } from '@/lib/session';
import { CaseFormEditor } from '@/components/CaseFormEditor';

export const dynamic = 'force-dynamic';

function samples(): { id: string; title: string; form: CaseForm }[] {
  const dir = join(repoRoot(), 'fixtures', 'cases');
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => {
        const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return { id: j.id, title: j.title, form: { company: j.company, officer: j.officer, existingPolicies: j.existingPolicies, rawLog: j.rawLog } };
      });
  } catch {
    return [];
  }
}

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const { from } = await searchParams;
  let initial: CaseForm | null = null;
  if (from) {
    const c = await prisma.case.findUnique({ where: { id: from } });
    if (c && (c.ownerId === user.id || isManager(user))) {
      initial = { ...(c.form as unknown as CaseForm), rawLog: '' };
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-navy">{initial ? '案件を複製して作成' : '新規案件'}</h1>
      <CaseFormEditor initial={initial} industries={INDUSTRIES} samples={samples()} />
    </div>
  );
}
