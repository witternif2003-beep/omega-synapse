/**
 * LEDGER EXPORT
 *
 * CSV builders for the financial espionage section. Everything exported is exactly
 * what the screen shows: real FDIC institution figures where the column says so, and
 * the generated demo records marked as demo in the file's own header row and in a
 * leading comment line.
 */

import type { FinancialInstitution } from '../data/georgiaFinancialInstitutions.ts';
import { FINANCIAL_SOURCE } from '../data/georgiaFinancialInstitutions.ts';
import { LEDGER_SIZE, metricsFor, timeAgoLabel, type AnomalyRecord } from './financialForensics.ts';

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

const sourceLine = (subject: string) =>
  `# ${subject} | institution, county, branch and deposit figures: ${FINANCIAL_SOURCE.institutionData} (${FINANCIAL_SOURCE.surveyYear}); anomaly, account, login and metric values: generated demo records, not observations of any institution`;

/** One row per institution, with its real FDIC figures and its ledger record count. */
export function exportInstitutions(institutions: FinancialInstitution[], counts: Map<string, number>): number {
  const rows: Array<Array<string | number>> = [
    [sourceLine('Georgia financial institutions')],
    ['Institution', 'Primary market county', 'Counties served', 'GA branches', 'GA branch deposits USD', 'Ledger records (demo)'],
  ];
  for (const inst of institutions) {
    rows.push([
      inst.name,
      inst.primary.name,
      inst.countyCount,
      inst.branches,
      inst.depositsUsd,
      counts.get(inst.id) ?? 0,
    ]);
  }
  download(`georgia-institutions-${institutions.length}.csv`, toCsv(rows));
  return institutions.length;
}

const METRIC_KEYS = [
  'deposit-exposure',
  'exposure-ratio',
  'wire-velocity',
  'wire-at-risk',
  'ach-return',
  'ach-exceptions',
  'settlement-latency',
  'duplicate-payments',
  'dormant-reactivation',
  'cnp-velocity',
  'callback-failures',
  'privileged-offwindow',
  'mfa-failures',
  'session-anomalies',
  'sanctions-hits',
  'nsf-spike',
  'rate-sensitivity',
  'lcr-shift',
  'collateral-gap',
  'recon-breaks',
] as const;

/** One row per anomaly record, with all 20 metrics as their own columns. */
export function exportRecords(
  institution: FinancialInstitution,
  records: AnomalyRecord[],
): number {
  const sample = records.length ? metricsFor(institution, records[0].id) : [];
  const metricLabels = METRIC_KEYS.map(
    (key) => sample.find((metric) => metric.key === key)?.label ?? key,
  );

  const header = [
    'Record ID',
    'Institution',
    'Primary market county',
    'Severity',
    'Archetype',
    'Title',
    'Vector',
    'Age',
    'Systems',
    'Logins',
    'Accounts',
    ...metricLabels,
  ];

  const rows: Array<Array<string | number>> = [
    [sourceLine(`${institution.name} ledger records`)],
    [sourceLine('DEMO RECORDS - fabricated scenarios, not intrusions or claims about any bank, account or person')],
    header,
  ];

  for (const record of records) {
    const metrics = metricsFor(institution, record.id);
    rows.push([
      record.id,
      institution.name,
      institution.primary.name,
      record.severity,
      record.archetype,
      record.title,
      record.vector,
      timeAgoLabel(record.offsetMinutes),
      record.systems.join(' | '),
      record.logins.join(' | '),
      record.accounts.join(' | '),
      ...METRIC_KEYS.map((key) => metrics.find((m) => m.key === key)?.display ?? ''),
    ]);
  }

  const slug = institution.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  download(`${slug}-ledger-${records.length}-of-${LEDGER_SIZE}.csv`, toCsv(rows));
  return records.length;
}
