/**
 * DEEP INDICATOR FRAMEWORK
 *
 * The espionage dossier shows 280 derived indicators: fourteen families of twenty. Each
 * family is a question a financial-espionage reviewer asks (capital, asset quality, funding,
 * earnings, insider trading, disclosure, structure, and for a person: identity, magnitude,
 * timing, pattern, counterparty, peer position and provenance).
 *
 * Every indicator is a formula over fields that publishers actually print: FDIC Reports of
 * Condition and Income, the FDIC Summary of Deposits, and SEC Form 4 documents. Nothing is
 * invented, and an indicator whose inputs are not published returns null so the panel can
 * say so instead of showing a guessed number.
 *
 * The FBI has not published a financial-espionage indicator list. These families are a
 * derivation assembled for this dashboard, and the panel labels them as such.
 */

import type { GaFinancial, PeerMedians } from './osintFinancials.ts';
import type { OsintFilingRow, OsintTransaction } from './osintClient.ts';
import type { GeorgiaInstitution, OsintItem } from './osintClient.ts';

export type DeepTone = 'risk' | 'watch' | 'steady' | 'info';

export interface DeepRow {
  key: string;
  family: string;
  label: string;
  value: string;
  tone: DeepTone;
  basis: string;
  source: string;
  /** False when the published inputs for this measure were not available. */
  computed: boolean;
}

export type RuleResult = string | null | { value: string; tone: DeepTone };

export interface Rule<Ctx> {
  key: string;
  label: string;
  /** The published fields the value is read from or computed over. */
  basis: string;
  /** Short source name shown next to the value. */
  source: string;
  run: (ctx: Ctx) => RuleResult;
}

export interface Family<Ctx> {
  id: string;
  label: string;
  blurb: string;
  rules: Rule<Ctx>[];
}

export interface SodProfile {
  name: string;
  branches: number;
  depositsUsd: number;
  counties: number;
  primaryCounty: string;
  primaryDepositsUsd: number;
}

export interface InstitutionContext {
  inst: GeorgiaInstitution;
  sod: SodProfile | null;
  fin: GaFinancial | null;
  peer: PeerMedians | null;
  items: OsintItem[];
  filings: OsintFilingRow[];
  transactions: OsintTransaction[];
  statewide: { depositsUsd: number; branches: number; institutions: number };
  ranks: { assets: number; deposits: number };
}

export interface PersonAggregate {
  key: string;
  name: string;
  issuerKey: string;
  issuerName: string;
  bank: string;
  cik: string;
  ticker: string;
  roleBits: number;
  title: string;
  role: string;
  roleClass: string;
  filings: OsintFilingRow[];
  transactions: OsintTransaction[];
}

export interface PersonContext {
  person: PersonAggregate;
  issuerFilings: OsintFilingRow[];
  issuerTransactions: OsintTransaction[];
  fin: GaFinancial | null;
  peer: PeerMedians | null;
  inst: GeorgiaInstitution | null;
  items: OsintItem[];
}

function evaluate<Ctx>(families: Family<Ctx>[], ctx: Ctx): DeepRow[] {
  const rows: DeepRow[] = [];
  for (const family of families) {
    for (const rule of family.rules) {
      let raw: RuleResult;
      try {
        raw = rule.run(ctx);
      } catch {
        raw = null;
      }
      const value = typeof raw === 'string' ? raw : raw && raw.value;
      rows.push({
        key: `${family.id}:${rule.key}`,
        family: family.id,
        label: rule.label,
        value: value && value.trim() ? value : 'input not published',
        tone: typeof raw === 'object' && raw ? raw.tone : value ? 'info' : 'steady',
        basis: rule.basis,
        source: rule.source,
        computed: Boolean(value && value.trim()),
      });
    }
  }
  return rows;
}

export { evaluate };

/* -------------------------------------------------------------------------- */
/* formatting helpers shared by the families                                  */
/* -------------------------------------------------------------------------- */

export const usd = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return 'not reported';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const usdThousands = (thousands: number, digits = 2): string =>
  Number.isFinite(thousands) ? usd(thousands * 1000, digits) : 'not reported';

export const pct = (value: number, digits = 2): string =>
  Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'not reported';

export const count = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US') : 'not reported';

export const share = (value: number, digits = 2): string =>
  Number.isFinite(value) ? `${value.toFixed(digits)}` : 'not reported';

export const days = (value: number): string =>
  Number.isFinite(value) ? `${Math.round(value)} days` : 'not reported';

export const na = 'not reported';

/** Tone helper: null when the value cannot be computed. */
export const toned = (value: string | null, tone: DeepTone = 'info'): RuleResult =>
  value ? { value, tone } : null;

export const parseDay = (value: string): number => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : NaN;
};

export const dayGap = (from: string, to: string): number => {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
};

export const daysSince = (iso: string): number => {
  const time = parseDay(iso.slice(0, 10));
  if (!Number.isFinite(time)) return NaN;
  return Math.max(0, Math.round((Date.now() - time) / 86_400_000));
};

/** Business days between two calendar dates, weekends excluded. */
export const businessDays = (from: string, to: string): number => {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return NaN;
  let total = 0;
  for (let cursor = start + 86_400_000; cursor <= end; cursor += 86_400_000) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) total += 1;
  }
  return total;
};

export const sum = (values: number[]): number =>
  values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);

export const median = (values: number[]): number => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return NaN;
  const sorted = [...clean].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const tradeValue = (line: OsintTransaction): number =>
  line.shares > 0 && line.price > 0 ? line.shares * line.price : NaN;

export const isSale = (line: OsintTransaction): boolean => line.code === 'S' || line.code === 'D' || line.code === 'F';

export const isPurchase = (line: OsintTransaction): boolean => line.code === 'P';

export const INDICATOR_DISCLAIMER =
  'Fourteen families of twenty derived measures. Inputs are FDIC Reports of Condition and Income ' +
  '(quarterly), the FDIC Summary of Deposits and SEC Form 4 documents. Where a publisher does not ' +
  'print an input the row says so. No FBI indicator list is published, so these families are a ' +
  'derivation over published records, not a Bureau list.';
