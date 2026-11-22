/**
 * INSTITUTION INDICATOR FAMILIES, SECOND MODULE
 *
 * Insider activity, disclosure and public records, and structure and peer rank: the last
 * three families of the first set. The shared helper preamble is repeated here so this
 * module needs nothing from the index except the framework types.
 */

import { safeRatio, seriesAt, seriesGrowth, stdev } from './osintFinancials.ts';
import {
  count,
  dayGap,
  daysSince,
  pct,
  sum,
  tradeValue,
  usd,
  usdThousands,
  type Family,
  type InstitutionContext,
  type RuleResult,
} from './osintIndicatorTypes.ts';
import { transferPatterns } from './osintPeople.ts';

type Rule = {
  key: string;
  label: string;
  basis: string;
  source: string;
  run: (ctx: InstitutionContext) => RuleResult;
};

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: InstitutionContext) => RuleResult,
): Rule => ({ key, label, basis, source, run });

const FDIC = 'FDIC call report';
const SOD = 'FDIC Summary of Deposits';
const SEC = 'SEC EDGAR Form 4';
const FEED = 'OSINT feed';

const latest = (ctx: InstitutionContext) => ctx.fin?.latest ?? null;
const saleLines = (ctx: InstitutionContext) => ctx.transactions.filter((line) => line.code === 'S');
const purchaseLines = (ctx: InstitutionContext) => ctx.transactions.filter((line) => line.code === 'P');
const saleValue = (ctx: InstitutionContext) =>
  sum(saleLines(ctx).map((line) => (line.shares > 0 && line.price > 0 ? line.shares * line.price : NaN)));
const purchaseValue = (ctx: InstitutionContext) =>
  sum(purchaseLines(ctx).map((line) => (line.shares > 0 && line.price > 0 ? line.shares * line.price : NaN)));

