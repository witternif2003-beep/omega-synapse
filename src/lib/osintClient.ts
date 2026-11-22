/**
 * LIVE OSINT CLIENT
 *
 * Types and helpers shared by the espionage tab. Everything here reads the payload the
 * server assembled from real publishers (SEC EDGAR, Federal Register, Federal Reserve,
 * Department of Justice, FDIC, OFAC). No headline, person or institution is created in
 * the browser.
 */

import {
  FINANCIAL_INSTITUTIONS,
  type FinancialInstitution,
} from '../data/georgiaFinancialInstitutions.ts';
import type { InsiderFiling, InsiderIssuer } from '../data/insiderFilings.ts';
import { anomalyIndicators, type IndicatorRow } from './financialIndicators.ts';

export type OsintKind =
  | 'insider'
  | 'filing'
  | 'regulatory'
  | 'enforcement'
  | 'sanctions'
  | 'litigation'
  | 'press';

export type OsintSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface OsintItem {
  id: string;
  sourceId: string;
  publisher: string;
  kind: OsintKind;
  title: string;
  summary: string;
  url: string;
  published: string;
  severity: OsintSeverity;
  institutions: string[];
  people: string[];
  sector: boolean;
  cik?: string;
  accession?: string;
  document?: string;
}

export interface OsintSourceReport {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface GeorgiaInstitution {
  name: string;
  city: string;
  cert: string;
  holdingCompany: string;
  assetsThousands: number;
}

export interface OsintFeedPayload {
  generatedAt: string;
  coverage: {
    institutions: number;
    source: string;
    retrieved: string;
    filers: number;
    georgiaFilers: number;
  };
  sources: OsintSourceReport[];
  items: OsintItem[];
  institutions: GeorgiaInstitution[];
}

export interface OsintFilingRow {
  id: string;
  owner: string;
  roleBits: number;
  title: string;
  filed: string;
  traded: string;
  code: string;
  shares: number;
  price: number;
  after: number;
  ownership: string;
  url: string;
}

/** One reported transaction line from a live Form 4 document. */
export interface OsintTransaction {
  accession: string;
  owner: string;
  roleBits: number;
  title: string;
  filed: string;
  traded: string;
  code: string;
  shares: number;
  price: number;
  after: number;
  ownership: string;
  nature: string;
  security: string;
  derivative: boolean;
  tenb5one: boolean;
  url: string;
}

export interface OsintInsiderPayload {
  ok: boolean;
  issuer: {
    key: string;
    name: string;
    cik: string;
    ticker: string;
    bank: string;
    city: string;
    scope: string;
  };
  fetchedAt: string;
  cacheSeconds: number;
  error?: string;
  filings: OsintFilingRow[];
  transactions: OsintTransaction[];
  people: number;
}

export interface OsintFilingDetailPayload {
  ok: boolean;
  url: string;
  filing: OsintFilingRow | null;
  error?: string;
}

const norm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** SOD institution whose published name matches a name the feed attributed. */
export function institutionByName(name: string): FinancialInstitution | null {
  const target = norm(name).replace(/ national association$/, '');
  if (!target) return null;
  return (
    FINANCIAL_INSTITUTIONS.find((inst) => norm(inst.name) === target) ??
    FINANCIAL_INSTITUTIONS.find((inst) => norm(inst.name).startsWith(target)) ??
    FINANCIAL_INSTITUTIONS.find((inst) => {
      const candidate = norm(inst.name);
      return target.startsWith(candidate) && candidate.length >= 8;
    }) ??
    null
  );
}

/**
 * Statewide aggregate of the FDIC Summary of Deposits Georgia response. Used as the
 * indicator basis for a regulator or sanctions publication that names no single bank, so
 * every row still shows twenty figures - labelled as statewide, never as an institution.
 */
export const STATEWIDE_INSTITUTION: FinancialInstitution = {
  id: 'statewide-georgia',
  name: 'Georgia statewide (all FDIC institutions in the response)',
  tokens: [],
  counties: [],
  countyCount: new Set(FINANCIAL_INSTITUTIONS.flatMap((inst) => inst.counties.map((c) => c.fips)))
    .size,
  branches: FINANCIAL_INSTITUTIONS.reduce((sum, inst) => sum + inst.branches, 0),
  depositsUsd: FINANCIAL_INSTITUTIONS.reduce((sum, inst) => sum + inst.depositsUsd, 0),
  primary: { fips: '', name: 'Georgia', branches: 0, depositsUsd: 0 },
  marker: { x: 0, y: 0 },
};

export function indicatorsForItem(item: OsintItem): {
  rows: IndicatorRow[];
  institution: FinancialInstitution | null;
  scope: 'institution' | 'statewide';
} {
  const institution = item.institutions.length ? institutionByName(item.institutions[0]) : null;
  return {
    rows: anomalyIndicators(institution ?? STATEWIDE_INSTITUTION, item.id),
    institution,
    scope: institution ? 'institution' : 'statewide',
  };
}

/** Convert a live Form 4 row into the shape the indicator module expects. */
export function filingFromLive(
  row: OsintFilingRow,
  issuer: OsintInsiderPayload['issuer'],
): InsiderFiling {
  const issuerObject: InsiderIssuer = {
    key: issuer.key,
    name: issuer.name,
    ticker: issuer.ticker,
    cik: issuer.cik,
    bank: issuer.bank,
  };
  return {
    id: row.id,
    issuer: issuerObject,
    owner: row.owner,
    roleBits: row.roleBits,
    title: row.title,
    filed: row.filed,
    traded: row.traded,
    code: row.code,
    shares: row.shares,
    price: row.price,
    after: row.after,
    ownership: row.ownership,
    url: row.url,
  };
}

export const KIND_LABEL: Record<OsintKind, string> = {
  insider: 'Insider filing',
  filing: 'SEC filing',
  regulatory: 'Rulemaking',
  enforcement: 'Enforcement',
  sanctions: 'Sanctions',
  litigation: 'Litigation',
  press: 'Press release',
};

export const KIND_COLOR: Record<OsintKind, string> = {
  insider: '#22d3ee',
  filing: '#a3e635',
  regulatory: '#93c5fd',
  enforcement: '#f59e0b',
  sanctions: '#f43f5e',
  litigation: '#c084fc',
  press: '#94a3b8',
};

export function relativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'date not reported';
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const FEED_URL = '/api/osint/feed';
export const INSIDERS_URL = '/api/osint/insiders';
export const FINANCIALS_URL = '/api/osint/financials';
export const FILING_URL = '/api/osint/filing';

export async function loadFeed(): Promise<OsintFeedPayload> {
  const response = await fetch(FEED_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return (await response.json()) as OsintFeedPayload;
}

export async function loadInsiders(cik: string): Promise<OsintInsiderPayload> {
  const response = await fetch(`${INSIDERS_URL}?cik=${encodeURIComponent(cik)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`insiders HTTP ${response.status}`);
  return (await response.json()) as OsintInsiderPayload;
}

export async function loadFilingDetail(
  cik: string,
  accession: string,
  document: string,
): Promise<OsintFilingDetailPayload> {
  const query = new URLSearchParams({ cik, accession, document });
  const response = await fetch(`${FILING_URL}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`filing HTTP ${response.status}`);
  return (await response.json()) as OsintFilingDetailPayload;
}
