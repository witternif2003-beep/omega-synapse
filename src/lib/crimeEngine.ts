/**
 * FINANCIAL CRIME ANOMALY ENGINE — SHARED TYPES AND ARITHMETIC
 *
 * Every incident the engine emits is computed from a published field: a Form 4 line
 * (owner, code, shares, price, holdings after, direct/indirect, nature, dates, 10b5-1
 * flag) or an FDIC call-report figure. Nothing is invented, and no account number, wire,
 * login, credential, MAC address or IP address is used or shown, because no public record
 * publishes one for these banks or people.
 *
 * The screens themselves live in crimeScreensPersonA.ts, crimeScreensPersonB.ts,
 * crimeInstitutions.ts, crimeInstitutionsB.ts and crimeRecords.ts so each module stays
 * small; this file holds the types and the arithmetic they share.
 *
 * Each incident carries four things the panel shows in full:
 *
 *   amountUsd     the dollar figure, and amountBasis saying exactly what it is
 *   methodology   formula, inputs, threshold and the reverse-engineering note — how the
 *                 figure is recovered from the published fields, so it can be recomputed
 *   details       the incident facts (dates, codes, holdings, flag state)
 *   patterns      the recognition codes that matched, with their definitions
 *
 * The pattern set is a derivation over published disclosures. The FBI has not published
 * an indicator or transfer-pattern list, so no incident here is described as an FBI finding
 * or as a confirmed crime: each is a screen that flagged, with its threshold printed.
 */

import type { PersonView } from './financialIndicators.ts';
import type { InsiderFiling } from '../data/insiderFilings.ts';
import type { OsintTransaction } from './osintClient.ts';

export type CrimeFamily =
  | 'INSIDER_TRADING'
  | 'INSIDER_DISCLOSURE'
  | 'ASSET_QUALITY'
  | 'CAPITAL'
  | 'EARNINGS'
  | 'FUNDING'
  | 'GOVERNANCE'
  | 'FRAUD'
  | 'AML'
  | 'ENFORCEMENT'
  | 'CYBER'
  | 'MARKET';

export const CRIME_FAMILIES: Array<{ key: CrimeFamily; label: string; color: string; note: string }> = [
  {
    key: 'INSIDER_TRADING',
    label: 'Insider trading conduct',
    color: '#f87171',
    note: 'sale timing, plan coverage, exercise-and-sell, round trips',
  },
  {
    key: 'INSIDER_DISCLOSURE',
    label: 'Insider disclosure',
    color: '#fb923c',
    note: 'late Form 4, gifts, indirect control, zero-price lines',
  },
  {
    key: 'ASSET_QUALITY',
    label: 'Asset quality & reserves',
    color: '#fbbf24',
    note: 'noncurrent loans against the allowance and past-due buckets',
  },
  { key: 'CAPITAL', label: 'Capital adequacy', color: '#a3e635', note: 'equity, equity trend, leverage' },
  { key: 'EARNINGS', label: 'Earnings quality', color: '#34d399', note: 'losses, provision against income' },
  { key: 'FUNDING', label: 'Funding & liquidity', color: '#22d3ee', note: 'brokered and non-core funding' },
  { key: 'GOVERNANCE', label: 'Governance & control', color: '#818cf8', note: 'insider selling into weakness, clustering' },
  { key: 'FRAUD', label: 'Fraud & misappropriation', color: '#f43f5e', note: 'publisher alleges or charges fraud' },
  { key: 'AML', label: 'AML, KYC & sanctions', color: '#e879f9', note: 'laundering, structuring, sanctions exposure' },
  { key: 'ENFORCEMENT', label: 'Enforcement & supervision', color: '#c084fc', note: 'orders, penalties, formal actions' },
  { key: 'CYBER', label: 'Cyber-financial intrusion', color: '#60a5fa', note: 'breach, ransomware, exfiltration' },
  { key: 'MARKET', label: 'Market & disclosure conduct', color: '#94a3b8', note: 'restatement, material weakness, market abuse' },
];

