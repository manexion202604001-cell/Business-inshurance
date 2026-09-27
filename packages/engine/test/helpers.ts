import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseInput, CaseSignals } from '../src';

export interface Fixture {
  id: string;
  company: CaseInput['company'];
  officer: CaseInput['officer'];
  existingPolicies: CaseInput['existingPolicies'];
  rawLog: string;
}

export function loadFixture(id: string): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases', `${id}.json`), 'utf8')) as Fixture;
}

export function toInput(f: Fixture, signals: Partial<CaseSignals> = {}): CaseInput {
  return {
    company: f.company,
    officer: f.officer,
    existingPolicies: f.existingPolicies,
    signals: { issueTags: [], ...signals },
  };
}
