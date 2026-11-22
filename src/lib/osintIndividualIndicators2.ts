/**
 * INDIVIDUAL INDICATOR FAMILIES, SECOND MODULE
 *
 * Counterparty bank condition, peer position among the issuer's insiders, and record
 * provenance: the last three families of the first set.
 */

import { safeRatio, seriesAt } from './osintFinancials.ts';
import {
  count,
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
import { transferPatterns } from './osintPeople.ts';

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: PersonContext) => RuleResult,
) => ({ key, label, basis, source, run });

const SEC = 'SEC EDGAR Form 4';
const FDIC = 'FDIC call report';
const FEED = 'OSINT feed';

const lines = (ctx: PersonContext) => ctx.person.transactions;
const sales = (ctx: PersonContext) => lines(ctx).filter((line) => line.code === 'S');
const purchases = (ctx: PersonContext) => lines(ctx).filter((line) => line.code === 'P');
const values = (ctx: PersonContext) =>
  lines(ctx).map(tradeValue).filter((value) => Number.isFinite(value) && value > 0);
const saleValue = (ctx: PersonContext) =>
  sum(sales(ctx).map((line) => tradeValue(line)).filter((value) => Number.isFinite(value)));
const latestLine = (ctx: PersonContext) =>
  [...lines(ctx)].sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed))[0] ?? null;
const issuerSaleValue = (ctx: PersonContext) =>
  sum(
    ctx.issuerTransactions
      .filter((line) => line.code === 'S')
      .map((line) => tradeValue(line))
      .filter((value) => Number.isFinite(value)),
  );
const peerSaleByOwner = (ctx: PersonContext): Map<string, number> => {
  const map = new Map<string, number>();
  for (const line of ctx.issuerTransactions.filter((entry) => entry.code === 'S')) {
    const value = tradeValue(line);
    if (!Number.isFinite(value)) continue;
    map.set(line.owner, (map.get(line.owner) ?? 0) + value);
  }
  return map;
};
const ctx_folder = (ctx: PersonContext) => ctx.issuerTransactions;

const bank: Family<PersonContext> = {
  id: 'bank',
  label: 'Counterparty bank condition',
  blurb: 'The condition of the bank this person’s issuer operates, from the FDIC and the live feed.',
  rules: [
    rule('bank-name', 'Operating bank', 'filer register bank name', 'Filer register', (c) => c.person.bank || null),
    rule('bank-assets', 'Bank total assets', 'FDIC ASSET', FDIC, (c) =>
      c.fin ? usdThousands(c.fin.latest.asset) : null),
    rule('bank-deposits', 'Bank deposits', 'FDIC DEP', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.dep) : null)),
    rule('bank-equity', 'Bank equity', 'FDIC EQ', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.eq) : null)),
    rule('bank-equity-ratio', 'Bank equity ratio', 'EQ ÷ ASSET', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.eq, c.fin.latest.asset)) : null),
    rule('bank-roa', 'Bank return on assets', 'ROA as filed', FDIC, (c) =>
      c.fin ? `${c.fin.latest.roa.toFixed(2)}%` : null),
    rule('bank-noncurrent', 'Bank noncurrent loans ratio', 'NCLNLSR as filed', FDIC, (c) =>
      c.fin ? pct(c.fin.latest.nclnr, 3) : null),
    rule('bank-chargeoffs', 'Bank net charge-off rate', 'NTLNLSR as filed', FDIC, (c) =>
      c.fin ? pct(c.fin.latest.ntlnr, 3) : null),
    rule('bank-brokered', 'Bank brokered deposits ratio', 'BRO ÷ DEP', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.bro, c.fin.latest.dep)) : null),
    rule('bank-loan-deposit', 'Bank loans to deposits', 'LNLSNET ÷ DEP', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.lnlsnet, c.fin.latest.dep)) : null),
    rule('bank-noncurrent-trend', 'Bank noncurrent trend over four quarters', 'NCLNLSR latest − four quarters back', FDIC, (c) =>
      c.fin && c.fin.nclnr.length > 4
        ? `${(seriesAt(c.fin.nclnr, 0) - seriesAt(c.fin.nclnr, 4)).toFixed(3)} pts`
        : null),
    rule('bank-quarter', 'Latest call-report quarter', 'REPDTE', FDIC, (c) =>
      c.fin ? c.fin.quarters[c.fin.quarters.length - 1] : null),
    rule('bank-vs-peer-roa', 'Bank ROA versus Georgia median', 'ROA − peer median', FDIC, (c) =>
      c.fin && c.peer ? `${(c.fin.latest.roa - c.peer.roa).toFixed(2)} pts` : null),
    rule('bank-vs-peer-noncurrent', 'Bank noncurrent ratio versus Georgia median', 'NCLNLSR − peer median', FDIC, (c) =>
      c.fin && c.peer ? `${(c.fin.latest.nclnr - c.peer.nclnr).toFixed(3)} pts` : null),
    rule('bank-cert', 'FDIC certificate of the operating bank', 'CERT', 'FDIC institutions API', (c) =>
      c.inst?.cert ?? null),
    rule('bank-fdic-assets', 'Bank assets on the FDIC institution record', 'ASSET from the institutions API', FDIC, (c) =>
      c.inst ? usdThousands(c.inst.assetsThousands) : null),
    rule('bank-items', 'Live records naming the bank', 'feed items attributing the institution', FEED, (c) =>
      count(c.items.length)),
    rule('bank-enforcement', 'Enforcement records naming the bank', 'kind = enforcement', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'enforcement').length)),
    rule('bank-sanctions', 'Sanctions records naming the bank', 'kind = sanctions', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'sanctions').length)),
    rule('bank-critical', 'Critical records naming the bank', 'severity = critical', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'critical').length)),
  ],
};

