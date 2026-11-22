/**
 * LEDGER EXPORT - sourced data only
 *
 * Two CSVs: the institution list (real FDIC Summary of Deposits figures) and the live
 * OSINT events this session matched to institutions (each with its publisher, timestamp
 * and URL as published). Nothing generated is exported, because nothing generated is
 * shown any more.
 */

import type { FinancialInstitution } from '../data/georgiaFinancialInstitutions.ts';
import { FINANCIAL_SOURCE } from '../data/georgiaFinancialInstitutions.ts';

export interface SourcedEvent {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  source: string;
  ts: string;
  url: string;
}

function cell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One row per institution, real FDIC figures only. */
export function exportInstitutions(institutions: FinancialInstitution[]): number {
  const rows: Array<Array<string | number>> = [
    [
      `# Georgia financial institutions | institution, county, branch and deposit figures: ${FINANCIAL_SOURCE.institutionData} (${FINANCIAL_SOURCE.surveyYear}); coordinates derived from U.S. Census county boundaries`,
    ],
    ['Institution', 'Primary market county', 'Counties served', 'GA branches', 'GA branch deposits USD', 'Primary county FIPS'],
  ];
  for (const inst of institutions) {
    rows.push([
      inst.name,
      inst.primary.name,
      inst.countyCount,
      inst.branches,
      inst.depositsUsd,
      inst.primary.fips,
    ]);
  }
  download(`georgia-institutions-${institutions.length}.csv`, toCsv(rows));
  return institutions.length;
}

/** One row per live OSINT event, exactly as the publisher reported it. */
export function exportEvents(events: SourcedEvent[], label: string): number {
  const rows: Array<Array<string | number>> = [
    [
      `# Live OSINT events | headline, publisher, timestamp and URL are as published by the source; no field is generated or inferred`,
    ],
    ['Event ID', 'Matched institution', 'Severity', 'Headline', 'Publisher', 'Published', 'URL'],
  ];
  for (const event of events) {
    rows.push([
      event.id,
      event.institutionName ?? 'unattributed',
      event.severity,
      event.title,
      event.source,
      event.ts,
      event.url,
    ]);
  }
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  download(`${slug}-live-events-${events.length}.csv`, toCsv(rows));
  return events.length;
}
