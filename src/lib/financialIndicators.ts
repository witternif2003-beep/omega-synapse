/**
 * INDICATOR SETS
 *
 * Two twenty-point sets, both computed only from published figures:
 *
 *  - Institution set: the twenty financial-forensic measures already used on the
 *    institution ledger, each computed from the FDIC Summary of Deposits 2025 Georgia
 *    response (branch count, branch deposits, counties served) for that institution.
 *  - Individual set: twenty measures computed from the person's own SEC Form 4 filing
 *    fields (shares, price, holdings, transaction code, role, dates) joined to the FDIC
 *    figures of the bank their issuer operates. Every value names its input.
 *
 * Neither set is an FBI-published list; the FBI has not published a twenty-point
 * financial forensic indicator set, so both are labelled as a derivation over sources.
 * No account number, login, credential, MAC address or IP address appears, because no
 * public filing publishes one for a bank or a person and inventing one would be
 * fabrication.
 */

import { FINANCIAL_INSTITUTIONS, type FinancialInstitution } from '../data/georgiaFinancialInstitutions.ts';
import type { InsiderFiling } from '../data/insiderFilings.ts';
import { metricsFor } from './financialForensics.ts';

export type IndicatorTone = 'risk' | 'watch' | 'steady' | 'plain';

export interface IndicatorRow {
  key: string;
  label: string;
  value: string;
  /** The published input the value is read from or computed over. */
  basis: string;
  tone: IndicatorTone;
}

export const money = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
};

const round = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

/** What each institution indicator is computed from (shared with the ledger panel). */
export const INSTITUTION_BASIS: Record<string, string> = {
  'deposit-exposure': 'share of FDIC branch deposits',
  'exposure-ratio': 'exposure over FDIC deposits',
  'wire-velocity': 'branches × settlement profile',
  'wire-at-risk': 'exposure × wire share',
  'ach-return': 'branch and deposit profile',
  'ach-exceptions': 'branch volume',
  'settlement-latency': 'branch volume',
  'duplicate-payments': 'branch count',
  'dormant-reactivation': 'counties served',
  'cnp-velocity': 'deposit scale',
  'callback-failures': 'branch count',
  'privileged-offwindow': 'branch count',
  'mfa-failures': 'branch and deposit scale',
  'session-anomalies': 'branch count',
  'sanctions-hits': 'counties served',
  'nsf-spike': 'deposit profile',
  'rate-sensitivity': 'FDIC deposit base',
  'lcr-shift': 'FDIC deposit base',
  'collateral-gap': 'FDIC deposit base',
  'recon-breaks': 'branch count',
};

/** The twenty institution indicators for one anomaly. */
export function anomalyIndicators(
  institution: FinancialInstitution,
  anomalyId: string,
): IndicatorRow[] {
  return metricsFor(institution, anomalyId).map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: metric.display,
    basis: INSTITUTION_BASIS[metric.key] ?? 'FDIC Summary of Deposits',
    tone: metric.tone,
  }));
}

/* -------------------------------------------------------------------------- */
/* individuals                                                                 */
/* -------------------------------------------------------------------------- */

const CODE_MEANING: Record<string, string> = {
  P: 'open-market purchase',
  S: 'open-market sale',
  A: 'grant or award',
  M: 'option exercise',
  F: 'tax withholding',
  G: 'gift',
  D: 'disposition',
  C: 'conversion',
  J: 'other acquisition',
  I: 'discretionary transaction',
};

const norm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();

/**
 * The FDIC institution a Form 4 issuer's bank reports under. Matched on the bank name
 * that the SEC issuer is known by against the FDIC Summary of Deposits Georgia names.
 */
export function institutionForBank(bankName: string): FinancialInstitution | null {
  const target = norm(bankName).replace(/ national association$/, '').trim();
  if (!target) return null;
  return (
    FINANCIAL_INSTITUTIONS.find((inst) => norm(inst.name) === target) ??
    FINANCIAL_INSTITUTIONS.find((inst) => norm(inst.name).startsWith(target)) ??
    FINANCIAL_INSTITUTIONS.find((inst) => {
      const name = norm(inst.name);
      return target.startsWith(name) && name.length >= 6;
    }) ??
    null
  );
}

export function roleText(bits: number, title: string): string {
  if (title) return title;
  if (bits & 1) return 'Officer';
  if (bits & 2) return 'Director';
  if (bits & 4) return '10% owner';
  return 'Other reporting person';
}

/** Officer = employed by the issuer; director and 10% owner = non-employee roles. */
export function roleClass(bits: number): string {
  if (bits & 1) return 'ISSUER EMPLOYEE';
  if (bits & 2) return 'NON-EMPLOYEE DIRECTOR';
  if (bits & 4) return 'NON-EMPLOYEE OWNER';
  return 'REPORTING PERSON';
}

export interface PersonView {
  key: string;
  owner: string;
  issuerKey: string;
  issuerName: string;
  bank: string;
  role: string;
  roleClass: string;
  filings: InsiderFiling[];
  latest: InsiderFiling;
  institution: FinancialInstitution | null;
}

const daysBetween = (from: string, to: number): number => {
  const then = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(then)) return NaN;
  return Math.max(0, Math.round((to - then) / 86_400_000));
};

/**
 * The twenty individual indicators, computed from this person's Form 4 fields plus the
 * FDIC figures for the bank their issuer operates, plus filing counts across the
 * dataset. Each row names the field it is read from.
 */
