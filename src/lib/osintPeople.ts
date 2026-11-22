/**
 * PEOPLE AND TRANSFER PATTERNS
 *
 * Turns live SEC Form 4 documents into per-person aggregates and screens their reported
 * transaction lines for the patterns a financial-espionage reviewer looks for first: late
 * reporting, near-total liquidation, exercise-and-sell on one date, rapid round trips,
 * gifts, indirect ownership, undisclosed Rule 10b5-1 plans, weekend-dated trades, size
 * outliers and same-bank clustering.
 *
 * Form 4 reports securities transactions. It does not report wire transfers, account
 * numbers or balances, so nothing here claims to be a wire record: the patterns are
 * threshold screens over published filing fields, and each pattern prints its threshold.
 * The FBI publishes no list of transfer patterns; these are this dashboard's derivation.
 */

import type { OsintFilingRow, OsintInsiderPayload, OsintTransaction } from './osintClient.ts';

export type PatternSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface TransferPattern {
  id: string;
  label: string;
  category: 'timing' | 'size' | 'structure' | 'coordination' | 'disclosure';
  severity: PatternSeverity;
  occurrences: number;
  detail: string;
  /** The threshold or published field the screen reads. */
  basis: string;
  accessions: string[];
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

export const PATTERN_NOTE =
  'Screens run over the transaction lines printed in SEC Form 4 documents. Form 4 covers ' +
  'securities transactions, not bank wires, so no wire, account number or balance is shown or ' +
  'implied. Each pattern prints the threshold it applies; the FBI publishes no pattern list, ' +
  'so these thresholds are this dashboard’s derivation.';

const DAY = 86_400_000;

const day = (value: string): number => {
  const time = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? time : NaN;
};

const businessDays = (from: string, to: string): number => {
  const start = day(from);
  const end = day(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return NaN;
  let total = 0;
  for (let cursor = start + DAY; cursor <= end; cursor += DAY) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) total += 1;
  }
  return total;
};

const valueOf = (line: OsintTransaction): number =>
  line.shares > 0 && line.price > 0 ? line.shares * line.price : NaN;

