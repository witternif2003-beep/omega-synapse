/**
 * INDIVIDUAL INDICATOR FAMILIES, SECOND SET, FIRST MODULE
 *
 * Counterparty bank risk, reporting history, ownership structure and instruments. The bank
 * linkage, external-record and composite families live in the companion module.
 */

import { safeRatio, seriesAt } from './osintFinancials.ts';
import {
  count,
  dayGap,
  daysSince,
  median,
  pct,
  sum,
  tradeValue,
  usd,
  usdThousands,
  type Family,
  type PersonContext,
  type RuleResult,
} from './osintIndicatorTypes.ts';
import { INDIVIDUAL_FAMILIES_B2 } from './osintIndividualIndicatorsB2.ts';

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: PersonContext) => RuleResult,
) => ({ key, label, basis, source, run });

const SEC = 'SEC EDGAR Form 4';
const FDIC = 'FDIC call report';

const lines = (c: PersonContext) => c.person.transactions;
const sales = (c: PersonContext) => lines(c).filter((line) => line.code === 'S');
const purchases = (c: PersonContext) => lines(c).filter((line) => line.code === 'P');
const values = (c: PersonContext) => lines(c).map(tradeValue).filter((value) => Number.isFinite(value) && value > 0);
const saleValue = (c: PersonContext) =>
  sum(sales(c).map((line) => tradeValue(line)).filter((value) => Number.isFinite(value)));

const bankRisk: Family<PersonContext> = {
  id: 'bank-risk',
  label: 'Counterparty bank risk',
  blurb: 'The condition and direction of the bank this person’s issuer operates, quarter by quarter.',
  rules: [
    rule('assets', 'Bank assets', 'ASSET', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.asset) : null)),
    rule('deposits', 'Bank deposits', 'DEP', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.dep) : null)),
    rule('equity', 'Bank equity', 'EQ', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.eq) : null)),
    rule('equity-ratio', 'Bank equity ratio', 'EQ ÷ ASSET', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.eq, c.fin.latest.asset)) : null),
    rule('equity-vs-peer', 'Bank equity ratio versus peer median', 'ratio − peer median', FDIC, (c) =>
      c.fin && c.peer ? `${(safeRatio(c.fin.latest.eq, c.fin.latest.asset) - c.peer.equityRatio).toFixed(2)} pts` : null),
    rule('roa', 'Bank return on assets', 'ROA', FDIC, (c) => (c.fin ? `${c.fin.latest.roa.toFixed(2)}%` : null)),
    rule('roa-trend', 'Bank ROA change over four quarters', 'ROA latest − four quarters back', FDIC, (c) =>
      c.fin && c.fin.roa.length > 4
        ? `${(seriesAt(c.fin.roa, 0) - seriesAt(c.fin.roa, 4)).toFixed(2)} pts`
        : null),
    rule('roa-volatility', 'Bank ROA volatility', 'standard deviation of quarterly ROA', FDIC, (c) => {
      if (!c.fin || c.fin.roa.length < 4) return null;
      const mean = sum(c.fin.roa) / c.fin.roa.length;
      const variance = sum(c.fin.roa.map((value) => (value - mean) ** 2)) / (c.fin.roa.length - 1);
      return `${Math.sqrt(variance).toFixed(2)} pts`;
    }),
    rule('noncurrent', 'Bank noncurrent ratio', 'NCLNLSR', FDIC, (c) =>
      c.fin ? pct(c.fin.latest.nclnr, 3) : null),
    rule('noncurrent-trend', 'Bank noncurrent change over four quarters', 'NCLNLSR latest − four back', FDIC, (c) =>
      c.fin && c.fin.nclnr.length > 4
        ? `${(seriesAt(c.fin.nclnr, 0) - seriesAt(c.fin.nclnr, 4)).toFixed(3)} pts`
        : null),
    rule('noncurrent-vs-peer', 'Bank noncurrent versus peer median', 'NCLNLSR − peer median', FDIC, (c) =>
      c.fin && c.peer ? `${(c.fin.latest.nclnr - c.peer.nclnr).toFixed(3)} pts` : null),
    rule('charge-offs', 'Bank net charge-off rate', 'NTLNLSR', FDIC, (c) =>
      c.fin ? pct(c.fin.latest.ntlnr, 3) : null),
    rule('past-due', 'Bank past-due assets', 'P3ASSET + P9ASSET', FDIC, (c) =>
      c.fin ? usdThousands(c.fin.latest.p3 + c.fin.latest.p9) : null),
    rule('provision', 'Bank provision', 'ELNATR', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.elnatr) : null)),
    rule('brokered', 'Bank brokered deposits ratio', 'BRO ÷ DEP', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.bro, c.fin.latest.dep)) : null),
    rule('loan-deposit', 'Bank loans to deposits', 'LNLSNET ÷ DEP', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.lnlsnet, c.fin.latest.dep)) : null),
    rule('securities', 'Bank securities share', 'SCAFR', FDIC, (c) =>
      c.fin ? pct(c.fin.latest.scaffr) : null),
    rule('deposit-growth', 'Bank deposit growth over four quarters', 'DEP change over four quarters', FDIC, (c) =>
      c.fin && c.fin.dep.length > 4
        ? pct(((seriesAt(c.fin.dep, 0) - seriesAt(c.fin.dep, 4)) / Math.abs(seriesAt(c.fin.dep, 4))) * 100)
        : null),
    rule('asset-growth', 'Bank asset growth over four quarters', 'ASSET change over four quarters', FDIC, (c) =>
      c.fin && c.fin.asset.length > 4
        ? pct(((seriesAt(c.fin.asset, 0) - seriesAt(c.fin.asset, 4)) / Math.abs(seriesAt(c.fin.asset, 4))) * 100)
        : null),
    rule('call-quarter', 'Latest call-report quarter', 'REPDTE', FDIC, (c) =>
      c.fin ? c.fin.quarters[c.fin.quarters.length - 1] : null),
  ],
};

