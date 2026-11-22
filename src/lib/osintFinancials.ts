/**
 * FDIC FINANCIAL CONTEXT (client)
 *
 * The browser side of the FDIC quarterly financials feed: types, the loader, and the small
 * arithmetic helpers the deep-dive panels use. Every number here was filed by the bank with
 * the FDIC; nothing is estimated in the browser.
 */

export interface FinQuarter {
  asset: number;
  dep: number;
  eq: number;
  netinc: number;
  roa: number;
  roe: number;
  p3: number;
  p9: number;
  ncln: number;
  nclnr: number;
  ntln: number;
  ntlnr: number;
  bro: number;
  scaf: number;
  scaffr: number;
  numemp: number;
  lnlsnet: number;
  elnatr: number;
  nperfv: number;
}

export interface GaFinancial {
  cert: string;
  latest: FinQuarter;
  quarters: string[];
  asset: number[];
  dep: number[];
  eq: number[];
  netinc: number[];
  roa: number[];
  nclnr: number[];
}

export interface PeerMedians {
  count: number;
  roa: number;
  roe: number;
  nclnr: number;
  ntlnr: number;
  equityRatio: number;
  brokeredRatio: number;
  loanDeposit: number;
  nonperform: number;
}

export interface GaFinancialPayload {
  ok: boolean;
  retrieved: string;
  quarter: string;
  peer: PeerMedians | null;
  institutions: Record<string, GaFinancial>;
  error?: string;
  note: string;
}

export const FINANCIALS_URL = '/api/osint/financials';

export async function loadFinancials(): Promise<GaFinancialPayload> {
  const response = await fetch(FINANCIALS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`financials HTTP ${response.status}`);
  return (await response.json()) as GaFinancialPayload;
}

/* -------------------------------------------------------------------------- */
/* arithmetic over the published series                                       */
/* -------------------------------------------------------------------------- */

/** Value n quarters back (0 = latest quarter). NaN when the series is too short. */
export function seriesAt(series: number[] | undefined, back: number): number {
  if (!series || series.length <= back) return NaN;
  return series[series.length - 1 - back];
}

/** Percent change from n quarters back to the latest quarter. */
export function seriesGrowth(series: number[] | undefined, back: number): number {
  const now = seriesAt(series, 0);
  const then = seriesAt(series, back);
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return NaN;
  return ((now - then) / Math.abs(then)) * 100;
}

/** Percent change between two points n and m quarters back. */
export function seriesGrowthBetween(series: number[] | undefined, thenBack: number, nowBack = 0): number {
  const now = seriesAt(series, nowBack);
  const then = seriesAt(series, thenBack);
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return NaN;
  return ((now - then) / Math.abs(then)) * 100;
}

export function seriesDelta(series: number[] | undefined, back: number): number {
  const now = seriesAt(series, 0);
  const then = seriesAt(series, back);
  if (!Number.isFinite(now) || !Number.isFinite(then)) return NaN;
  return now - then;
}

export function stdev(values: number[]): number {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return NaN;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

export function safeRatio(numerator: number, denominator: number, scale = 100): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return NaN;
  return (numerator / denominator) * scale;
}

export const finPct = (value: number, digits = 2): string =>
  Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'not reported';

export const finNum = (value: number, digits = 0): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'not reported';

/** Thousands of dollars to a compact USD string. */
export const finUsd = (thousands: number, digits = 2): string => {
  if (!Number.isFinite(thousands)) return 'not reported';
  const value = thousands * 1000;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

export const quarterLabel = (quarter: string): string =>
  quarter.length === 8 ? `${quarter.slice(0, 4)} Q${Math.ceil(Number(quarter.slice(4, 6)) / 3)}` : quarter;
