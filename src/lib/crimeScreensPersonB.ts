import type { PersonView } from './financialIndicators.ts';
import type { OsintTransaction } from './osintClient.ts';
import type { CrimeIncident } from './crimeEngine.ts';
import { base, daysBetween, grossBasis, lineValue, median, num, toLines, usd } from './crimeEngine.ts';
import { detectPersonScreensA } from './crimeScreensPersonA.ts';

/**
 * INDIVIDUAL INSIDER SCREENS, PART B
 *
 * Screens 7–10 (size outlier against the person's own median, buy-then-sell round trip,
 * unpriced reportable block, discounted exercise against the reported sale price), the
 * company-level cluster screen, and detectPersonCrimes, which the two panels call.
 */
export function detectPersonScreensB(person: PersonView, transactions: OsintTransaction[], now: string): CrimeIncident[] {
  const lines = toLines(person, transactions);
  const out: CrimeIncident[] = [];
  const push = (incident: CrimeIncident | null) => {
    if (incident) out.push(incident);
  };
  const priced = lines.filter((line) => lineValue(line) !== null);

  /* 7 — size outlier against the person's own trade history ---------------- */
  const values = priced.map((line) => lineValue(line)!).filter((value) => value > 0);
  const typical = median(values);
  const biggest = priced.map((line) => ({ line, value: lineValue(line)! })).sort((a, b) => b.value - a.value)[0];
  if (biggest && values.length >= 3 && typical > 0 && biggest.value >= typical * 3 && biggest.value >= 50_000) {
    push({
      ...base(person, now),
      id: `${person.key}:INS-SIZE`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-SIZE-08',
      title: `Single line ${(biggest.value / typical).toFixed(1)}× this person's median reported trade`,
      amountUsd: biggest.value,
      amountBasis: grossBasis(biggest.line),
      sourceAt: biggest.line.traded || biggest.line.filed,
      severity: 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'max(shares × price) ÷ median(shares × price) ≥ 3 and max ≥ $50,000',
        steps: [
          { label: 'Value every priced line', detail: `${values.length} line(s)` },
          { label: 'Median', detail: usd(typical) },
          { label: 'Largest', detail: usd(biggest.value) },
          { label: 'Divide', detail: `${(biggest.value / typical).toFixed(2)}× the median` },
        ],
        threshold: 'three times the person’s median priced transaction and at least $50,000',
        reverse: 'A ratio over the person’s own published lines. Excluding small or repeated lines changes the median, and the panel shows the median so the ratio can be recomputed.',
      },
      details: [
        { label: 'Priced lines', value: `${values.length}` },
        { label: 'Median line', value: usd(typical) },
        { label: 'Largest line', value: usd(biggest.value) },
        { label: 'Transaction code', value: biggest.line.code || 'not reported' },
      ],
      evidence: [{ label: 'Form 4 document', value: biggest.line.traded, url: biggest.line.url }],
      patterns: ['INS-SIZE-08'],
    });
  }

  /* 8 — buy then sell inside thirty days ----------------------------------- */
  const buys = lines.filter((line) => line.code === 'P' && line.traded);
  const sells = lines.filter((line) => line.code === 'S' && line.traded);
  for (const buy of buys) {
    const follow = sells.find((sale) => {
      const gap = daysBetween(buy.traded, sale.traded);
      return Number.isFinite(gap) && gap >= 0 && gap <= 30;
    });
    if (!follow) continue;
    const roundTrip = Math.min(lineValue(buy) ?? 0, lineValue(follow) ?? 0);
    push({
      ...base(person, now),
      id: `${person.key}:INS-ROUNDTRIP:${buy.traded}:${follow.traded}`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-ROUNDTRIP-09',
      title: `Purchase followed by a sale ${daysBetween(buy.traded, follow.traded)} days later`,
      amountUsd: roundTrip > 0 ? roundTrip : null,
      amountBasis: 'smaller of the purchase and sale values on the two lines',
      sourceAt: follow.traded,
      severity: 'high',
      confidence: 'derived screen',
      methodology: {
        formula: 'min(buy value, sale value) where 0 ≤ sale date − buy date ≤ 30',
        steps: [
          { label: 'Purchase', detail: `${buy.traded} · ${num(buy.shares)} sh @ $${buy.price.toFixed(4)}` },
          { label: 'Sale', detail: `${follow.traded} · ${num(follow.shares)} sh @ $${follow.price.toFixed(4)}` },
          { label: 'Gap', detail: `${daysBetween(buy.traded, follow.traded)} days` },
          { label: 'Value', detail: `${usd(lineValue(buy))} vs ${usd(lineValue(follow))} → ${usd(roundTrip)}` },
        ],
        threshold: 'a purchase and a sale by the same person within thirty calendar days',
        reverse: 'Two published dates and two priced lines. The incident reports the smaller leg so no round-trip gain is asserted.',
      },
      details: [
        { label: 'Purchase value', value: usd(lineValue(buy)) },
        { label: 'Sale value', value: usd(lineValue(follow)) },
        { label: 'Shares bought', value: num(buy.shares) },
        { label: 'Shares sold', value: num(follow.shares) },
      ],
      evidence: [
        { label: 'Purchase', value: buy.traded, url: buy.url },
        { label: 'Sale', value: follow.traded, url: follow.url },
      ],
      patterns: ['INS-ROUNDTRIP-09'],
    });
    break;
  }

  /* 9 — unpriced transfer of a reportable block ---------------------------- */
  const unpriced = lines
    .filter((line) => line.shares >= 1000 && line.price === 0 && ['A', 'G', 'J', 'W', 'C'].includes(line.code))
    .sort((a, b) => b.shares - a.shares)[0];
  if (unpriced) {
    push({
      ...base(person, now),
      id: `${person.key}:INS-UNPRICED`,
      family: 'INSIDER_DISCLOSURE',
      patternId: 'INS-UNPRICED-11',
      title: `Unpriced ${unpriced.code} transfer of ${num(unpriced.shares)} shares`,
      amountUsd: null,
      amountBasis: 'no price is reported on the line, so no dollar figure is claimed',
      sourceAt: unpriced.traded || unpriced.filed,
      severity: 'low',
      confidence: 'derived screen',
      methodology: {
        formula: 'code ∈ {A, G, J, W, C} AND shares ≥ 1,000 AND reported price = 0',
        steps: [
          { label: 'Select lines', detail: 'acquisition, gift, other, will or conversion codes' },
          { label: 'Price test', detail: 'transactionPricePerShare = 0 or absent' },
          { label: 'Refuse a figure', detail: 'with no published price, any dollar value would be an estimate' },
        ],
        threshold: 'any unpriced line of 1,000 shares or more',
        reverse: 'The filing itself reports no price. The incident deliberately carries no dollar amount so nothing here is an invented valuation.',
      },
      details: [
        { label: 'Transaction code', value: unpriced.code },
        { label: 'Shares', value: num(unpriced.shares) },
        { label: 'Holding after', value: num(unpriced.after) },
        { label: 'Ownership', value: unpriced.ownership === 'I' ? 'indirect' : 'direct' },
      ],
      evidence: [{ label: 'Form 4 document', value: unpriced.traded || unpriced.filed, url: unpriced.url }],
      patterns: ['INS-UNPRICED-11'],
    });
  }

  /* 10 — discounted exercise against the reported sale price --------------- */
  const exercise = lines.find((line) => line.code === 'M' && line.price > 0);
  const saleMedian = median(sells.map((line) => line.price));
  if (exercise && saleMedian > 0 && exercise.price < saleMedian * 0.5) {
    const spread = (saleMedian - exercise.price) * exercise.shares;
    push({
      ...base(person, now),
      id: `${person.key}:INS-DISCOUNT`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-DISCOUNT-12',
      title: `Exercise price ${((exercise.price / saleMedian) * 100).toFixed(0)}% of the reported sale price`,
      amountUsd: spread,
      amountBasis: '(median reported sale price − exercise price) × exercised shares',
      sourceAt: exercise.traded || exercise.filed,
      severity: 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'spread = (median sale price − exercise price) × exercised shares',
        steps: [
          { label: 'Exercise line', detail: `${num(exercise.shares)} sh @ $${exercise.price.toFixed(4)}` },
          { label: 'Median sale price', detail: `$${saleMedian.toFixed(4)} across ${sells.length} sale line(s)` },
          { label: 'Subtract', detail: `$${(saleMedian - exercise.price).toFixed(4)} per share` },
          { label: 'Multiply', detail: `${num(exercise.shares)} shares → ${usd(spread)}` },
        ],
        threshold: 'exercise price below half the median reported sale price',
        reverse: 'Both prices are published. The spread is arithmetic on them; it is not a profit claim, because fees, taxes and vesting are not published.',
      },
      details: [
        { label: 'Exercise price', value: `$${exercise.price.toFixed(4)}` },
        { label: 'Median sale price', value: `$${saleMedian.toFixed(4)}` },
        { label: 'Exercised shares', value: num(exercise.shares) },
        { label: 'Per-share spread', value: `$${(saleMedian - exercise.price).toFixed(4)}` },
      ],
      evidence: [{ label: 'Exercise filing', value: exercise.traded, url: exercise.url }],
      patterns: ['INS-DISCOUNT-12'],
    });
  }

  return out;
}

