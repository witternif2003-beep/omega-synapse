/**
 * INDIVIDUAL INDICATOR FAMILIES (14 × 20 = 280)
 *
 * Each family answers one question about one reporting person using only what the SEC
 * prints in their Form 4 documents, joined to the FDIC figures for the bank their issuer
 * operates. Nothing about an employee, contractor or non-employee is inferred beyond the
 * role checkboxes and officer title the filing itself carries.
 *
 * The families live in four modules; this index module holds the first four and re-exports
 * the rest.
 */

import { safeRatio } from './osintFinancials.ts';
import {
  count,
  dayGap,
  daysSince,
  median,
  pct,
  sum,
  tradeValue,
  usd,
  type Family,
  type PersonContext,
  type RuleResult,
} from './osintIndicatorTypes.ts';
import { transferPatterns } from './osintPeople.ts';
import { INDIVIDUAL_FAMILIES_A2 } from './osintIndividualIndicators2.ts';
import { INDIVIDUAL_FAMILIES_B } from './osintIndividualIndicatorsB.ts';

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: PersonContext) => RuleResult,
) => ({ key, label, basis, source, run });

const SEC = 'SEC EDGAR Form 4';
const FDIC = 'FDIC call report';
const SOD = 'FDIC Summary of Deposits';

const lines = (ctx: PersonContext) => ctx.person.transactions;
const sales = (ctx: PersonContext) => lines(ctx).filter((line) => line.code === 'S');
const purchases = (ctx: PersonContext) => lines(ctx).filter((line) => line.code === 'P');
const values = (ctx: PersonContext) =>
  lines(ctx).map(tradeValue).filter((value) => Number.isFinite(value) && value > 0);
const saleValue = (ctx: PersonContext) =>
  sum(sales(ctx).map((line) => tradeValue(line)).filter((value) => Number.isFinite(value)));
const purchaseValue = (ctx: PersonContext) =>
  sum(purchases(ctx).map((line) => tradeValue(line)).filter((value) => Number.isFinite(value)));
const latestLine = (ctx: PersonContext) =>
  [...lines(ctx)].sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed))[0] ?? null;

const identity: Family<PersonContext> = {
  id: 'identity',
  label: 'Identity & relationship',
  blurb: 'Exactly how the filing describes this person’s relationship to the issuer.',
  rules: [
    rule('name', 'Reporting person as filed', 'rptOwnerName', SEC, (c) => c.person.name || null),
    rule('title', 'Officer title as filed', 'officerTitle', SEC, (c) =>
      c.person.title || 'no officer title filed'),
    rule('role', 'Relationship to the issuer', 'reportingOwnerRelationship flags', SEC, (c) => c.person.role),
    rule('class', 'Employment class', 'isOfficer / isDirector / isTenPercentOwner', SEC, (c) => c.person.roleClass),
    rule('employee', 'Employee of the issuer', 'isOfficer = 1', SEC, (c) =>
      c.person.roleBits & 1 ? 'yes — officer checkbox set' : 'no — officer checkbox not set'),
    rule('director', 'Director of the issuer', 'isDirector = 1', SEC, (c) =>
      c.person.roleBits & 2 ? 'yes' : 'no'),
    rule('owner-10', 'Ten-percent owner', 'isTenPercentOwner = 1', SEC, (c) =>
      c.person.roleBits & 4 ? 'yes' : 'no'),
    rule('other-role', 'Other relationship text', 'isOther and otherText', SEC, (c) =>
      c.person.roleBits & 8 ? c.person.title || 'other relationship flagged' : 'not flagged'),
    rule('contractor', 'Contractor status', 'no Form 4 field reports contractor status', SEC, () =>
      'not published — the SEC does not report contractor status'),
    rule('issuer', 'Issuer', 'issuerName', SEC, (c) => c.person.issuerName),
    rule('ticker', 'Ticker', 'issuer trading symbol', SEC, (c) => c.person.ticker || null),
    rule('cik', 'Issuer CIK', 'Central Index Key', SEC, (c) => c.person.cik),
    rule('bank', 'Operating bank', 'filer register bank field', 'Filer register', (c) => c.person.bank || null),
    rule('filings', 'Form 4 filings by this person', 'count of filings', SEC, (c) =>
      c.person.filings.length ? count(c.person.filings.length) : null),
    rule('lines', 'Reported transaction lines', 'count of transaction blocks', SEC, (c) =>
      count(lines(c).length)),
    rule('codes', 'Distinct transaction codes', 'distinct transactionCode', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.code).filter(Boolean)).size)),
    rule('first-trade', 'First transaction in the window', 'min transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[0] ?? null;
    }),
    rule('last-trade', 'Last transaction in the window', 'max transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[dates.length - 1] ?? null;
    }),
    rule('securities', 'Securities reported', 'distinct securityTitle', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.security).filter(Boolean))].join('; ') || null),
    rule('tenure', 'Days between first and last reported trade', 'last − first transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      if (dates.length < 2) return null;
      return `${dayGap(dates[0], dates[dates.length - 1])} days`;
    }),
  ],
};