function businessLate(traded: string, filed: string): boolean {
  const start = Date.parse(`${traded}T00:00:00Z`);
  const end = Date.parse(`${filed}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  let days = 0;
  for (let cursor = start + 86_400_000; cursor <= end; cursor += 86_400_000) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days > 2;
}

const insider: Family<InstitutionContext> = {
  id: 'insider',
  label: 'Insider activity at the bank',
  blurb: 'What the bank’s own officers, directors and owners reported trading, and the screens that fire on it.',
  rules: [
    rule('form4-count', 'Form 4 filings in the window', 'count of filings', SEC, (c) =>
      c.filings.length ? count(c.filings.length) : null),
    rule('insider-count', 'Distinct reporting insiders', 'distinct rptOwnerName', SEC, (c) =>
      c.transactions.length ? count(new Set(c.transactions.map((line) => line.owner)).size) : null),
    rule('sale-value', 'Reported sale value', 'sum of shares × price on sale lines', SEC, (c) =>
      saleLines(c).length ? usd(saleValue(c)) : null),
    rule('purchase-value', 'Reported purchase value', 'sum of shares × price on purchase lines', SEC, (c) =>
      purchaseLines(c).length ? usd(purchaseValue(c)) : null),
    rule('net-direction', 'Net insider direction', 'sale value − purchase value', SEC, (c) => {
      if (!saleLines(c).length && !purchaseLines(c).length) return null;
      const net = saleValue(c) - purchaseValue(c);
      return { value: `${net >= 0 ? 'net selling' : 'net buying'} ${usd(Math.abs(net))}`, tone: net > 0 ? 'watch' : 'info' };
    }),
    rule('sale-purchase-ratio', 'Sales per dollar of purchases', 'sale value ÷ purchase value', SEC, (c) => {
      const bought = purchaseValue(c);
      return bought > 0 ? `${(saleValue(c) / bought).toFixed(2)}×` : null;
    }),
    rule('sellers', 'Distinct sellers', 'distinct owners on code S', SEC, (c) =>
      saleLines(c).length ? count(new Set(saleLines(c).map((line) => line.owner)).size) : null),
    rule('buyers', 'Distinct buyers', 'distinct owners on code P', SEC, (c) =>
      purchaseLines(c).length ? count(new Set(purchaseLines(c).map((line) => line.owner)).size) : null),
    rule('largest-sale', 'Largest single reported sale', 'max shares × price on code S', SEC, (c) => {
      const values = saleLines(c).map(tradeValue).filter((value) => Number.isFinite(value));
      return values.length ? usd(Math.max(...values)) : null;
    }),
    rule('largest-purchase', 'Largest single reported purchase', 'max shares × price on code P', SEC, (c) => {
      const values = purchaseLines(c).map(tradeValue).filter((value) => Number.isFinite(value));
      return values.length ? usd(Math.max(...values)) : null;
    }),
    rule('shares-sold', 'Shares sold', 'sum of transactionShares on code S', SEC, (c) =>
      saleLines(c).length ? count(sum(saleLines(c).map((line) => Math.max(0, line.shares)))) : null),
    rule('shares-bought', 'Shares bought', 'sum of transactionShares on code P', SEC, (c) =>
      purchaseLines(c).length ? count(sum(purchaseLines(c).map((line) => Math.max(0, line.shares)))) : null),
    rule('latest-trade', 'Most recent insider transaction', 'max transactionDate', SEC, (c) =>
      c.transactions.length ? [...c.transactions].map((line) => line.traded).sort().pop() ?? null : null),
    rule('recent-filings', 'Filings in the last ninety days', 'filingDate within 90 days', SEC, (c) =>
      c.filings.length ? count(c.filings.filter((filing) => daysSince(filing.filed) <= 90).length) : null),
    rule('late-filings', 'Late Form 4 filings', 'filingDate − transactionDate > 2 business days', SEC, (c) =>
      c.transactions.length
        ? count(c.transactions.filter((line) => businessLate(line.traded, line.filed)).length)
        : null),
    rule('mean-lag', 'Mean transaction-to-filing lag', 'mean calendar days from trade to filing', SEC, (c) => {
      const gaps = c.transactions.map((line) => dayGap(line.traded, line.filed)).filter((gap) => Number.isFinite(gap));
      return gaps.length ? `${(sum(gaps) / gaps.length).toFixed(1)} days` : null;
    }),
    rule('pattern-cluster', 'Cluster-selling screen', '≥ 3 insiders sold within 30 days', SEC, (c) => {
      const patterns = transferPatterns(c.transactions);
      const hit = patterns.find((pattern) => pattern.id === 'cluster-selling');
      return hit ? { value: hit.detail, tone: 'risk' as const } : 'no cluster detected';
    }),
    rule('pattern-exercise', 'Exercise-and-sell screen', 'code M and code S on one date', SEC, (c) => {
      const patterns = transferPatterns(c.transactions);
      const hit = patterns.find((pattern) => pattern.id === 'exercise-and-sell');
      return hit ? { value: hit.detail, tone: 'watch' as const } : 'no same-day exercise found';
    }),
    rule('pattern-liquidation', 'Near-total liquidation screen', 'disposed ≥ 50% of reported position', SEC, (c) => {
      const patterns = transferPatterns(c.transactions);
      const hit = patterns.find((pattern) => pattern.id === 'near-total-liquidation');
      return hit ? { value: hit.detail, tone: 'watch' as const } : 'no near-total disposition found';
    }),
    rule('sale-vs-deposits', 'Insider sale value against Georgia deposits', 'sale value ÷ SOD GA deposits', SEC, (c) => {
      const value = saleValue(c);
      return c.sod && value > 0 ? pct(safeRatio(value, c.sod.depositsUsd), 3) : null;
    }),
  ],
};

const disclosure: Family<InstitutionContext> = {
  id: 'disclosure',
  label: 'Disclosure & regulatory exposure',
  blurb: 'What regulators, courts and the bank’s own filings published about this institution in the live window.',
  rules: [
    rule('items', 'Live records naming the bank', 'count of feed items attributing this institution', FEED, (c) =>
      c.items.length ? count(c.items.length) : 'no record names this bank in the window'),
    rule('publishers', 'Distinct publishers', 'distinct publisher across those records', FEED, (c) =>
      count(new Set(c.items.map((item) => item.publisher)).size)),
    rule('sec-8k', 'SEC current reports (8-K)', 'count of titles containing 8-K', SEC, (c) =>
      count(c.items.filter((item) => /8-K/i.test(item.title)).length)),
    rule('sec-periodic', 'SEC periodic reports (10-Q / 10-K)', 'count of titles containing 10-Q or 10-K', SEC, (c) =>
      count(c.items.filter((item) => /10-[QK]/i.test(item.title)).length)),
    rule('federal-register', 'Federal Register documents', 'count of publisher = Federal Register', FEED, (c) =>
      count(c.items.filter((item) => /federal register/i.test(item.publisher)).length)),
    rule('enforcement', 'Enforcement records', 'count of kind = enforcement', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'enforcement').length)),
    rule('sanctions', 'Sanctions records', 'count of kind = sanctions', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'sanctions').length)),
    rule('press', 'Press releases', 'count of kind = press', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'press').length)),
    rule('litigation', 'Litigation records', 'count of kind = litigation', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'litigation').length)),
    rule('critical', 'Critical-severity records', 'count of severity = critical', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'critical').length)),
    rule('high', 'High-severity records', 'count of severity = high', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'high').length)),
    rule('since-latest', 'Days since the latest record', 'now − published', FEED, (c) => {
      if (!c.items.length) return null;
      const latestIso = [...c.items].map((item) => item.published).sort().pop();
      return latestIso ? `${daysSince(latestIso)} days` : null;
    }),
    rule('latest-publisher', 'Publisher of the latest record', 'publisher of the newest item', FEED, (c) => {
      if (!c.items.length) return null;
      return [...c.items].sort((a, b) => b.published.localeCompare(a.published))[0].publisher;
    }),
    rule('latest-title', 'Headline of the latest record', 'title of the newest item', FEED, (c) => {
      if (!c.items.length) return null;
      return [...c.items].sort((a, b) => b.published.localeCompare(a.published))[0].title;
    }),
    rule('items-30', 'Records published in the last thirty days', 'published within 30 days', FEED, (c) =>
      count(c.items.filter((item) => daysSince(item.published) <= 30).length)),
    rule('edgar-window', 'EDGAR filings read for this bank', 'count of Form 4 documents parsed', SEC, (c) =>
      c.filings.length ? count(c.filings.length) : null),
    rule('latest-form4', 'Most recent Form 4 filing date', 'max filingDate', SEC, (c) =>
      c.filings.length ? [...c.filings].map((filing) => filing.filed).sort().pop() ?? null : null),
    rule('source-breadth', 'Distinct source systems', 'distinct sourceId across the records', FEED, (c) =>
      count(new Set(c.items.map((item) => item.sourceId)).size)),
    rule('anomalies-per-billion', 'Records per billion dollars of assets', 'item count ÷ assets in billions', FEED, (c) => {
      const fin = latest(c);
      const billions = fin ? fin.asset / 1_000_000 : c.inst.assetsThousands / 1_000_000;
      return billions > 0 ? `${(c.items.length / billions).toFixed(2)}` : null;
    }),
    rule('sector-flag', 'Sector-level records', 'count of sector-flagged records', FEED, (c) =>
      count(c.items.filter((item) => item.sector).length)),
  ],
};

const structure: Family<InstitutionContext> = {
  id: 'structure',
  label: 'Structure, footprint & peer position',
  blurb: 'Who the charter is, where it operates and how it ranks against the other Georgia institutions.',
  rules: [
    rule('assets-rank', 'Asset rank among Georgia charters', 'rank by FDIC ASSET', FDIC, (c) =>
      c.ranks.assets ? `#${c.ranks.assets} of ${c.statewide.institutions}` : null),
    rule('deposits-rank', 'Georgia deposit rank', 'rank by SOD branch deposits', SOD, (c) =>
      c.ranks.deposits ? `#${c.ranks.deposits} of ${c.statewide.institutions}` : null),
    rule('assets', 'Total assets', 'ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.asset) : usdThousands(c.inst.assetsThousands);
    }),
    rule('city', 'Head office city', 'FDIC institution record', 'FDIC institutions API', (c) => c.inst.city || null),
    rule('holding', 'Holding company', 'FDIC NAMEHCR', 'FDIC institutions API', (c) =>
      c.inst.holdingCompany || 'no holding company filed'),
    rule('cert', 'FDIC certificate number', 'CERT', 'FDIC institutions API', (c) => c.inst.cert || null),
    rule('branches', 'Georgia branches', 'count of SOD branches', SOD, (c) => (c.sod ? count(c.sod.branches) : null)),
    rule('counties', 'Georgia counties served', 'distinct SOD county FIPS', SOD, (c) => (c.sod ? count(c.sod.counties) : null)),
    rule('deposits-per-branch', 'Georgia deposits per branch', 'SOD deposits ÷ branches', SOD, (c) =>
      c.sod && c.sod.branches ? usd(c.sod.depositsUsd / c.sod.branches) : null),
    rule('primary-county', 'Largest county by deposits', 'SOD county with the most deposits', SOD, (c) =>
      c.sod?.primaryCounty || null),
    rule('primary-share', 'Share of deposits in the largest county', 'primary county ÷ total SOD deposits', SOD, (c) =>
      c.sod ? pct(safeRatio(c.sod.primaryDepositsUsd, c.sod.depositsUsd)) : null),
    rule('branches-per-county', 'Branches per county served', 'branches ÷ counties', SOD, (c) =>
      c.sod && c.sod.counties ? (c.sod.branches / c.sod.counties).toFixed(2) : null),
    rule('state-deposit-share', 'Share of Georgia branch deposits', 'SOD deposits ÷ statewide SOD deposits', SOD, (c) =>
      c.sod && c.statewide.depositsUsd ? pct(safeRatio(c.sod.depositsUsd, c.statewide.depositsUsd), 3) : null),
    rule('state-branch-share', 'Share of Georgia branches', 'branches ÷ statewide branches', SOD, (c) =>
      c.sod && c.statewide.branches ? pct(safeRatio(c.sod.branches, c.statewide.branches), 3) : null),
    rule('assets-per-branch', 'Assets per Georgia branch', 'ASSET ÷ branches', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.sod?.branches ? usdThousands(fin.asset / c.sod.branches) : null;
    }),
    rule('multi-county', 'Multi-county footprint', 'counties served > 3', SOD, (c) =>
      c.sod ? (c.sod.counties > 3 ? 'yes' : 'no — concentrated footprint') : null),
    rule('holding-present', 'Holding company on file', 'NAMEHCR non-empty', 'FDIC institutions API', (c) =>
      c.inst.holdingCompany ? 'yes' : 'no'),
    rule('concentration', 'Footprint concentration', 'primary county share of deposits', SOD, (c) => {
      if (!c.sod) return null;
      const ratio = safeRatio(c.sod.primaryDepositsUsd, c.sod.depositsUsd);
      return { value: pct(ratio), tone: ratio > 75 ? 'watch' : 'info' };
    }),
    rule('rank-percentile', 'Asset rank percentile', '(1 − rank ÷ charter count) × 100', FDIC, (c) =>
      c.ranks.assets && c.statewide.institutions
        ? `${((1 - c.ranks.assets / c.statewide.institutions) * 100).toFixed(1)}th percentile`
        : null),
    rule('employees', 'Employees', 'NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin ? count(fin.numemp) : null;
    }),
  ],
};

export const INSTITUTION_FAMILIES_A2: Family<InstitutionContext>[] = [
  insider,
  disclosure,
  structure,
];