const peers: Family<PersonContext> = {
  id: 'peers',
  label: 'Peer position among issuer insiders',
  blurb: 'Where this person sits against the other insiders of the same bank company in the same window.',
  rules: [
    rule('issuer-insiders', 'Insiders at this issuer', 'distinct owners in the issuer window', SEC, (c) =>
      count(new Set(ctx_folder(c).map((line) => line.owner)).size)),
    rule('issuer-lines', 'Transaction lines at this issuer', 'count of lines', SEC, (c) =>
      count(ctx_folder(c).length)),
    rule('issuer-filings', 'Filings at this issuer', 'count of filings', SEC, (c) =>
      c.issuerFilings.length ? count(c.issuerFilings.length) : null),
    rule('share-of-lines', 'Share of the issuer’s lines', 'person lines ÷ issuer lines', SEC, (c) => {
      const total = ctx_folder(c).length;
      return total ? pct(safeRatio(lines(c).length, total)) : null;
    }),
    rule('share-of-sale-value', 'Share of the issuer’s reported sale value', 'person sale value ÷ issuer sale value', SEC, (c) => {
      const total = issuerSaleValue(c);
      return total > 0 ? pct(safeRatio(saleValue(c), total)) : null;
    }),
    rule('sale-rank', 'Rank among sellers by value', 'rank by owner sale value', SEC, (c) => {
      const tally = peerSaleByOwner(c);
      if (!tally.size) return null;
      const ordered = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const index = ordered.findIndex(([owner]) => owner === c.person.name);
      return index >= 0 ? `#${index + 1} of ${ordered.length}` : 'no sales by this person';
    }),
    rule('issuer-sale-value', 'Issuer total reported sale value', 'sum shares × price on code S', SEC, (c) =>
      issuerSaleValue(c) > 0 ? usd(issuerSaleValue(c)) : null),
    rule('issuer-buy-count', 'Issuer buyers', 'distinct owners on code P', SEC, (c) =>
      count(new Set(ctx_folder(c).filter((line) => line.code === 'P').map((line) => line.owner)).size)),
    rule('issuer-seller-count', 'Issuer sellers', 'distinct owners on code S', SEC, (c) =>
      count(new Set(ctx_folder(c).filter((line) => line.code === 'S').map((line) => line.owner)).size)),
    rule('issuer-net', 'Issuer net direction', 'issuer sale value − purchase value', SEC, (c) => {
      const bought = sum(
        ctx_folder(c)
          .filter((line) => line.code === 'P')
          .map((line) => tradeValue(line))
          .filter((value) => Number.isFinite(value)),
      );
      const sold = issuerSaleValue(c);
      if (!sold && !bought) return null;
      return `${sold >= bought ? 'net selling' : 'net buying'} ${usd(Math.abs(sold - bought))}`;
    }),
    rule('cluster-member', 'Member of a cluster-selling window', '≥ 3 insiders sold within 30 days', SEC, (c) => {
      const hit = transferPatterns(ctx_folder(c)).find((pattern) => pattern.id === 'cluster-selling');
      if (!hit) return 'no cluster detected';
      return hit.detail.includes(c.person.name) ? 'yes — named in the cluster window' : 'no — outside the cluster window';
    }),
    rule('relative-turnover', 'Turnover versus the issuer median', 'person line value ÷ issuer median line value', SEC, (c) => {
      const mine = values(c);
      const theirs = ctx_folder(c)
        .map((line) => tradeValue(line))
        .filter((value) => Number.isFinite(value) && value > 0);
      const middle = median(theirs);
      if (!mine.length || !Number.isFinite(middle) || middle <= 0) return null;
      return `${(Math.max(...mine) / middle).toFixed(2)}×`;
    }),
    rule('role-mix', 'Role mix at the issuer', 'distinct role classes across the issuer', SEC, (c) =>
      `${new Set(ctx_folder(c).map((line) => line.roleBits & 7)).size} distinct role patterns`),
    rule('same-bank-owners', 'Issuers tied to the same bank', 'distinct issuers in the register naming this bank', 'Filer register', (c) =>
      c.person.bank ? '1 (issuer of record)' : null),
    rule('issuer-first', 'First issuer trade in the window', 'min transactionDate', SEC, (c) => {
      const dates = ctx_folder(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[0] ?? null;
    }),
    rule('issuer-last', 'Last issuer trade in the window', 'max transactionDate', SEC, (c) => {
      const dates = ctx_folder(c).map((line) => line.traded).filter(Boolean).sort();
      return dates[dates.length - 1] ?? null;
    }),
    rule('issuer-codes', 'Distinct codes at the issuer', 'distinct transactionCode', SEC, (c) =>
      count(new Set(ctx_folder(c).map((line) => line.code).filter(Boolean)).size)),
    rule('dominance', 'Share of issuer sale value held by the largest seller', 'largest owner ÷ issuer total', SEC, (c) => {
      const tally = peerSaleByOwner(c);
      const total = [...tally.values()].reduce((value, entry) => value + entry, 0);
      if (!total) return null;
      return pct((Math.max(...tally.values()) / total) * 100);
    }),
    rule('lines-rank', 'Rank by number of reported lines', 'rank by line count', SEC, (c) => {
      const tally = new Map<string, number>();
      for (const line of ctx_folder(c)) tally.set(line.owner, (tally.get(line.owner) ?? 0) + 1);
      const ordered = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const index = ordered.findIndex(([owner]) => owner === c.person.name);
      return index >= 0 ? `#${index + 1} of ${ordered.length}` : null;
    }),
    rule('issuer-avg-value', 'Issuer average reported line value', 'mean shares × price', SEC, (c) => {
      const all = ctx_folder(c)
        .map((line) => tradeValue(line))
        .filter((value) => Number.isFinite(value) && value > 0);
      return all.length ? usd(sum(all) / all.length) : null;
    }),
  ],
};

const provenance: Family<PersonContext> = {
  id: 'provenance',
  label: 'Record provenance & completeness',
  blurb: 'What the source document contains, so the reader can judge the evidence behind every other row.',
  rules: [
    rule('accession', 'EDGAR accession of the latest filing', 'accessionNumber', SEC, (c) => latestLine(c)?.accession ?? null),
    rule('accessions', 'Distinct accessions behind this record', 'count of accessionNumber', SEC, (c) =>
      count(new Set(lines(c).map((line) => line.accession).filter(Boolean)).size)),
    rule('url', 'Source document URL', 'filing primaryDocument path', SEC, (c) => latestLine(c)?.url ?? null),
    rule('period', 'Period of report', 'periodOfReport', SEC, (c) => latestLine(c)?.filed ?? null),
    rule('trade-date', 'Transaction date present', 'transactionDate', SEC, (c) =>
      lines(c).every((line) => Boolean(line.traded)) ? 'yes — every line dated' : 'no — a line has no date'),
    rule('price-present', 'Price reported', 'transactionPricePerShare', SEC, (c) =>
      lines(c).every((line) => line.price > 0) ? 'yes — every line priced' : 'no — a line has no price'),
    rule('shares-present', 'Share count reported', 'transactionShares', SEC, (c) =>
      lines(c).every((line) => line.shares >= 0) ? 'yes' : 'no'),
    rule('holdings-present', 'Holdings after transaction reported', 'sharesOwnedFollowingTransaction', SEC, (c) =>
      lines(c).every((line) => line.after >= 0) ? 'yes' : 'no'),
    rule('ownership-flag', 'Direct or indirect ownership flag', 'directOrIndirectOwnership', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.ownership).filter(Boolean))].join(', ') || null),
    rule('plan-flag', 'Rule 10b5-1 checkbox', 'aff10b5One', SEC, (c) =>
      lines(c).some((line) => line.tenb5one) ? 'checked on at least one line' : 'not checked'),
    rule('role-flags', 'Relationship flags present', 'isOfficer / isDirector / isTenPercentOwner', SEC, (c) =>
      c.person.roleBits ? `flags ${c.person.roleBits}` : 'no flag set'),
    rule('owner-name', 'Reporting owner name', 'rptOwnerName', SEC, (c) => c.person.name),
    rule('security-title', 'Security title', 'securityTitle', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.security).filter(Boolean))].join('; ') || null),
    rule('nature', 'Nature of ownership text', 'natureOfOwnership', SEC, (c) =>
      [...new Set(lines(c).map((line) => line.nature).filter(Boolean))].join('; ') || 'not reported'),
    rule('derivative-lines', 'Derivative lines present', 'derivativeTable', SEC, (c) =>
      count(lines(c).filter((line) => line.derivative).length)),
    rule('line-completeness', 'Completeness of the latest line', 'date + code + shares + price + holdings', SEC, (c) => {
      const line = latestLine(c);
      if (!line) return null;
      const checks = [Boolean(line.traded), Boolean(line.code), line.shares >= 0, line.price > 0, line.after >= 0];
      return `${checks.filter(Boolean).length} of 5 fields present`;
    }),
    rule('price-plausibility', 'Price plausibility check', '0 < reported price < $10,000', SEC, (c) => {
      const prices = lines(c).map((line) => line.price).filter((price) => price > 0);
      if (!prices.length) return null;
      return prices.every((price) => price < 10_000) ? 'every price inside $0–$10,000' : 'a price is implausible';
    }),
    rule('source-system', 'Source system', 'SEC EDGAR submissions + primary documents', SEC, () =>
      'SEC EDGAR (data.sec.gov submissions, Archives primary documents)'),
    rule('cache-age', 'Record cache', 'server-side weekly cache for Form 4 documents', SEC, () =>
      'cached for seven days; refresh button reloads from EDGAR'),
    rule('corroboration', 'Corroborating filings', 'distinct filings covering this person', SEC, (c) =>
      count(c.person.filings.length)),
  ],
};

export const INDIVIDUAL_FAMILIES_A2: Family<PersonContext>[] = [
  bank,
  peers,
  provenance,
];