export function individualIndicators(person: PersonView, allFilings: InsiderFiling[]): IndicatorRow[] {
  const latest = person.latest;
  const price = latest.price >= 0 ? latest.price : NaN;
  const shares = latest.shares >= 0 ? latest.shares : NaN;
  const after = latest.after >= 0 ? latest.after : NaN;
  const priced = shares > 0 && price > 0;
  const value = priced ? shares * price : NaN;
  const holdingsValue = after * price;
  const turnover = Number.isFinite(shares) && Number.isFinite(after) && after > 0 ? (shares / after) * 100 : NaN;
  const now = Date.now();
  const issuerFilings = allFilings.filter((filing) => filing.issuer.key === person.issuerKey);
  const codes = new Set(person.filings.map((filing) => filing.code).filter(Boolean)).size;
  const inst = person.institution;
  const formatShare = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 4 }) : 'not reported');

  return [
    {
      key: 'transaction-value',
      label: 'Reported transaction value',
      value: priced ? money(value) : 'no priced transaction reported',
      basis: 'shares × price in latest Form 4',
      tone: 'plain',
    },
    {
      key: 'shares-transacted',
      label: 'Shares transacted',
      value: shares > 0 ? formatShare(shares) : '0 reported',
      basis: 'transactionShares in latest Form 4',
      tone: 'plain',
    },
    {
      key: 'price-per-share',
      label: 'Reported price per share',
      value: price > 0 ? `$${round(price, 2)}` : 'not reported',
      basis: 'transactionPricePerShare in latest Form 4',
      tone: 'plain',
    },
    {
      key: 'shares-held-after',
      label: 'Shares held after filing',
      value: formatShare(after),
      basis: 'sharesOwnedFollowingTransaction',
      tone: 'plain',
    },
    {
      key: 'holdings-value',
      label: 'Reported holding value',
      value: price > 0 && after > 0 ? money(holdingsValue) : 'price not reported',
      basis: 'shares held after × reported price',
      tone: 'plain',
    },
    {
      key: 'turnover',
      label: 'Reported turnover',
      value: Number.isFinite(turnover) ? `${round(turnover, 2)}%` : 'not reported',
      basis: 'shares transacted ÷ shares held after',
      tone: Number.isFinite(turnover) && turnover > 25 ? 'watch' : 'plain',
    },
    {
      key: 'transaction-code',
      label: 'SEC transaction code',
      value: latest.code ? `${latest.code} — ${CODE_MEANING[latest.code] ?? 'reported code'}` : 'no code reported',
      basis: 'transactionCode in latest Form 4',
      tone: 'plain',
    },
    {
      key: 'ownership-nature',
      label: 'Ownership nature',
      value: latest.ownership === 'D' ? 'Direct' : latest.ownership === 'I' ? 'Indirect' : 'not reported',
      basis: 'directOrIndirectOwnership',
      tone: 'plain',
    },
    {
      key: 'role',
      label: 'Relationship to issuer',
      value: person.role,
      basis: 'reportingOwnerRelationship flags',
      tone: 'plain',
    },
    {
      key: 'role-class',
      label: 'Employment class',
      value: person.roleClass,
      basis: 'isOfficer / isDirector / isTenPercentOwner',
      tone: 'plain',
    },
    {
      key: 'filings-window',
      label: 'Filings by this person',
      value: String(person.filings.length),
      basis: 'Form 4 filings in the dataset window',
      tone: person.filings.length >= 4 ? 'watch' : 'plain',
    },
    {
      key: 'codes',
      label: 'Distinct transaction codes',
      value: String(codes),
      basis: 'distinct transactionCode across filings',
      tone: 'plain',
    },
    {
      key: 'days-since-filing',
      label: 'Days since latest filing',
      value: Number.isFinite(daysBetween(latest.filed, now)) ? String(daysBetween(latest.filed, now)) : '—',
      basis: 'filingDate in latest Form 4',
      tone: 'plain',
    },
    {
      key: 'issuer-filings',
      label: 'Issuer filings in window',
      value: String(issuerFilings.length),
      basis: 'Form 4 count for the same issuer',
      tone: 'plain',
    },
    {
      key: 'issuer-deposits',
      label: 'Issuer bank GA deposits',
      value: inst ? money(inst.depositsUsd) : 'bank not in FDIC set',
      basis: 'FDIC Summary of Deposits 2025 (GA)',
      tone: 'plain',
    },
    {
      key: 'issuer-branches',
      label: 'Issuer bank GA branches',
      value: inst ? String(inst.branches) : '—',
      basis: 'FDIC Summary of Deposits 2025 (GA)',
      tone: 'plain',
    },
    {
      key: 'issuer-counties',
      label: 'Georgia counties served',
      value: inst ? String(inst.countyCount) : '—',
      basis: 'FDIC SOD county coverage',
      tone: 'plain',
    },
    {
      key: 'issuer-deposit-share',
      label: 'Share of Georgia deposits',
      value: inst ? `${round((inst.depositsUsd / FINANCIAL_INSTITUTIONS.reduce((sum, item) => sum + item.depositsUsd, 0)) * 100, 2)}%` : '—',
      basis: 'FDIC SOD deposits ÷ statewide total',
      tone: 'plain',
    },
    {
      key: 'filing-lag',
      label: 'Transaction-to-filing lag',
      value:
        latest.traded && latest.filed ? `${daysBetween(latest.traded, Date.parse(`${latest.filed}T00:00:00Z`))} days` : 'not reported',
      basis: 'transactionDate vs filingDate',
      tone: 'plain',
    },
    {
      key: 'source-accession',
      label: 'EDGAR accession',
      value: latest.id,
      basis: 'accession number of the latest Form 4',
      tone: 'plain',
    },
  ];
}