const history: Family<PersonContext> = {
  id: 'history',
  label: 'Reporting history & cadence',
  blurb: 'How long and how often this person appears in the issuer’s Form 4 record.',
  rules: [
    rule('filings', 'Filings in the window', 'count of filings', SEC, (c) => count(c.person.filings.length)),
    rule('lines', 'Reported lines', 'count of lines', SEC, (c) => count(lines(c).length)),
    rule('first', 'First transaction date', 'min transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[0] ?? null;
    }),
    rule('last', 'Last transaction date', 'max transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[dates.length - 1] ?? null;
    }),
    rule('span', 'Trading span', 'last − first transactionDate', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      return dates.length > 1 ? `${dayGap(dates[0], dates[dates.length - 1])} days` : null;
    }),
    rule('per-quarter', 'Lines per quarter of activity', 'lines ÷ quarters spanned', SEC, (c) => {
      const dates = lines(c).map((line) => line.traded).filter(Boolean).sort();
      if (dates.length < 2) return null;
      const quarters = Math.max(1, dayGap(dates[0], dates[dates.length - 1]) / 91.25);
      return (lines(c).length / quarters).toFixed(2);
    }),
    rule('months', 'Distinct filing months', 'distinct filingDate month', SEC, (c) =>
      count(new Set(c.person.filings.map((filing) => filing.filed.slice(0, 7)).filter(Boolean)).size)),
    rule('dates', 'Distinct filing dates', 'distinct filingDate', SEC, (c) =>
      count(new Set(c.person.filings.map((filing) => filing.filed).filter(Boolean)).size)),
    rule('busiest-month', 'Busiest filing month', 'month with the most filings', SEC, (c) => {
      const tally = new Map<string, number>();
      for (const filing of c.person.filings) {
        const month = filing.filed.slice(0, 7);
        if (month) tally.set(month, (tally.get(month) ?? 0) + 1);
      }
      if (!tally.size) return null;
      const [month, total] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      return `${month} (${total})`;
    }),
    rule('recent', 'Filings in the last ninety days', 'filingDate within 90 days', SEC, (c) =>
      count(c.person.filings.filter((filing) => daysSince(filing.filed) <= 90).length)),
    rule('age', 'Days since the last filing', 'now − max filingDate', SEC, (c) => {
      const dates = c.person.filings.map((filing) => filing.filed).filter(Boolean).sort();
      return dates.length ? `${daysSince(dates[dates.length - 1])} days` : null;
    }),
    rule('gap-max', 'Longest gap between filings', 'max consecutive filingDate gap', SEC, (c) => {
      const dates = [...new Set(c.person.filings.map((filing) => filing.filed).filter(Boolean))].sort();
      if (dates.length < 2) return null;
      let gap = 0;
      for (let i = 1; i < dates.length; i += 1) gap = Math.max(gap, dayGap(dates[i - 1], dates[i]));
      return `${gap} days`;
    }),
    rule('codes-used', 'Distinct codes used', 'distinct transactionCode', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.code).filter(Boolean)).size)),
    rule('securities', 'Distinct securities reported', 'distinct securityTitle', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.security).filter(Boolean)).size)),
    rule('issuer-filings', 'Issuer filings in the window', 'count of filings for the same CIK', SEC, (c) =>
      count(c.issuerFilings.length)),
    rule('issuer-span', 'Issuer trading span', 'min → max transactionDate across the issuer', SEC, (c) => {
      const dates = c.issuerTransactions.map((line) => line.traded).filter(Boolean).sort();
      return dates.length > 1 ? `${dayGap(dates[0], dates[dates.length - 1])} days` : null;
    }),
    rule('share-of-filings', 'Share of the issuer’s filings', 'person filings ÷ issuer filings', SEC, (c) =>
      c.issuerFilings.length ? pct(safeRatio(c.person.filings.length, c.issuerFilings.length)) : null),
    rule('continuous', 'Quarters with a filing among the last four', 'distinct filing months mapped to quarters', SEC, (c) => {
      const months = new Set(c.person.filings.map((filing) => filing.filed.slice(0, 7)).filter(Boolean));
      const quarters = new Set<string>();
      for (const month of months) {
        const year = month.slice(0, 4);
        const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1;
        quarters.add(`${year}-Q${quarter}`);
      }
      return `${quarters.size} quarter(s) with a filing`;
    }),
    rule('title-history', 'Titles used across filings', 'distinct officerTitle', SEC, (c) =>
      [...new Set(c.person.filings.map((filing) => filing.title).filter(Boolean))].join('; ') || 'no title reported'),
    rule('role-history', 'Relationship flags across filings', 'distinct roleBits', SEC, (c) =>
      [...new Set(c.person.filings.map((filing) => filing.roleBits))].join(', ') || null),
  ],
};

