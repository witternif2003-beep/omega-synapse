/**
 * COUNTY FORENSIC RISK SCORING
 *
 * Deterministic, dependency-free scoring for the Georgia county forensic overlay.
 *
 * IMPORTANT - WHAT THIS IS AND IS NOT
 * -----------------------------------
 * The county profile inputs (institutions, branches, deposits, HHI) are real, taken
 * from the FDIC Summary of Deposits 2025 response for Georgia. The risk score built
 * on top of them is an ILLUSTRATIVE model: it is a fixed, reproducible blend of real
 * concentration measures and a deterministic pseudo-signal. It is not a vulnerability
 * assessment, not an attribution, and not derived from any surveillance of any
 * institution. It exists so the overlay has a stable, explainable ordering to display.
 *
 * Determinism: the same (institutionId, countyFips, snapshotId) always yields the same
 * score. No Math.random(), no Date.now(), no crypto module (which is unavailable in the
 * browser and would break the client build).
 */

import type { CountyInstitutionProfile } from '../data/georgiaCountyForensic.ts';

export type RiskBand = 'MINIMAL' | 'ELEVATED' | 'ACTIVE' | 'HIGH' | 'CRITICAL';

export interface RiskComponent {
  label: string;
  weight: number;
  value: number; // 0..1 normalized contribution input
}

export interface CountyRiskAssessment {
  fips: string;
  name: string;
  score: number; // 0..1
  band: RiskBand;
  components: RiskComponent[];
}

/** FNV-1a 32-bit. Small, stable across engines, no dependencies. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Derive an independent byte per indicator from one seed string. */
export function deterministicByte(seed: string, index: number): number {
  return fnv1a(`${seed}:${index}`) & 0xff;
}

/**
 * Deterministic pseudo-signal in [0,1) for a seed. Used only to give the illustrative
 * blend variance between counties/entities; it carries no data meaning.
 */
export function deterministicSignal(seed: string): number {
  return fnv1a(seed) / 0x100000000;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function riskBand(score: number): RiskBand {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.5) return 'ACTIVE';
  if (score >= 0.25) return 'ELEVATED';
  return 'MINIMAL';
}

/** Colour scale, shared by the table bars and the drill-down header. */
export const RISK_BAND_COLORS: Record<RiskBand, string> = {
  MINIMAL: '#00e676',
  ELEVATED: '#ffeb3b',
  ACTIVE: '#ff9800',
  HIGH: '#f44336',
  CRITICAL: '#b71c1c',
};

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  MINIMAL: 'Minimal exposure',
  ELEVATED: 'Elevated indicators',
  ACTIVE: 'Active signatures',
  HIGH: 'High confidence',
  CRITICAL: 'Critical + multiplier',
};

function logVolumeIndex(depositsUsd: number, maxDepositsUsd: number): number {
  if (depositsUsd <= 0 || maxDepositsUsd <= 0) return 0;
  return clamp01(Math.log10(depositsUsd) / Math.log10(maxDepositsUsd));
}

/**
 * Score one county.
 *
 * Weights: deposit volume 0.40, institution breadth 0.25, concentration (HHI) 0.15,
 * deterministic pseudo-signal 0.20. The weighted sum is clamped to [0,1] BEFORE it is
 * reported, so nothing can push a published score above 1.0.
 */
export function assessCounty(
  county: CountyInstitutionProfile,
  maxima: { depositsUsd: number; institutions: number },
  snapshotId: string,
): CountyRiskAssessment {
  const volume = logVolumeIndex(county.depositsUsd, maxima.depositsUsd);
  const breadth = maxima.institutions > 0 ? clamp01(county.institutions / maxima.institutions) : 0;
  const concentration = clamp01(county.hhi / 10000);
  const signal = deterministicSignal(`${county.fips}:${snapshotId}`);

  const components: RiskComponent[] = [
    { label: 'Deposit volume', weight: 0.4, value: volume },
    { label: 'Institution breadth', weight: 0.25, value: breadth },
    { label: 'Concentration (HHI)', weight: 0.15, value: concentration },
    { label: 'Deterministic signal', weight: 0.2, value: signal },
  ];

  const raw = components.reduce((sum, c) => sum + c.weight * c.value, 0);
  const score = clamp01(raw);

  return {
    fips: county.fips,
    name: county.name,
    score,
    band: riskBand(score),
    components,
  };
}

export function assessCounties(
  counties: CountyInstitutionProfile[],
  snapshotId: string,
): CountyRiskAssessment[] {
  const maxima = counties.reduce(
    (acc, c) => ({
      depositsUsd: Math.max(acc.depositsUsd, c.depositsUsd),
      institutions: Math.max(acc.institutions, c.institutions),
    }),
    { depositsUsd: 0, institutions: 0 },
  );

  return counties
    .map((county) => assessCounty(county, maxima, snapshotId))
    .sort((a, b) => b.score - a.score);
}

/**
 * Per-indicator activity for an entity, derived from its own hash stream so that each
 * indicator is decided independently rather than by one shared byte.
 */
export function activeIndicatorFlags(
  institutionId: string,
  countyFips: string,
  indicatorIds: readonly string[],
  snapshotId: string,
): string[] {
  const seed = `${institutionId}:${countyFips}:${snapshotId}`;
  return indicatorIds.filter((_, index) => deterministicByte(seed, index) % 3 === 0);
}

export function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