export const FAMILY_BY_KEY: Record<CrimeFamily, (typeof CRIME_FAMILIES)[number]> = CRIME_FAMILIES.reduce(
  (acc, family) => {
    acc[family.key] = family;
    return acc;
  },
  {} as Record<CrimeFamily, (typeof CRIME_FAMILIES)[number]>,
);

export type CrimeSeverity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_RANK: Record<CrimeSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const SEVERITY_COLOR: Record<CrimeSeverity, string> = {
  critical: '#f44336',
  high: '#ff9800',
  medium: '#ffd54f',
  low: '#4ade80',
};

export interface CrimeStep {
  label: string;
  detail: string;
}

export interface CrimeEvidence {
  label: string;
  value: string;
  url?: string;
}

export interface CrimeIncident {
  /** Stable across refreshes so the queue recognises an incident it has already shown. */
  id: string;
  /** When this browser first saw the incident; the queue clock starts here. */
  detectedAt: string;
  family: CrimeFamily;
  /** Pattern code that raised the incident, e.g. INS-LATE-02. */
  patternId: string;
  title: string;
  subject: string;
  subjectKind: 'individual' | 'institution' | 'record';
  institution: string;
  amountUsd: number | null;
  amountBasis: string;
  /** The published timestamp of the underlying record, when one exists. */
  sourceAt?: string;
  severity: CrimeSeverity;
  /** How much of the incident is read straight from the source. */
  confidence: 'published figure' | 'derived screen' | 'keyword match';
  methodology: {
    formula: string;
    steps: CrimeStep[];
    threshold: string;
    reverse: string;
  };
  details: CrimeEvidence[];
  evidence: CrimeEvidence[];
  patterns: string[];
  sources: string[];
}

export const usd = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return 'amount not published';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(3)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

export const num = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';

export const median = (values: number[]): number => {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
};

export const daysBetween = (from: string, to: string): number => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return NaN;
  return Math.round((end - start) / 86_400_000);
};

/** The dollar value of a transaction line, or null when the filing reports no price. */
export const lineValue = (line: { shares: number; price: number }): number | null =>
  line.shares > 0 && line.price > 0 ? line.shares * line.price : null;

export const grossBasis = (line: { shares: number; price: number }): string =>
  line.price > 0
    ? `${num(line.shares)} shares × $${line.price.toFixed(4)} reported price`
    : `${num(line.shares)} shares; the filing reports no price, so no dollar figure is claimed`;

export interface LineLike {
  owner: string;
  code: string;
  traded: string;
  filed: string;
  shares: number;
  price: number;
  after: number;
  ownership: string;
  url: string;
  nature?: string;
  tenb5one?: boolean;
  derivative?: boolean;
}

/** Normalise either a live transaction line or a cached filing into one shape. */
export function toLines(person: PersonView, transactions: OsintTransaction[]): LineLike[] {
  if (transactions.length) {
    return transactions
      .filter((line) => line.owner === person.owner)
      .map((line) => ({
        owner: line.owner,
        code: (line.code || '').toUpperCase(),
        traded: line.traded,
        filed: line.filed,
        shares: line.shares,
        price: line.price,
        after: line.after,
        ownership: line.ownership,
        url: line.url,
        nature: line.nature,
        tenb5one: line.tenb5one,
        derivative: line.derivative,
      }));
  }
  return person.filings.map((filing: InsiderFiling) => ({
    owner: filing.owner,
    code: (filing.code || '').toUpperCase(),
    traded: filing.traded,
    filed: filing.filed,
    shares: filing.shares,
    price: filing.price,
    after: filing.after,
    ownership: filing.ownership,
    url: filing.url,
  }));
}

export const base = (person: PersonView, now: string) => ({
  detectedAt: now,
  subject: person.owner,
  subjectKind: 'individual' as const,
  institution: `${person.issuerName} — ${person.bank}`,
  sources: [`SEC Form 4 (CIK ${person.issuerKey})`, 'FDIC call report'],
  patterns: [],
});