const ownership: Family<PersonContext> = {
  id: 'ownership',
  label: 'Ownership structure',
  blurb: 'How the reported position is held, transferred and changed across the window.',
  rules: [
    rule('latest-holdings', 'Shares held after the latest line', 'sharesOwnedFollowingTransaction', SEC, (c) => {
      const newest = [...lines(c)].sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed))[0];
      return newest && newest.after >= 0 ? count(newest.after) : null;
    }),
    rule('holdings-value', 'Value of the latest holding', 'shares after × reported price', SEC, (c) => {
      const newest = [...lines(c)].sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed))[0];
      return newest && newest.after >= 0 && newest.price > 0 ? usd(newest.after * newest.price) : null;
    }),
    rule('direct-lines', 'Direct-ownership lines', 'directOrIndirectOwnership = D', SEC, (c) =>
      count(lines(c).filter((line) => line.ownership === 'D').length)),
    rule('indirect-lines', 'Indirect-ownership lines', 'directOrIndirectOwnership = I', SEC, (c) =>
      count(lines(c).filter((line) => line.ownership === 'I').length)),
    rule('indirect-share', 'Indirect share of lines', 'indirect ÷ lines', SEC, (c) =>
      lines(c).length ? pct(safeRatio(lines(c).filter((line) => line.ownership === 'I').length, lines(c).length)) : null),
    rule('natures', 'Nature-of-ownership text', 'natureOfOwnership values', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.nature).filter(Boolean))].join('; ') || 'not reported'),
    rule('trust', 'Trust or family holding named', 'natureOfOwnership mentions trust, spouse, foundation or family', SEC, (c) =>
      lines(c).some((line) => /trust|spouse|foundation|family|estate/i.test(line.nature)) ? 'yes' : 'no'),
    rule('gifts', 'Gift lines', 'transactionCode G', SEC, (c) => count(lines(c).filter((line) => line.code === 'G').length)),
    rule('gift-shares', 'Shares given', 'sum shares on code G', SEC, (c) =>
      count(sum(lines(c).filter((line) => line.code === 'G').map((line) => Math.max(0, line.shares))))),
    rule('awards', 'Award lines', 'transactionCode A', SEC, (c) => count(lines(c).filter((line) => line.code === 'A').length)),
    rule('withholding', 'Withholding lines', 'transactionCode F', SEC, (c) => count(lines(c).filter((line) => line.code === 'F').length)),
    rule('exercises', 'Option exercise lines', 'transactionCode M', SEC, (c) => count(lines(c).filter((line) => line.code === 'M').length)),
    rule('conversions', 'Conversion lines', 'transactionCode C', SEC, (c) => count(lines(c).filter((line) => line.code === 'C').length)),
    rule('dispositions', 'Disposition lines', 'transactionCode D', SEC, (c) => count(lines(c).filter((line) => line.code === 'D').length)),
    rule('zero-after', 'Lines leaving no shares held', 'sharesOwnedFollowingTransaction = 0', SEC, (c) =>
      count(lines(c).filter((line) => line.after === 0).length)),
    rule('position-change', 'Largest position change', 'max |shares held after − prior holdings|', SEC, (c) => {
      if (!lines(c).length) return null;
      const ordered = [...lines(c)].sort((a, b) => (a.traded || a.filed).localeCompare(b.traded || b.filed));
      let biggest = 0;
      for (let i = 1; i < ordered.length; i += 1) {
        const before = ordered[i - 1].after;
        const after = ordered[i].after;
        if (before >= 0 && after >= 0) biggest = Math.max(biggest, Math.abs(after - before));
      }
      return biggest ? count(biggest) : null;
    }),
    rule('max-holdings', 'Largest reported holding', 'max sharesOwnedFollowingTransaction', SEC, (c) => {
      const holdings = lines(c).map((line) => line.after).filter((value) => value >= 0);
      return holdings.length ? count(Math.max(...holdings)) : null;
    }),
    rule('security-types', 'Securities reported', 'distinct securityTitle', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.security).filter(Boolean))].join('; ') || null),
    rule('turnover-max', 'Largest turnover', 'max shares ÷ (shares + holdings after)', SEC, (c) => {
      const ratios = lines(c)
        .filter((line) => line.shares > 0 && line.after >= 0)
        .map((line) => (line.shares / (line.shares + line.after)) * 100);
      return ratios.length ? pct(Math.max(...ratios)) : null;
    }),
    rule('turnover-mean', 'Mean turnover', 'mean shares ÷ (shares + holdings after)', SEC, (c) => {
      const ratios = lines(c)
        .filter((line) => line.shares > 0 && line.after >= 0)
        .map((line) => (line.shares / (line.shares + line.after)) * 100);
      return ratios.length ? pct(sum(ratios) / ratios.length) : null;
    }),
  ],
};

