/**
 * GEORGIA FINANCIAL INSTITUTIONS - ONE ROW PER INSTITUTION
 *
 * Real data only in this file. It joins two things already in the repo:
 *
 *   - FDIC Summary of Deposits 2025, STALPBR=GA (branch-level response), held in
 *     georgiaCountyBanks.ts as [nameIndex, branches, depositsUsd] per county.
 *   - U.S. Census county boundaries, held in georgiaCountyGeometry.ts, used only to
 *     place a marker at the deposit-weighted centre of the counties an institution
 *     actually has branches in.
 *
 * Nothing here is generated: branches, deposits and the county list are the FDIC
 * response aggregated by institution. "Primary market" is the county holding the
 * largest share of that institution's Georgia branch deposits - it is not a claimed
 * headquarters, which the SOD response does not carry.
 */

import { GEORGIA_BANK_NAMES, COUNTY_BANKS_BY_FIPS, COUNTY_BANK_SOURCE } from './georgiaCountyBanks.ts';
import { GEORGIA_COUNTY_PROFILES, COUNTY_SOURCE } from './georgiaCountyForensic.ts';
import { GEORGIA_COUNTY_PATHS } from './georgiaCountyGeometry.ts';

export interface InstitutionCounty {
  fips: string;
  name: string;
  branches: number;
  depositsUsd: number;
}

export interface FinancialInstitution {
  id: string;
  name: string;
  /** Tokens used to match a live OSINT event to this institution. */
  tokens: string[];
  counties: InstitutionCounty[];
  countyCount: number;
  branches: number;
  depositsUsd: number;
  /** County with this institution's largest Georgia branch-deposit share. */
  primary: InstitutionCounty;
  /** Deposit-weighted centroid of the counties the institution operates in. */
  marker: { x: number; y: number };
}

const COUNTY_NAME_BY_FIPS = new Map(GEORGIA_COUNTY_PROFILES.map((c) => [c.fips, c.name]));

/** Vertex mean of a county path. Stable and good enough to place a dot inside the
 *  county; no projection maths needed because the path is already in viewBox units. */
function centroidOfPath(d: string): { x: number; y: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sx += x;
    sy += y;
    n += 1;
  }
  return n ? { x: sx / n, y: sy / n } : { x: 500, y: 580 };
}

export const COUNTY_CENTROIDS: Record<string, { x: number; y: number }> = Object.fromEntries(
  Object.entries(GEORGIA_COUNTY_PATHS).map(([fips, d]) => [fips, centroidOfPath(d)]),
);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Words too generic to identify an institution inside a live headline. */
const STOP_TOKENS = new Set([
  'bank', 'banks', 'the', 'of', 'and', 'company', 'trust', 'national', 'association',
  'state', 'community', 'first', 'county', 'savings', 'federal', 'financial', 'group',
  'corporation', 'corp', 'inc', 'na', 'fsb', 'ssb', 'co',
]);

function tokensFor(name: string): string[] {
  const cleaned = name
    .replace(/,\s*(National Association|N\.A\.|Inc\.?|F\.?S\.?B\.?|S\.?S\.?B\.?)/gi, '')
    .replace(/\(.*?\)/g, '');
  const words = cleaned
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_TOKENS.has(w));
  return Array.from(new Set(words));
}

function buildInstitutions(): FinancialInstitution[] {
  const byIndex = new Map<number, InstitutionCounty[]>();

  for (const [fips, rows] of Object.entries(COUNTY_BANKS_BY_FIPS)) {
    const countyName = COUNTY_NAME_BY_FIPS.get(fips) ?? fips;
    for (const [nameIndex, branches, depositsUsd] of rows) {
      if (!branches) continue;
      const list = byIndex.get(nameIndex) ?? [];
      list.push({ fips, name: countyName, branches, depositsUsd });
      byIndex.set(nameIndex, list);
    }
  }

  const institutions: FinancialInstitution[] = [];

  for (const [nameIndex, counties] of byIndex) {
    const name = GEORGIA_BANK_NAMES[nameIndex];
    if (!name) continue;
    counties.sort((a, b) => b.depositsUsd - a.depositsUsd);
    const branches = counties.reduce((sum, c) => sum + c.branches, 0);
    const depositsUsd = counties.reduce((sum, c) => sum + c.depositsUsd, 0);
    const totalWeight = depositsUsd || 1;

    let mx = 0;
    let my = 0;
    for (const county of counties) {
      const centre = COUNTY_CENTROIDS[county.fips];
      if (!centre) continue;
      const w = county.depositsUsd / totalWeight;
      mx += centre.x * w;
      my += centre.y * w;
    }

    institutions.push({
      id: slugify(name),
      name,
      tokens: tokensFor(name),
      counties,
      countyCount: counties.length,
      branches,
      depositsUsd,
      primary: counties[0],
      marker: { x: mx || 500, y: my || 580 },
    });
  }

  return institutions.sort((a, b) => b.depositsUsd - a.depositsUsd);
}

export const FINANCIAL_INSTITUTIONS: FinancialInstitution[] = buildInstitutions();

export const FINANCIAL_SOURCE = {
  institutionData: COUNTY_BANK_SOURCE.institutionData,
  countyList: COUNTY_SOURCE.countyList,
  surveyYear: COUNTY_SOURCE.surveyYear,
  institutions: FINANCIAL_INSTITUTIONS.length,
  branchRows: COUNTY_BANK_SOURCE.countyBankRows,
  branches: FINANCIAL_INSTITUTIONS.reduce((sum, i) => sum + i.branches, 0),
  depositsUsd: FINANCIAL_INSTITUTIONS.reduce((sum, i) => sum + i.depositsUsd, 0),
} as const;

const BY_ID = new Map(FINANCIAL_INSTITUTIONS.map((i) => [i.id, i]));

export function institutionById(id: string): FinancialInstitution | undefined {
  return BY_ID.get(id);
}

/** Match a live event to an institution by name token. Returns undefined when the
 *  headline names no Georgia institution - the caller shows it as unattributed. */
export function matchInstitution(event: { title?: string; summary?: string; source?: string; entities?: string[] }): FinancialInstitution | null {
  const haystack = [event.title, event.summary, event.source, ...(event.entities ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return null;
  let best: FinancialInstitution | null = null;
  let bestScore = 0;
  for (const inst of FINANCIAL_INSTITUTIONS) {
    if (!inst.tokens.length) continue;
    const hits = inst.tokens.filter((t) => haystack.includes(t)).length;
    if (hits === 0) continue;
    const score = hits / inst.tokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = inst;
    }
  }
  return bestScore >= 0.6 ? best : null;
}
