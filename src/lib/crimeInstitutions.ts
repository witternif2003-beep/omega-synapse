 *
 *  - FDIC call-report figures for a Georgia charter (noncurrent loans, allowance, past-due
 *    buckets, equity, net income, brokered deposits, asset series). Every dollar figure is
 *    the reported figure multiplied by 1,000, because the call report stores thousands.
 *
 * As with the insider screens, these are thresholds over published figures, not findings of
 * wrongdoing. Every incident prints its formula, its inputs, its threshold and how to
 * reverse it.
 *
 * Screens 1–5 live here; screens 6–10 and the runner are in crimeInstitutionsB.ts.
 */

import type { FinQuarter, PeerMedians } from './osintFinancials.ts';
import type { CrimeIncident } from './crimeEngine.ts';
import { usd } from './crimeEngine.ts';

export const K = 1000; // the FDIC call report reports thousands of dollars
export const pct = (value: number): string => (Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—');
export const num = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';

export interface BankContext {
  name: string;
  cert: string;
  latest: FinQuarter;
  quarters: string[];
  asset: number[];
  eq: number[];
  netinc: number[];
  peer: PeerMedians | null;
}

export const shell = (ctx: BankContext, now: string) => ({
  detectedAt: now,
  subject: ctx.name,
  subjectKind: 'institution' as const,
  institution: `${ctx.name} · FDIC certificate ${ctx.cert}`,
  sources: [`FDIC call report ${ctx.quarters[0] ?? ''}`, 'FDIC BankFind'],
  patterns: [],
});

export const quarterLabel = (ctx: BankContext): string => ctx.quarters[0] ?? 'latest quarter';

/**
 * Screens 1–5: noncurrent loans above the allowance, allowance coverage under half, the two
 * past-due buckets, and the noncurrent rate against the Georgia peer median. Each is a
 * published-figure inequality with the dollar gap it implies; the gap is the amount at issue.
 */
export function detectInstitutionScreensA(ctx: BankContext, now: string): CrimeIncident[] {
  const { latest } = ctx;
  const out: CrimeIncident[] = [];
  const asset = latest.asset * K;
  const ncln = latest.ncln * K;
  const allowance = latest.elnatr * K;
  const push = (incident: CrimeIncident | null) => {
    if (incident) out.push(incident);
  };

  /* 1 — noncurrent loans exceed the loss allowance -------------------------- */
  if (latest.ncln > 0 && latest.elnatr >= 0 && latest.ncln > latest.elnatr && latest.asset > 0) {
    const gap = (latest.ncln - latest.elnatr) * K;
    const ratio = latest.ncln / latest.asset;
    if (ratio >= 0.01) {
      push({
        ...shell(ctx, now),
        id: `${ctx.cert}:BNK-RESERVE-GAP`,
        family: 'ASSET_QUALITY',
        patternId: 'BNK-RESERVE-01',
        title: 'Noncurrent loans exceed the loan-loss allowance',
        amountUsd: gap,
        amountBasis: '(NCLNLS − ELNATR) × 1,000',
        sourceAt: quarterLabel(ctx),
        severity: gap / asset > 0.02 ? 'critical' : 'high',
        confidence: 'published figure',
        methodology: {
          formula: 'gap = (NCLNLS − ELNATR) × 1,000',
          steps: [
            { label: 'Noncurrent loans', detail: `NCLNLS ${num(latest.ncln)} thousand = ${usd(ncln)}` },
            { label: 'Loss allowance', detail: `ELNATR ${num(latest.elnatr)} thousand = ${usd(allowance)}` },
            { label: 'Subtract', detail: `${usd(ncln)} − ${usd(allowance)} = ${usd(gap)}` },
            { label: 'Size test', detail: `NCLNLS ÷ ASSET = ${pct(ratio)} of assets` },
          ],
          threshold: 'noncurrent loans above the allowance AND at least 1% of total assets',
          reverse: 'Two call-report lines and one subtraction. Divide the gap by assets to size it; both inputs are printed so any reader can recompute it.',
        },
        details: [
          { label: 'Noncurrent loans', value: usd(ncln) },
          { label: 'Loss allowance', value: usd(allowance) },
          { label: 'Noncurrent rate', value: `${latest.nclnr.toFixed(2)}%` },
          { label: 'Total assets', value: usd(asset) },
          { label: 'Quarter', value: quarterLabel(ctx) },
        ],
        evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
        patterns: ['BNK-RESERVE-01', 'BNK-COVERAGE-02'],
      });
    }
  }

  /* 2 — allowance covers less than half the noncurrent book ---------------- */
  if (latest.ncln > 0 && latest.elnatr >= 0 && latest.elnatr / latest.ncln < 0.5) {
    const shortfall = (latest.ncln * 0.5 - latest.elnatr) * K;
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-COVERAGE`,
      family: 'ASSET_QUALITY',
      patternId: 'BNK-COVERAGE-02',
      title: 'Allowance covers less than half of noncurrent loans',
      amountUsd: shortfall > 0 ? shortfall : null,
      amountBasis: '(NCLNLS × 50% − ELNATR) × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: latest.elnatr / latest.ncln < 0.25 ? 'high' : 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'coverage = ELNATR ÷ NCLNLS; shortfall to 50% = (NCLNLS × 0.5 − ELNATR) × 1,000',
        steps: [
          { label: 'Coverage', detail: `${usd(allowance)} ÷ ${usd(ncln)} = ${pct(latest.elnatr / latest.ncln)}` },
          { label: 'Target', detail: `50% of ${usd(ncln)} = ${usd(latest.ncln * 0.5 * K)}` },
          { label: 'Shortfall', detail: usd(shortfall) },
        ],
        threshold: 'allowance below half of noncurrent loans',
        reverse: 'Coverage is one division of two published lines. The 50% target is this screen’s parameter, not a regulatory minimum, and the panel says so.',
      },
      details: [
        { label: 'Allowance', value: usd(allowance) },
        { label: 'Noncurrent loans', value: usd(ncln) },
        { label: 'Coverage', value: pct(latest.elnatr / latest.ncln) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-COVERAGE-02'],
    });
  }

  /* 3 — loans 90+ days past due -------------------------------------------- */
  if (latest.p9 > 0 && latest.asset > 0 && latest.p9 / latest.asset >= 0.01) {
    const value = latest.p9 * K;
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-PASTDUE-90`,
      family: 'ASSET_QUALITY',
      patternId: 'BNK-PASTDUE-03',
      title: 'Loans 90+ days past due above 1% of assets',
      amountUsd: value,
      amountBasis: 'P9ASSET × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: latest.p9 / latest.asset >= 0.02 ? 'high' : 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'P9ASSET ÷ ASSET ≥ 1%',
        steps: [
          { label: 'Past due 90+ days', detail: `P9ASSET ${num(latest.p9)} thousand = ${usd(value)}` },
          { label: 'Divide by assets', detail: `${usd(value)} ÷ ${usd(asset)} = ${pct(latest.p9 / latest.asset)}` },
        ],
        threshold: '90+ day past-due assets at or above 1% of total assets',
        reverse: 'One published ratio. The incident amount is the past-due balance itself, not an estimated loss.',
      },
      details: [
        { label: '90+ day past due', value: usd(value) },
        { label: 'Share of assets', value: pct(latest.p9 / latest.asset) },
        { label: 'Quarter', value: quarterLabel(ctx) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-PASTDUE-03'],
    });
  }

  /* 4 — loans 30-89 days past due ------------------------------------------ */
  if (latest.p3 > 0 && latest.asset > 0 && latest.p3 / latest.asset >= 0.02) {
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-PASTDUE-30`,
      family: 'ASSET_QUALITY',
      patternId: 'BNK-PASTDUE-04',
      title: 'Loans 30–89 days past due above 2% of assets',
      amountUsd: latest.p3 * K,
      amountBasis: 'P3ASSET × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'P3ASSET ÷ ASSET ≥ 2%',
        steps: [
          { label: 'Past due 30–89 days', detail: `${usd(latest.p3 * K)}` },
          { label: 'Ratio', detail: pct(latest.p3 / latest.asset) },
        ],
        threshold: '30–89 day past-due assets at or above 2% of total assets',
        reverse: 'The early bucket is the leading edge of the same published series; the amount is the reported balance.',
      },
      details: [
        { label: '30–89 day past due', value: usd(latest.p3 * K) },
        { label: 'Share of assets', value: pct(latest.p3 / latest.asset) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-PASTDUE-04'],
    });
  }

  /* 5 — noncurrent rate at twice the Georgia peer median -------------------- */
  const peerNclnr = ctx.peer?.nclnr ?? 0;
  if (peerNclnr > 0 && latest.nclnr >= Math.max(2, peerNclnr * 2)) {
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-PEER-NPL`,
      family: 'ASSET_QUALITY',
      patternId: 'BNK-PEER-05',
      title: `Noncurrent rate ${(latest.nclnr / peerNclnr).toFixed(1)}× the state peer median`,
      amountUsd: ncln,
      amountBasis: 'NCLNLS × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: latest.nclnr >= peerNclnr * 3 ? 'high' : 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'NCLNLSR ≥ max(2%, 2 × peer median NCLNLSR)',
        steps: [
          { label: 'This bank', detail: `NCLNLSR ${latest.nclnr.toFixed(2)}%` },
          { label: 'Peer median', detail: `${peerNclnr.toFixed(2)}% across ${ctx.peer?.count ?? 0} Georgia charters` },
          { label: 'Multiple', detail: `${(latest.nclnr / peerNclnr).toFixed(2)}×` },
          { label: 'Amount', detail: `noncurrent loans ${usd(ncln)}` },
        ],
        threshold: 'at least twice the peer median and at least 2%',
        reverse: 'The peer median is computed in the same payload from every Georgia charter, so the multiple can be rebuilt from the published set.',
      },
      details: [
        { label: 'Bank noncurrent rate', value: `${latest.nclnr.toFixed(2)}%` },
        { label: 'Peer median', value: `${peerNclnr.toFixed(2)}%` },
        { label: 'Noncurrent loans', value: usd(ncln) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-PEER-05'],
    });
  }

  return out;
}