const instruments: Family<PersonContext> = {
  id: 'instruments',
  label: 'Instruments & transaction codes',
  blurb: 'What was traded — common stock, derivatives, awards — and which SEC codes the filings use.',
  rules: [
    rule('common-lines', 'Common-stock lines', 'securityTitle contains common', SEC, (c) =>
      count(lines(c).filter((line) => /common/i.test(line.security)).length)),
    rule('derivative-lines', 'Derivative lines', 'derivativeTable', SEC, (c) =>
      count(lines(c).filter((line) => line.derivative).length)),
    rule('derivative-share', 'Derivative share of lines', 'derivative ÷ lines', SEC, (c) =>
      lines(c).length ? pct(safeRatio(lines(c).filter((line) => line.derivative).length, lines(c).length)) : null),
    rule('award-instruments', 'Award-style lines', 'code A or M', SEC, (c) =>
      count(lines(c).filter((line) => line.code === 'A' || line.code === 'M').length)),
    rule('open-market', 'Open-market lines', 'code P or S', SEC, (c) =>
      count(lines(c).filter((line) => line.code === 'P' || line.code === 'S').length)),
    rule('priced-lines', 'Lines with a reported price', 'transactionPricePerShare > 0', SEC, (c) =>
      count(lines(c).filter((line) => line.price > 0).length)),
    rule('unpriced-lines', 'Lines without a price', 'transactionPricePerShare absent', SEC, (c) =>
      count(lines(c).filter((line) => line.price <= 0).length)),
    rule('price-range', 'Reported price range', 'min → max reported price', SEC, (c) => {
      const prices = lines(c).map((line) => line.price).filter((price) => price > 0);
      return prices.length ? `$${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)}` : null;
    }),
    rule('price-median', 'Median reported price', 'median transactionPricePerShare', SEC, (c) => {
      const prices = lines(c).map((line) => line.price).filter((price) => price > 0);
      return prices.length ? `$${median(prices).toFixed(2)}` : null;
    }),
    rule('share-range', 'Reported share range', 'min → max transactionShares', SEC, (c) => {
      const shares = lines(c).map((line) => line.shares).filter((value) => value > 0);
      return shares.length ? `${count(Math.min(...shares))} – ${count(Math.max(...shares))}` : null;
    }),
    rule('shares-median', 'Median shares per line', 'median transactionShares', SEC, (c) => {
      const shares = lines(c).map((line) => line.shares).filter((value) => value > 0);
      return shares.length ? count(median(shares)) : null;
    }),
    rule('value-range', 'Reported value range', 'min → max shares × price', SEC, (c) => {
      const all = values(c);
      return all.length ? `${usd(Math.min(...all))} – ${usd(Math.max(...all))}` : null;
    }),
    rule('value-total', 'Total reported value', 'sum of shares × price', SEC, (c) =>
      values(c).length ? usd(sum(values(c))) : null),
    rule('biggest-instrument', 'Instrument behind the largest value', 'securityTitle on the largest line', SEC, (c) => {
      const priced = lines(c).filter((line) => tradeValue(line) > 0);
      if (!priced.length) return null;
      const biggest = priced.reduce((max, line) => (tradeValue(line) > tradeValue(max) ? line : max), priced[0]);
      return biggest.security || null;
    }),
    rule('code-list', 'Codes used', 'distinct transactionCode', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.code).filter(Boolean))].join(', ') || null),
    rule('plan-lines', 'Lines flagged as 10b5-1', 'aff10b5One', SEC, (c) =>
      count(lines(c).filter((line) => line.tenb5one).length)),
    rule('ownership-nature', 'Ownership nature flags', 'directOrIndirectOwnership values', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.ownership).filter(Boolean))].join(', ') || null),
    rule('security-count', 'Distinct securities', 'distinct securityTitle', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.security).filter(Boolean)).size)),
    rule('odd-lot-lines', 'Lines under 100 shares', 'transactionShares < 100', SEC, (c) =>
      count(lines(c).filter((line) => line.shares > 0 && line.shares < 100).length)),
    rule('large-lot-lines', 'Lines over 100,000 shares', 'transactionShares > 100,000', SEC, (c) =>
      count(lines(c).filter((line) => line.shares > 100_000).length)),
  ],
};

export const INDIVIDUAL_FAMILIES_B: Family<PersonContext>[] = [
  bankRisk,
  history,
  ownership,
  instruments,
  ...INDIVIDUAL_FAMILIES_B2,
];