const magnitude: Family<PersonContext> = {
  id: 'magnitude',
  label: 'Transaction magnitude',
  blurb: 'How large the reported activity is, in shares, dollars and share of the position held.',
  rules: [
    rule('latest-value', 'Value of the latest transaction', 'shares × price on the newest line', SEC, (c) => {
      const line = latestLine(c);
      const value = line ? tradeValue(line) : NaN;
      return Number.isFinite(value) ? usd(value) : null;
    }),
    rule('latest-shares', 'Shares in the latest transaction', 'transactionShares', SEC, (c) => {
      const line = latestLine(c);
      return line && line.shares > 0 ? count(line.shares) : null;
    }),
    rule('latest-price', 'Price in the latest transaction', 'transactionPricePerShare', SEC, (c) => {
      const line = latestLine(c);
      return line && line.price > 0 ? `$${line.price.toFixed(2)}` : null;
    }),
    rule('latest-after', 'Shares held after the latest transaction', 'sharesOwnedFollowingTransaction', SEC, (c) => {
      const line = latestLine(c);
      return line && line.after >= 0 ? count(line.after) : null;
    }),
    rule('latest-holdings-value', 'Reported holding value', 'shares after × reported price', SEC, (c) => {
      const line = latestLine(c);
      if (!line || line.price <= 0 || line.after < 0) return null;
      return usd(line.after * line.price);
    }),
    rule('latest-turnover', 'Turnover in the latest transaction', 'shares ÷ (shares + shares after)', SEC, (c) => {
      const line = latestLine(c);
      if (!line || line.shares <= 0 || line.after < 0) return null;
      return pct((line.shares / (line.shares + line.after)) * 100);
    }),
    rule('sale-total', 'Reported sale value, window', 'sum shares × price on code S', SEC, (c) =>
      sales(c).length ? usd(saleValue(c)) : null),
    rule('purchase-total', 'Reported purchase value, window', 'sum shares × price on code P', SEC, (c) =>
      purchases(c).length ? usd(purchaseValue(c)) : null),
    rule('net-value', 'Net reported value', 'sale value − purchase value', SEC, (c) => {
      if (!sales(c).length && !purchases(c).length) return null;
      const net = saleValue(c) - purchaseValue(c);
      return { value: `${net >= 0 ? 'net disposed' : 'net acquired'} ${usd(Math.abs(net))}`, tone: net > 0 ? 'watch' : 'info' };
    }),
    rule('largest-value', 'Largest single reported value', 'max shares × price', SEC, (c) => {
      const all = values(c);
      return all.length ? usd(Math.max(...all)) : null;
    }),
    rule('mean-value', 'Mean reported value per line', 'mean shares × price', SEC, (c) => {
      const all = values(c);
      return all.length ? usd(sum(all) / all.length) : null;
    }),
    rule('median-value', 'Median reported value per line', 'median shares × price', SEC, (c) => {
      const all = values(c);
      return all.length ? usd(median(all)) : null;
    }),
    rule('shares-sold', 'Shares sold', 'sum transactionShares on code S', SEC, (c) =>
      sales(c).length ? count(sum(sales(c).map((line) => Math.max(0, line.shares)))) : null),
    rule('shares-bought', 'Shares bought', 'sum transactionShares on code P', SEC, (c) =>
      purchases(c).length ? count(sum(purchases(c).map((line) => Math.max(0, line.shares)))) : null),
    rule('unpriced-lines', 'Lines without a reported price', 'count where transactionPricePerShare absent', SEC, (c) =>
      count(lines(c).filter((line) => line.price <= 0).length)),
    rule('max-turnover', 'Largest turnover across the window', 'max shares ÷ (shares + shares after)', SEC, (c) => {
      const ratios = lines(c)
        .filter((line) => line.shares > 0 && line.after >= 0)
        .map((line) => (line.shares / (line.shares + line.after)) * 100);
      return ratios.length ? pct(Math.max(...ratios)) : null;
    }),
    rule('value-vs-bank-deposits', 'Reported value against the bank’s Georgia deposits', 'value ÷ SOD deposits', SOD, (c) => {
      const all = values(c);
      if (!all.length || !c.inst) return null;
      return pct(safeRatio(Math.max(...all), c.inst.assetsThousands * 1000), 4);
    }),
    rule('value-vs-bank-assets', 'Reported value against bank assets', 'value ÷ FDIC ASSET', FDIC, (c) => {
      const all = values(c);
      if (!all.length || !c.fin) return null;
      return pct(safeRatio(Math.max(...all), c.fin.latest.asset * 1000), 4);
    }),
    rule('holdings-share', 'Holding value against bank assets', 'holdings value ÷ FDIC ASSET', FDIC, (c) => {
      const line = latestLine(c);
      if (!line || line.price <= 0 || line.after < 0 || !c.fin) return null;
      return pct(safeRatio(line.after * line.price, c.fin.latest.asset * 1000), 4);
    }),
    rule('trade-lines', 'Reported transaction count', 'count of lines', SEC, (c) => count(lines(c).length)),
  ],
};