const median = (values: number[]): number => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return NaN;
  const sorted = [...clean].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const usd = (value: number): string => {
  if (!Number.isFinite(value)) return 'value not reported';
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const SALES = new Set(['S', 'D', 'F']);
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

export function roleText(bits: number, title: string): string {
  if (title) return title;
  if (bits & 1) return 'Officer';
  if (bits & 2) return 'Director';
  if (bits & 4) return '10% owner';
  return 'Other reporting person';
}

export function roleClass(bits: number): string {
  if (bits & 1) return 'ISSUER EMPLOYEE';
  if (bits & 2) return 'NON-EMPLOYEE DIRECTOR';
  if (bits & 4) return 'NON-EMPLOYEE OWNER';
  return 'REPORTING PERSON';
}

/** Group every parsed transaction line by reporting person. */
export function aggregatePeople(payload: OsintInsiderPayload): PersonAggregate[] {
  const byOwner = new Map<string, PersonAggregate>();
  const lines = payload.transactions ?? [];
  for (const line of lines) {
    const key = `${payload.issuer.cik}:${line.owner}`;
    let entry = byOwner.get(key);
    if (!entry) {
      entry = {
        key,
        name: line.owner,
        issuerKey: payload.issuer.key,
        issuerName: payload.issuer.name,
        bank: payload.issuer.bank,
        cik: payload.issuer.cik,
        ticker: payload.issuer.ticker,
        roleBits: line.roleBits,
        title: line.title,
        role: roleText(line.roleBits, line.title),
        roleClass: roleClass(line.roleBits),
        filings: [],
        transactions: [],
      };
      byOwner.set(key, entry);
    }
    entry.transactions.push(line);
    if (line.title && !entry.title) {
      entry.title = line.title;
      entry.role = line.title;
    }
  }
  for (const filing of payload.filings) {
    const key = `${payload.issuer.cik}:${filing.owner}`;
    const entry = byOwner.get(key);
    if (entry) entry.filings.push(filing);
    else {
      byOwner.set(key, {
        key,
        name: filing.owner,
        issuerKey: payload.issuer.key,
        issuerName: payload.issuer.name,
        bank: payload.issuer.bank,
        cik: payload.issuer.cik,
        ticker: payload.issuer.ticker,
        roleBits: filing.roleBits,
        title: filing.title,
        role: roleText(filing.roleBits, filing.title),
        roleClass: roleClass(filing.roleBits),
        filings: [filing],
        transactions: [],
      });
    }
  }
  return [...byOwner.values()].sort(
    (a, b) => b.transactions.length - a.transactions.length || a.name.localeCompare(b.name),
  );
}

/**
 * Threshold screens over the reported transaction lines. `owner` limits the screens to one
 * person; without it the screens run across every insider of the issuer (cluster screens).
 */
export function transferPatterns(lines: OsintTransaction[], owner?: string): TransferPattern[] {
  const scoped = owner ? lines.filter((line) => line.owner === owner) : lines;
  const patterns: TransferPattern[] = [];
  const push = (pattern: TransferPattern) => {
    if (pattern.occurrences > 0) patterns.push(pattern);
  };

  /* timing ----------------------------------------------------------------- */
  const late = scoped
    .map((line) => ({ line, lag: businessDays(line.traded, line.filed) }))
    .filter((entry) => Number.isFinite(entry.lag) && entry.lag > 2);
  if (late.length) {
    const worst = late.reduce((max, entry) => (entry.lag > max.lag ? entry : max), late[0]);
    push({
      id: 'late-filing',
      label: 'Form 4 filed after the two-business-day deadline',
      category: 'timing',
      severity: late.length >= 3 ? 'high' : 'medium',
      occurrences: late.length,
      detail: `${late.length} transaction${late.length === 1 ? '' : 's'} reported late; worst was ${worst.lag} business days after the trade (${worst.line.traded} → filed ${worst.line.filed}).`,
      basis: 'filingDate − transactionDate > 2 business days (Exchange Act §16(a) deadline)',
      accessions: unique(late.map((entry) => entry.line.accession)),
    });
  }

  const weekend = scoped.filter((line) => {
    const time = day(line.traded);
    if (!Number.isFinite(time)) return false;
    const weekday = new Date(time).getUTCDay();
    return weekday === 0 || weekday === 6;
  });
  if (weekend.length) {
    push({
      id: 'weekend-trade',
      label: 'Transaction dated on a weekend',
      category: 'timing',
      severity: 'medium',
      occurrences: weekend.length,
      detail: `${weekend.length} line${weekend.length === 1 ? '' : 's'} carry a Saturday or Sunday transaction date (${unique(weekend.map((line) => line.traded)).join(', ')}).`,
      basis: 'transactionDate weekday',
      accessions: unique(weekend.map((line) => line.accession)),
    });
  }

  /* size ------------------------------------------------------------------- */
  const sales = scoped.filter((line) => SALES.has(line.code) && line.shares > 0);
  const liquidations = sales.filter((line) => {
    const held = line.after >= 0 ? line.after : NaN;
    if (!Number.isFinite(held)) return false;
    return line.shares / (line.shares + held) >= 0.5;
  });
  if (liquidations.length) {
    const top = liquidations.reduce((max, line) => {
      const ratio = line.shares / (line.shares + line.after);
      const best = max.shares / (max.shares + max.after);
      return ratio > best ? line : max;
    }, liquidations[0]);
    push({
      id: 'near-total-liquidation',
      label: 'One filing disposes of half or more of the reported position',
      category: 'size',
      severity: 'high',
      occurrences: liquidations.length,
      detail: `Largest single disposition: ${top.shares.toLocaleString('en-US')} shares with ${top.after.toLocaleString('en-US')} left, i.e. ${((top.shares / (top.shares + top.after)) * 100).toFixed(1)}% of the reported position, on ${top.traded}.`,
      basis: 'transactionShares ÷ (transactionShares + sharesOwnedFollowingTransaction) ≥ 50%',
      accessions: unique(liquidations.map((line) => line.accession)),
    });
  }

  const values = scoped.map(valueOf).filter((value) => Number.isFinite(value) && value > 0);
  const medianValue = median(values);
  const outliers = scoped.filter((line) => {
    const value = valueOf(line);
    return Number.isFinite(value) && Number.isFinite(medianValue) && medianValue > 0 && value > medianValue * 3;
  });
  if (outliers.length) {
    const biggest = outliers.reduce((max, line) => (valueOf(line) > valueOf(max) ? line : max), outliers[0]);
    push({
      id: 'size-outlier',
      label: 'Transaction exceeds three times the median reported value',
      category: 'size',
      severity: 'medium',
      occurrences: outliers.length,
      detail: `${outliers.length} line${outliers.length === 1 ? '' : 's'} above 3× the median (${usd(medianValue)}); largest ${usd(valueOf(biggest))} on ${biggest.traded}.`,
      basis: 'shares × price > 3 × median reported transaction value in the window',
      accessions: unique(outliers.map((line) => line.accession)),
    });
  }

  /* structure -------------------------------------------------------------- */
  const gifts = scoped.filter((line) => line.code === 'G' || /gift/i.test(line.nature));
  if (gifts.length) {
    push({
      id: 'gift-transfer',
      label: 'Shares transferred as a gift',
      category: 'structure',
      severity: 'info',
      occurrences: gifts.length,
      detail: `${gifts.length} gift line${gifts.length === 1 ? '' : 's'}, ${gifts.reduce((total, line) => total + Math.max(0, line.shares), 0).toLocaleString('en-US')} shares in total.`,
      basis: 'transactionCode G, or natureOfOwnership naming a gift',
      accessions: unique(gifts.map((line) => line.accession)),
    });
  }

  const indirect = scoped.filter((line) => line.ownership === 'I' || Boolean(line.nature));
  if (indirect.length) {
    const natures = unique(indirect.map((line) => line.nature));
    push({
      id: 'indirect-holding',
      label: 'Disposition through an indirect or trust holding',
      category: 'structure',
      severity: 'info',
      occurrences: indirect.length,
      detail: `${indirect.length} line${indirect.length === 1 ? '' : 's'} report indirect ownership${natures.length ? ` (${natures.join('; ')})` : ''}.`,
      basis: 'directOrIndirectOwnership = I, or natureOfOwnership text',
      accessions: unique(indirect.map((line) => line.accession)),
    });
  }

  const exercises = scoped.filter((line) => line.code === 'M' || line.derivative);
  const sameDaySale = exercises.filter((exercise) =>
    sales.some((sale) => sale.traded === exercise.traded && sale.owner === exercise.owner),
  );
  if (sameDaySale.length) {
    push({
      id: 'exercise-and-sell',
      label: 'Option exercise and sale reported on the same date',
      category: 'structure',
      severity: 'high',
      occurrences: sameDaySale.length,
      detail: `${sameDaySale.length} exercise${sameDaySale.length === 1 ? '' : 's'} matched to a disposition on the same transaction date (${unique(sameDaySale.map((line) => line.traded)).join(', ')}).`,
      basis: 'code M (or derivative line) and code S/D on one transactionDate for one owner',
      accessions: unique(sameDaySale.map((line) => line.accession)),
    });
  }

  const withholding = scoped.filter((line) => line.code === 'F');
  if (withholding.length >= 2) {
    push({
      id: 'withholding-lot',
      label: 'Multiple tax-withholding lines on one date',
      category: 'structure',
      severity: 'info',
      occurrences: withholding.length,
      detail: `${withholding.length} code F lines, consistent with share withholding at vesting (${unique(withholding.map((line) => line.traded)).join(', ')}).`,
      basis: 'transactionCode F count',
      accessions: unique(withholding.map((line) => line.accession)),
    });
  }

  /* disclosure ------------------------------------------------------------- */
  const undisclosedPlan = sales.filter((line) => !line.tenb5one);
  if (sales.length && undisclosedPlan.length) {
    push({
      id: 'no-10b5-1-flag',
      label: 'Sale without a Rule 10b5-1 plan flag',
      category: 'disclosure',
      severity: 'info',
      occurrences: undisclosedPlan.length,
      detail: `${undisclosedPlan.length} of ${sales.length} sale lines do not carry the aff10b5One checkbox; the filing does not state a trading plan.`,
      basis: 'aff10b5One checkbox absent on a sale line',
      accessions: unique(undisclosedPlan.map((line) => line.accession)),
    });
  }

  /* coordination ----------------------------------------------------------- */
  if (!owner) {
    const saleLines = scoped.filter((line) => line.code === 'S');
    const clusters: OsintTransaction[][] = [];
    for (const line of saleLines) {
      const anchor = day(line.traded);
      if (!Number.isFinite(anchor)) continue;
      const window = saleLines.filter((other) => {
        const time = day(other.traded);
        return Number.isFinite(time) && Math.abs(time - anchor) <= 30 * DAY;
      });
      const sellers = new Set(window.map((entry) => entry.owner));
      if (sellers.size >= 3) clusters.push(window);
    }
    if (clusters.length) {
      const widest = clusters.reduce((max, group) => (group.length > max.length ? group : max), clusters[0]);
      push({
        id: 'cluster-selling',
        label: 'Three or more insiders sold inside a thirty-day window',
        category: 'coordination',
        severity: 'high',
        occurrences: unique(widest.map((line) => line.owner)).length,
        detail: `${new Set(widest.map((line) => line.owner)).size} insiders sold within thirty days: ${unique(widest.map((line) => line.owner)).join(', ')}.`,
        basis: '≥ 3 distinct reporting owners with code S in any rolling 30-day window',
        accessions: unique(widest.map((line) => line.accession)),
      });
    }

    const saleValueByOwner = new Map<string, number>();
    for (const line of scoped.filter((entry) => entry.code === 'S')) {
      const value = valueOf(line);
      if (!Number.isFinite(value)) continue;
      saleValueByOwner.set(line.owner, (saleValueByOwner.get(line.owner) ?? 0) + value);
    }
    const totalSaleValue = [...saleValueByOwner.values()].reduce((total, value) => total + value, 0);
    if (totalSaleValue > 0 && saleValueByOwner.size > 1) {
      const [topOwner, topValue] = [...saleValueByOwner.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topValue / totalSaleValue >= 0.5) {
        push({
          id: 'single-owner-dominance',
          label: 'One insider accounts for half of all reported sale value',
          category: 'coordination',
          severity: 'medium',
          occurrences: 1,
          detail: `${topOwner} accounts for ${((topValue / totalSaleValue) * 100).toFixed(1)}% of ${usd(totalSaleValue)} in reported sales by this issuer.`,
          basis: 'one owner’s sale value ÷ total reported sale value ≥ 50%',
          accessions: unique(scoped.filter((line) => line.owner === topOwner).map((line) => line.accession)),
        });
      }
    }

    const prices = scoped.filter((line) => line.price > 0).map((line) => line.price);
    const medianPrice = median(prices);
    const dispersed = scoped.filter(
      (line) => line.price > 0 && Number.isFinite(medianPrice) && medianPrice > 0 && Math.abs(line.price - medianPrice) / medianPrice > 0.2,
    );
    if (dispersed.length) {
      push({
        id: 'price-dispersion',
        label: 'Reported prices differ from the window median by more than twenty percent',
        category: 'coordination',
        severity: 'info',
        occurrences: dispersed.length,
        detail: `${dispersed.length} line${dispersed.length === 1 ? '' : 's'} priced outside ±20% of the ${medianPrice.toFixed(2)} median reported price.`,
        basis: '|reported price − median reported price| ÷ median > 20%',
        accessions: unique(dispersed.map((line) => line.accession)),
      });
    }

    const roundTrips: OsintTransaction[] = [];
    for (const buy of scoped.filter((line) => line.code === 'P')) {
      const buyTime = day(buy.traded);
      if (!Number.isFinite(buyTime)) continue;
      const laterSale = scoped.find((line) => {
        if (line.code !== 'S' || line.owner !== buy.owner) return false;
        const saleTime = day(line.traded);
        return Number.isFinite(saleTime) && saleTime > buyTime && saleTime - buyTime <= 30 * DAY;
      });
      if (laterSale) roundTrips.push(buy, laterSale);
    }
    if (roundTrips.length) {
      push({
        id: 'rapid-round-trip',
        label: 'Purchase followed by a sale within thirty days',
        category: 'coordination',
        severity: 'medium',
        occurrences: new Set(roundTrips.map((line) => line.owner)).size,
        detail: `${new Set(roundTrips.map((line) => line.owner)).size} insider${roundTrips.length === 1 ? '' : 's'} bought and then sold inside thirty days: ${unique(roundTrips.map((line) => line.owner)).join(', ')}.`,
        basis: 'code P then code S for one owner within 30 days',
        accessions: unique(roundTrips.map((line) => line.accession)),
      });
    }
  }

  const order: Record<PatternSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
  return patterns.sort((a, b) => order[a.severity] - order[b.severity] || b.occurrences - a.occurrences);
}
