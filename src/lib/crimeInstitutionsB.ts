import type { PeerMedians, GaFinancial } from './osintFinancials.ts';
import type { CrimeIncident } from './crimeEngine.ts';
import { usd } from './crimeEngine.ts';
import { K, num, pct, quarterLabel, shell, detectInstitutionScreensA, type BankContext } from './crimeInstitutions.ts';

/**
 * INSTITUTION SCREENS, PART B
 *
 * Screens 6–10 (loss, thin equity, equity decline, brokered funding, rapid growth), the
 * combined per-charter runner and the pass over every charter in the FDIC payload.
 */
export function detectInstitutionScreensB(ctx: BankContext, now: string): CrimeIncident[] {
  const { latest } = ctx;
  const out: CrimeIncident[] = [];
  const asset = latest.asset * K;
  const ncln = latest.ncln * K;
  const allowance = latest.elnatr * K;
  const push = (incident: CrimeIncident | null) => {
    if (incident) out.push(incident);
  };

  /* 6 — reported loss ------------------------------------------------------- */
  if (latest.netinc < 0) {
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-LOSS`,
      family: 'EARNINGS',
      patternId: 'BNK-LOSS-06',
      title: 'Quarterly loss reported',
      amountUsd: Math.abs(latest.netinc) * K,
      amountBasis: '|NETINC| × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: Math.abs(latest.netinc) * K > asset * 0.005 ? 'high' : 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'NETINC < 0; amount = |NETINC| × 1,000',
        steps: [
          { label: 'Net income', detail: `NETINC ${num(latest.netinc)} thousand = ${usd(latest.netinc * K)}` },
          { label: 'Return on assets', detail: `${latest.roa.toFixed(2)}%` },
          { label: 'Size against assets', detail: pct(Math.abs(latest.netinc) / latest.asset) },
        ],
        threshold: 'a negative reported quarter; escalated when the loss exceeds 0.5% of assets',
        reverse: 'A loss is not a crime. It is included because loss plus weak reserves is the combination the other screens are built to size; the incident is labelled a condition, not a finding.',
      },
      details: [
        { label: 'Net income', value: usd(latest.netinc * K) },
        { label: 'Return on assets', value: `${latest.roa.toFixed(2)}%` },
        { label: 'Return on equity', value: `${latest.roe.toFixed(2)}%` },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-LOSS-06'],
    });
  }

  /* 7 — thin leverage capital ---------------------------------------------- */
  if (latest.asset > 0 && latest.eq / latest.asset < 0.05) {
    const shortfall = (latest.asset * 0.05 - latest.eq) * K;
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-EQUITY`,
      family: 'CAPITAL',
      patternId: 'BNK-EQUITY-07',
      title: 'Equity below 5% of assets',
      amountUsd: shortfall > 0 ? shortfall : null,
      amountBasis: '(ASSET × 5% − EQ) × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: latest.eq / latest.asset < 0.03 ? 'critical' : 'high',
      confidence: 'derived screen',
      methodology: {
        formula: 'EQ ÷ ASSET < 5%; shortfall = (ASSET × 0.05 − EQ) × 1,000',
        steps: [
          { label: 'Equity ratio', detail: `${usd(latest.eq * K)} ÷ ${usd(asset)} = ${pct(latest.eq / latest.asset)}` },
          { label: '5% target', detail: usd(latest.asset * 0.05 * K) },
          { label: 'Shortfall', detail: usd(shortfall) },
        ],
        threshold: 'reported equity under 5% of total assets',
        reverse: 'Both lines are published. 5% is this screen’s reference, not a capital category assigned by a regulator.',
      },
      details: [
        { label: 'Equity', value: usd(latest.eq * K) },
        { label: 'Equity ratio', value: pct(latest.eq / latest.asset) },
        { label: 'Shortfall to 5%', value: usd(shortfall) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-EQUITY-07'],
    });
  }

  /* 8 — equity fell quarter over quarter ----------------------------------- */
  const priorEq = ctx.eq[1];
  if (Number.isFinite(priorEq) && priorEq > 0 && latest.eq < priorEq) {
    const drop = (priorEq - latest.eq) * K;
    if (drop / (priorEq * K) >= 0.05) {
      push({
        ...shell(ctx, now),
        id: `${ctx.cert}:BNK-EQUITY-DROP`,
        family: 'CAPITAL',
        patternId: 'BNK-EQUITY-08',
        title: 'Equity fell more than 5% in one quarter',
        amountUsd: drop,
        amountBasis: '(EQ prior quarter − EQ latest) × 1,000',
        sourceAt: quarterLabel(ctx),
        severity: drop / (priorEq * K) >= 0.15 ? 'high' : 'medium',
        confidence: 'published figure',
        methodology: {
          formula: 'ΔEQ ÷ EQ prior ≥ 5%',
          steps: [
            { label: 'Prior quarter equity', detail: `${usd(priorEq * K)} (${ctx.quarters[1] ?? 'prior'})` },
            { label: 'Latest equity', detail: usd(latest.eq * K) },
            { label: 'Decline', detail: `${usd(drop)} = ${pct(drop / (priorEq * K))}` },
          ],
          threshold: 'a quarter-over-quarter equity decline of 5% or more',
          reverse: 'Two published quarters in the same series. Dividends, losses and share changes all move this line, so the incident reports the movement and not its cause.',
        },
        details: [
          { label: 'Prior equity', value: `${usd(priorEq * K)} (${ctx.quarters[1] ?? '—'})` },
          { label: 'Latest equity', value: usd(latest.eq * K) },
          { label: 'Decline', value: pct(drop / (priorEq * K)) },
        ],
        evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
        patterns: ['BNK-EQUITY-08'],
      });
    }
  }

  /* 9 — brokered funding concentration ------------------------------------- */
  if (latest.dep > 0 && latest.bro / latest.dep >= 0.25) {
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-BROKERED`,
      family: 'FUNDING',
      patternId: 'BNK-FUNDING-09',
      title: 'Brokered deposits above a quarter of deposits',
      amountUsd: latest.bro * K,
      amountBasis: 'BRO × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: latest.bro / latest.dep >= 0.5 ? 'high' : 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'BRO ÷ DEP ≥ 25%',
        steps: [
          { label: 'Brokered deposits', detail: usd(latest.bro * K) },
          { label: 'Total deposits', detail: usd(latest.dep * K) },
          { label: 'Share', detail: pct(latest.bro / latest.dep) },
        ],
        threshold: 'brokered deposits at or above 25% of total deposits',
        reverse: 'A published ratio. Rate-sensitive funding is not misconduct; it is the funding profile that makes the other screens matter more.',
      },
      details: [
        { label: 'Brokered deposits', value: usd(latest.bro * K) },
        { label: 'Total deposits', value: usd(latest.dep * K) },
        { label: 'Share of deposits', value: pct(latest.bro / latest.dep) },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-FUNDING-09'],
    });
  }

  /* 10 — balance-sheet growth well above the peer set ---------------------- */
  const oldest = ctx.asset[4];
  if (Number.isFinite(oldest) && oldest > 0 && latest.asset / oldest - 1 >= 0.25) {
    const growth = latest.asset / oldest - 1;
    push({
      ...shell(ctx, now),
      id: `${ctx.cert}:BNK-GROWTH`,
      family: 'FUNDING',
      patternId: 'BNK-GROWTH-10',
      title: `Assets grew ${(growth * 100).toFixed(1)}% in four quarters`,
      amountUsd: (latest.asset - oldest) * K,
      amountBasis: '(ASSET latest − ASSET four quarters back) × 1,000',
      sourceAt: quarterLabel(ctx),
      severity: growth >= 0.5 ? 'high' : 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'ASSET(t) ÷ ASSET(t−4) − 1 ≥ 25%',
        steps: [
          { label: 'Assets four quarters back', detail: `${usd(oldest * K)} (${ctx.quarters[4] ?? '—'})` },
          { label: 'Assets now', detail: usd(asset) },
          { label: 'Growth', detail: pct(growth) },
        ],
        threshold: 'year-over-year asset growth of 25% or more',
        reverse: 'Two points in the published series. Growth is a condition screen: rapid growth is where underwriting and reserve gaps usually surface first.',
      },
      details: [
        { label: 'Assets then', value: `${usd(oldest * K)} (${ctx.quarters[4] ?? '—'})` },
        { label: 'Assets now', value: usd(asset) },
        { label: 'Growth', value: pct(growth) },
        { label: 'Peer median ROA', value: ctx.peer ? `${ctx.peer.roa.toFixed(2)}%` : '—' },
      ],
      evidence: [{ label: 'FDIC financials', value: `certificate ${ctx.cert}` }],
      patterns: ['BNK-GROWTH-10'],
    });
  }

  return out;
}

/** The full institution screen set for one charter. */
export function detectInstitutionCrime(ctx: BankContext, now = new Date().toISOString()): CrimeIncident[] {
  return [...detectInstitutionScreensA(ctx, now), ...detectInstitutionScreensB(ctx, now)];
}

/** Run the institution screens over the whole FDIC payload, strongest gap first. */
export function detectAllInstitutionCrimes(
  financials: { quarter: string; peer: PeerMedians | null; institutions: Record<string, GaFinancial> },
  names: Map<string, { name: string; cert: string }>,
  now = new Date().toISOString(),
): CrimeIncident[] {
  const out: CrimeIncident[] = [];
  for (const [cert, fin] of Object.entries(financials.institutions)) {
    const named = names.get(cert) ?? { name: `FDIC certificate ${cert}`, cert };
    out.push(
      ...detectInstitutionCrime(
        {
          name: named.name,
          cert,
          latest: fin.latest,
          quarters: fin.quarters,
          asset: fin.asset,
          eq: fin.eq,
          netinc: fin.netinc,
          peer: financials.peer,
        },
        now,
      ),
    );
  }
  return out.sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0));
}