const timing: Family<PersonContext> = {
  id: 'timing',
  label: 'Timing & reporting compliance',
  blurb: 'The gap between the trade date and the filing date, which is the part of a Form 4 the SEC polices.',
  rules: [
    rule('latest-lag', 'Latest transaction-to-filing lag', 'filingDate − transactionDate', SEC, (c) => {
      const line = latestLine(c);
      if (!line) return null;
      const gap = dayGap(line.traded, line.filed);
      return Number.isFinite(gap) ? `${gap} days` : null;
    }),
    rule('mean-lag', 'Mean lag across the window', 'mean filingDate − transactionDate', SEC, (c) => {
      const gaps = lines(c).map((line) => dayGap(line.traded, line.filed)).filter((gap) => Number.isFinite(gap));
      return gaps.length ? `${(sum(gaps) / gaps.length).toFixed(1)} days` : null;
    }),
    rule('max-lag', 'Longest lag in the window', 'max filingDate − transactionDate', SEC, (c) => {
      const gaps = lines(c).map((line) => dayGap(line.traded, line.filed)).filter((gap) => Number.isFinite(gap));
      return gaps.length ? `${Math.round(Math.max(...gaps))} days` : null;
    }),
    rule('late-count', 'Lines filed after the two-business-day deadline', 'business days between trade and filing > 2', SEC, (c) => {
      const late = lines(c).filter((line) => {
        const start = Date.parse(`${line.traded}T00:00:00Z`);
        const end = Date.parse(`${line.filed}T00:00:00Z`);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
        let days = 0;
        for (let cursor = start + 86_400_000; cursor <= end; cursor += 86_400_000) {
          const weekday = new Date(cursor).getUTCDay();
          if (weekday !== 0 && weekday !== 6) days += 1;
        }
        return days > 2;
      });
      return late.length ? count(late.length) : 'none — every line inside two business days';
    }),
    rule('latest-filing', 'Most recent filing date', 'max filingDate', SEC, (c) => {
      const dates = c.person.filings.map((filing) => filing.filed).filter(Boolean).sort();
      return dates[dates.length - 1] ?? null;
    }),
    rule('days-since-filing', 'Days since the most recent filing', 'now − filingDate', SEC, (c) => {
      const dates = c.person.filings.map((filing) => filing.filed).filter(Boolean).sort();
      return dates.length ? `${daysSince(dates[dates.length - 1])} days` : null;
    }),
    rule('filings-90', 'Filings in the last ninety days', 'filingDate within 90 days', SEC, (c) =>
      count(c.person.filings.filter((filing) => daysSince(filing.filed) <= 90).length)),
    rule('trades-90', 'Transactions in the last ninety days', 'transactionDate within 90 days', SEC, (c) =>
      count(lines(c).filter((line) => daysSince(line.traded) <= 90).length)),
    rule('distinct-trade-days', 'Distinct transaction dates', 'distinct transactionDate', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.traded).filter(Boolean)).size)),
    rule('trade-span', 'Span of trading activity', 'last − first transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates.length > 1 ? `${dayGap(dates[0], dates[dates.length - 1])} days` : null;
    }),
    rule('trades-per-quarter', 'Transactions per quarter of activity', 'lines ÷ quarters spanned', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      if (dates.length < 2) return null;
      const span = dayGap(dates[0], dates[dates.length - 1]);
      const quarters = Math.max(1, span / 91.25);
      return (lines(c).length / quarters).toFixed(2);
    }),
    rule('weekend-lines', 'Weekend-dated transactions', 'transactionDate falls on Saturday or Sunday', SEC, (c) =>
      count(
        lines(c).filter((line) => {
          const time = Date.parse(`${line.traded}T00:00:00Z`);
          if (!Number.isFinite(time)) return false;
          const weekday = new Date(time).getUTCDay();
          return weekday === 0 || weekday === 6;
        }).length,
      )),
    rule('latest-vs-filing', 'Trade reported in the same month', 'transaction month = filing month', SEC, (c) => {
      const line = latestLine(c);
      if (!line) return null;
      return line.traded.slice(0, 7) === line.filed.slice(0, 7) ? 'yes' : 'no — filed in a later month';
    }),
    rule('filing-month', 'Filing month of the latest report', 'filingDate month', SEC, (c) => {
      const line = latestLine(c);
      return line ? line.filed.slice(0, 7) : null;
    }),
    rule('lag-trend', 'Lag trend, newest versus oldest line', 'latest lag − oldest lag', SEC, (c) => {
      const ordered = [...lines(c)].sort((a, b) => a.traded.localeCompare(b.traded));
      if (ordered.length < 2) return null;
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const gapFirst = dayGap(first.traded, first.filed);
      const gapLast = dayGap(last.traded, last.filed);
      if (!Number.isFinite(gapFirst) || !Number.isFinite(gapLast)) return null;
      return `${(gapLast - gapFirst).toFixed(0)} days`;
    }),
    rule('off-cycle', 'Off-cycle filing (after the 15th of the month)', 'filingDate day of month', SEC, (c) => {
      const dates = c.person.filings.map((filing) => filing.filed).filter(Boolean);
      if (!dates.length) return null;
      return count(dates.filter((date) => Number(date.slice(8, 10)) > 15).length);
    }),
    rule('peak-month', 'Busiest filing month', 'month with the most filings', SEC, (c) => {
      const months = c.person.filings.map((filing) => filing.filed.slice(0, 7)).filter(Boolean);
      if (!months.length) return null;
      const tally = new Map<string, number>();
      for (const month of months) tally.set(month, (tally.get(month) ?? 0) + 1);
      return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }),
    rule('accession-days', 'Distinct filing dates', 'distinct filingDate', SEC, (c) =>
      count(new Set(c.person.filings.map((filing) => filing.filed).filter(Boolean)).size)),
    rule('same-day-lines', 'Lines on a single transaction date', 'max lines sharing one transactionDate', SEC, (c) => {
      const tally = new Map<string, number>();
      for (const line of lines(c)) tally.set(line.traded, (tally.get(line.traded) ?? 0) + 1);
      return tally.size ? count(Math.max(...tally.values())) : null;
    }),
    rule('staleness', 'Age of the newest source document', 'now − latest filingDate', SEC, (c) => {
      const dates = c.person.filings.map((filing) => filing.filed).filter(Boolean).sort();
      return dates.length ? `${daysSince(dates[dates.length - 1])} days` : null;
    }),
  ],
};

