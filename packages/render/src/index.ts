import { buildReport, checkDisclaimers, checkSections, type ComplianceIssue, type ComplianceReport } from '@p3/compliance';
import { documentDisclaimers } from './common';
import { renderDesignSheet } from './design';
import { renderMemo } from './memo';
import { renderSlides } from './slides';
import { renderSummary } from './summary';
import type { DocType, RenderInput, RenderOptions } from './types';

export * from './common';
export * from './fonts';
export * from './pdf';
export * from './types';
export { renderDesignSheet, renderMemo, renderSlides, renderSummary };

export function renderDoc(type: DocType, input: RenderInput, opts: RenderOptions): string {
  switch (type) {
    case 'summary':
      return renderSummary(input, opts);
    case 'design':
      return renderDesignSheet(input, opts);
    case 'memo':
      return renderMemo(input, opts);
    case 'slides':
      return renderSlides(input, opts);
  }
}

/** Visible text of an HTML document (scripts/styles removed, tags stripped, entities decoded). */
export function htmlToText(html: string): string {
  return html
    .replace(/<section data-internal-refs>[\s\S]*?<\/section>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

/**
 * Pre-output scan of a rendered document (masking, banned phrases, mandatory disclaimers).
 * Customer documents are fail-closed: any error blocks display and PDF output.
 */
export function scanRendered(type: DocType, html: string, input: RenderInput): ComplianceReport {
  const text = htmlToText(html);
  const issues: ComplianceIssue[] = checkSections([{ id: `render.${type}`, label: type, text, audience: type === 'memo' ? 'internal' : 'customer' }], input.knowledge, null);
  if (type !== 'memo') issues.push(...checkDisclaimers(text, documentDisclaimers(input), `render.${type}`));
  return buildReport(issues);
}
