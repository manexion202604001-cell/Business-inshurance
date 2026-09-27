import { readFileSync } from 'node:fs';
import { extractWithRules } from '../packages/llm/src/extract-rules';
for (const id of process.argv.slice(2)) {
  const f = JSON.parse(readFileSync(`fixtures/cases/${id}.json`, 'utf8'));
  const ex = extractWithRules(f.rawLog, { company: f.company, officer: f.officer, existingPolicies: f.existingPolicies });
  console.log(id, JSON.stringify({ facts: ex.companyFacts, conflicts: ex.conflicts, tags: ex.issues.map((i) => i.tag), ex: ex.existingPolicies, sig: ex.signals, obj: ex.objections, int: ex.interests, miss: ex.missingInfo }, null, 0));
}