const patterns: Family<PersonContext> = {
  id: 'patterns',
  label: 'Transfer pattern screens',
  blurb: 'Threshold screens over this person’s reported lines. Each row prints the threshold applied.',
  rules: [
    rule('late-filing', 'Late-reporting screen', 'trade → filing > 2 business days', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'late-filing');
      return hit ? { value: hit.detail, tone: 'watch' as const } : 'none';
    }),
    rule('liquidation', 'Near-total disposition screen', '≥ 50% of reported position', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'near-total-liquidation');
      return hit ? { value: hit.detail, tone: 'watch' as const } : 'none';
    }),
    rule('exercise-sell', 'Exercise-and-sell screen', 'code M and code S on one date', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'exercise-and-sell');
      return hit ? { value: hit.detail, tone: 'watch' as const } : 'none';
    }),
    rule('gift', 'Gift-transfer screen', 'code G or gift nature', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'gift-transfer');
      return hit ? hit.detail : 'none';
    }),
    rule('indirect', 'Indirect-holding screen', 'ownership flag I or nature text', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'indirect-holding');
      return hit ? hit.detail : 'none';
    }),
    rule('no-plan', 'Rule 10b5-1 disclosure screen', 'aff10b5One absent on a sale', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'no-10b5-1-flag');
      return hit ? hit.detail : 'none';
    }),
    rule('size-outlier', 'Size-outlier screen', 'value > 3× median in the window', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'size-outlier');
      return hit ? hit.detail : 'none';
    }),
    rule('weekend', 'Weekend-dated trade screen', 'transactionDate on a Saturday or Sunday', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'weekend-trade');
      return hit ? hit.detail : 'none';
    }),
    rule('withholding', 'Vesting-withholding screen', 'two or more code F lines on one date', SEC, (c) => {
      const hit = transferPatterns(lines(c), c.person.name).find((pattern) => pattern.id === 'withholding-lot');
      return hit ? hit.detail : 'none';
    }),
    rule('round-trip', 'Rapid round-trip screen', 'purchase then sale within 30 days', SEC, (c) => {
      const hit = transferPatterns(lines(c)).find((pattern) => pattern.id === 'rapid-round-trip');
      return hit ? hit.detail : 'none';
    }),
    rule('sell-only', 'Sell-only screen', 'sale lines > 0 with no purchase line', SEC, (c) =>
      sales(c).length && !purchases(c).length ? `yes — ${sales(c).length} sale lines, no purchase reported` : 'no'),
    rule('buy-and-hold', 'Accumulation screen', 'purchase lines with no sale line', SEC, (c) =>
      purchases(c).length && !sales(c).length ? `yes — ${purchases(c).length} purchase lines, no sale reported` : 'no'),
    rule('one-day-wonder', 'Single-date activity screen', 'every line shares one transaction date', SEC, (c) => {
      const dates = new Set(lines(c).map((line) => line.traded).filter(Boolean));
      return dates.size === 1 && lines(c).length > 1 ? 'yes — every line on one date' : 'no';
    }),
    rule('post-exercise-sale', 'Derivative exercise screen', 'derivative line with code M', SEC, (c) =>
      lines(c).some((line) => line.derivative && line.code === 'M') ? 'yes — derivative exercise reported' : 'none'),
    rule('tax-disposal', 'Tax-withholding disposal screen', 'code F present', SEC, (c) =>
      lines(c).some((line) => line.code === 'F') ? 'yes — code F withholding reported' : 'none'),
    rule('zero-after', 'Position-closing screen', 'sharesOwnedFollowingTransaction = 0', SEC, (c) =>
      lines(c).some((line) => line.after === 0) ? 'yes — a line leaves zero shares held' : 'no'),
    rule('odd-lot', 'Odd-lot screen', 'a line under 100 shares', SEC, (c) =>
      lines(c).some((line) => line.shares > 0 && line.shares < 100) ? 'yes' : 'no'),
    rule('price-gap', 'Price-gap screen', 'reported price differs from median by > 20%', SEC, (c) => {
      const prices = lines(c).map((line) => line.price).filter((price) => price > 0);
      const middle = median(prices);
      if (!prices.length || !Number.isFinite(middle)) return null;
      const off = prices.filter((price) => Math.abs(price - middle) / middle > 0.2);
      return off.length ? `${off.length} line(s) outside ±20% of $${middle.toFixed(2)}` : 'within ±20% of the median';
    }),
    rule('pattern-count', 'Screens firing for this person', 'count of pattern screens with a hit', SEC, (c) =>
      count(transferPatterns(lines(c), c.person.name).length)),
    rule('sale-lines', 'Sale lines reported', 'count of code S lines', SEC, (c) => count(sales(c).length)),
  ],
};

export const INDIVIDUAL_FAMILIES: Family<PersonContext>[] = [
  identity,
  magnitude,
  timing,
  patterns,
  ...INDIVIDUAL_FAMILIES_A2,
  ...INDIVIDUAL_FAMILIES_B,
];