/**
 * COMPANY-LEVEL CLUSTER: three or more insiders selling inside ten days. This is the one
 * pattern that cannot be seen from a single person's filings, so it is computed over the
 * whole roster the individuals panel already holds.
 */
export function detectClusterCrime(people: PersonView[], transactions: OsintTransaction[], now = new Date().toISOString()): CrimeIncident | null {
  const sales = transactions.filter((line) => (line.code || '').toUpperCase() === 'S' && line.traded && line.owner);
  if (sales.length < 3) return null;
  const days = [...new Set(sales.map((line) => line.traded))].sort();
  let best: { window: string[]; owners: Set<string>; lines: OsintTransaction[] } | null = null;
  for (const start of days) {
    const window = days.filter((day) => {
      const gap = daysBetween(start, day);
      return Number.isFinite(gap) && gap >= 0 && gap <= 10;
    });
    const lines = sales.filter((line) => window.includes(line.traded));
    const owners = new Set(lines.map((line) => line.owner));
    if (owners.size >= 3 && (!best || owners.size > best.owners.size)) best = { window, owners, lines };
  }
  if (!best) return null;
  const proceeds = best.lines.reduce((sum, line) => sum + (lineValue(line) ?? 0), 0);
  const issuer = people[0];
  return {
    id: `CLUSTER:${issuer?.issuerKey ?? 'unknown'}:${best.window[0]}:${best.window[best.window.length - 1]}`,
    detectedAt: now,
    family: 'GOVERNANCE',
    patternId: 'INS-CLUSTER-10',
    title: `${best.owners.size} insiders sold inside ${best.window.length <= 1 ? 'one day' : `${daysBetween(best.window[0], best.window[best.window.length - 1])} days`}`,
    subject: `${best.owners.size} insiders at ${issuer?.issuerName ?? 'the company'}`,
    subjectKind: 'institution',
    institution: `${issuer?.issuerName ?? '—'} — ${issuer?.bank ?? '—'}`,
    amountUsd: proceeds > 0 ? proceeds : null,
    amountBasis: 'Σ shares × reported price across every sale line in the window',
    sourceAt: best.window[best.window.length - 1],
    severity: best.owners.size >= 5 ? 'critical' : 'high',
    confidence: 'derived screen',
    methodology: {
      formula: 'distinct owners with a code S line inside any rolling 10-day window ≥ 3',
      steps: [
        { label: 'Group sales by date', detail: `${sales.length} sale line(s)` },
        { label: 'Slide 10-day window', detail: `${best.window[0]} → ${best.window[best.window.length - 1]}` },
        { label: 'Count distinct owners', detail: [...best.owners].join(', ') },
        { label: 'Add proceeds', detail: usd(proceeds) },
      ],
      threshold: 'three or more distinct reporting persons selling within ten calendar days',
      reverse: 'Dates, owners and prices are all published. The window is stated so the same set can be rebuilt by hand.',
    },
    details: [
      { label: 'Window', value: `${best.window[0]} → ${best.window[best.window.length - 1]}` },
      { label: 'Insiders selling', value: [...best.owners].join(', ') },
      { label: 'Sale lines', value: `${best.lines.length}` },
      { label: 'Total proceeds', value: usd(proceeds) },
    ],
    evidence: best.lines.slice(0, 6).map((line) => ({
      label: line.owner,
      value: `${line.traded} · ${num(line.shares)} sh @ $${line.price.toFixed(2)}`,
      url: line.url,
    })),
    patterns: ['INS-CLUSTER-10', 'INS-TIMING-CLUSTER-10'],
    sources: [`SEC Form 4 (CIK ${issuer?.issuerKey ?? '—'})`],
  };
}

export function detectPersonCrimes(people: PersonView[], transactions: OsintTransaction[], now = new Date().toISOString()): CrimeIncident[] {
  const out: CrimeIncident[] = [];
  for (const person of people) {
    out.push(...detectPersonScreensA(person, transactions, now));
    out.push(...detectPersonScreensB(person, transactions, now));
  }
  const clusterIncident = detectClusterCrime(people, transactions, now);
  if (clusterIncident) out.push(clusterIncident);
  return out;
}
