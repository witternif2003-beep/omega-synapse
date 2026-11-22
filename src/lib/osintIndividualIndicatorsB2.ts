/**
 * INDIVIDUAL INDICATOR FAMILIES, SECOND SET, SECOND MODULE
 *
 * Bank linkage, external records and the composite screen summary: the three families that
 * close the 280-measure person dossier.
 */

import { safeRatio } from './osintFinancials.ts';
import {
  count,
  daysSince,
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

const lines = (c: PersonContext) => c.person.transactions;
const sales = (c: PersonContext) => lines(c).filter((line) => line.code === 'S');
const purchases = (c: PersonContext) => lines(c).filter((line) => line.code === 'P');
const saleValue = (c: PersonContext) =>
  sum(sales(c).map((line) => tradeValue(line)).filter((value) => Number.isFinite(value)));

const bankLinkage: Family<PersonContext> = {
  id: 'bank-linkage',
  label: 'Bank linkage',
  blurb: 'How this issuer ties to a Georgia charter in the FDIC record.',
  rules: [
    rule('issuer', 'Issuer', 'issuerName', SEC, (c) => c.person.issuerName || null),
    rule('bank', 'Operating bank', 'filer register bank', 'Filer register', (c) => c.person.bank || null),
    rule('cert', 'FDIC certificate', 'CERT', 'FDIC institutions API', (c) => c.inst?.cert ?? null),
    rule('state-name', 'Institution name in the FDIC list', 'NAME', 'FDIC institutions API', (c) => c.inst?.name ?? null),
    rule('city', 'Head office city', 'CITY', 'FDIC institutions API', (c) => c.inst?.city ?? null),
    rule('holding', 'Holding company', 'NAMEHCR', 'FDIC institutions API', (c) => c.inst?.holdingCompany ?? null),
    rule('assets', 'Charter assets', 'ASSET from the institutions API', FDIC, (c) =>
      c.inst ? usdThousands(c.inst.assetsThousands) : null),
    rule('issuer-filing-count', 'Filings at this CIK', 'count of Form 4 documents for the issuer', SEC, (c) =>
      count(c.issuerFilings.length)),
    rule('deposits', 'Charter deposits', 'DEP', FDIC, (c) => (c.fin ? usdThousands(c.fin.latest.dep) : null)),
    rule('match', 'Charter matched to the FDIC list', 'name match against the FDIC response', 'FDIC institutions API', (c) =>
      c.inst ? 'matched' : 'no FDIC charter matched this bank name'),
    rule('ticker', 'Ticker', 'issuer trading symbol', SEC, (c) => c.person.ticker || null),
    rule('cik', 'Issuer CIK', 'Central Index Key', SEC, (c) => c.person.cik || null),
    rule('role', 'Reporting relationship', 'roleBits → role text', SEC, (c) => c.person.role),
    rule('class', 'Employment class', 'officer / director / owner flags', SEC, (c) => c.person.roleClass),
    rule('title', 'Officer title', 'officerTitle', SEC, (c) => c.person.title || 'no title filed'),
    rule('issuer-insiders', 'Insiders at this issuer', 'distinct owners', SEC, (c) =>
      count(new Set(c.issuerTransactions.map((line) => line.owner)).size)),
    rule('issuer-lines', 'Reported lines at this issuer', 'count', SEC, (c) => count(c.issuerTransactions.length)),
    rule('issuer-sale-value', 'Issuer reported sale value', 'sum shares × price on code S', SEC, (c) => {
      const total = sum(
        c.issuerTransactions
          .filter((line) => line.code === 'S')
          .map((line) => tradeValue(line))
          .filter(Number.isFinite),
      );
      return total > 0 ? usd(total) : null;
    }),
    rule('person-share', 'This person’s share of issuer sale value', 'person ÷ issuer', SEC, (c) => {
      const total = sum(
        c.issuerTransactions
          .filter((line) => line.code === 'S')
          .map((line) => tradeValue(line))
          .filter(Number.isFinite),
      );
      return total > 0 ? pct(safeRatio(saleValue(c), total)) : null;
    }),
    rule('bank-equity', 'Charter equity ratio', 'EQ ÷ ASSET', FDIC, (c) =>
      c.fin ? pct(safeRatio(c.fin.latest.eq, c.fin.latest.asset)) : null),
  ],
};

const externalRecords: Family<PersonContext> = {
  id: 'external-records',
  label: 'External records',
  blurb: 'Regulator, court and press records in the live window that name this person or their bank.',
  rules: [
    rule('records', 'Records naming the person or bank', 'feed items matching either name', FEED, (c) =>
      c.items.length ? count(c.items.length) : 'none in the window'),
    rule('person-named', 'Records naming the person', 'item.people contains the name', FEED, (c) =>
      count(c.items.filter((item) => item.people.some((name) => name === c.person.name)).length)),
    rule('bank-named', 'Records naming the bank', 'item.institutions contains the bank', FEED, (c) =>
      count(c.items.filter((item) => item.institutions.some((name) => name === c.person.bank)).length)),
    rule('sanctions', 'Sanctions records', 'kind = sanctions', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'sanctions').length)),
    rule('enforcement', 'Enforcement records', 'kind = enforcement', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'enforcement').length)),
    rule('litigation', 'Litigation records', 'kind = litigation', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'litigation').length)),
    rule('press', 'Press records', 'kind = press', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'press').length)),
    rule('critical', 'Critical-severity records', 'severity = critical', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'critical').length)),
    rule('high', 'High-severity records', 'severity = high', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'high').length)),
    rule('publishers', 'Distinct publishers', 'distinct publisher', FEED, (c) =>
      count(new Set(c.items.map((item) => item.publisher)).size)),
    rule('latest', 'Latest record headline', 'newest item', FEED, (c) => {
      if (!c.items.length) return null;
      return [...c.items].sort((a, b) => b.published.localeCompare(a.published))[0].title;
    }),
    rule('latest-age', 'Age of the latest record', 'now − published', FEED, (c) => {
      if (!c.items.length) return null;
      return `${daysSince([...c.items].map((item) => item.published).sort().pop()!)} days`;
    }),
    rule('records-30', 'Records in the last thirty days', 'published within 30 days', FEED, (c) =>
      count(c.items.filter((item) => daysSince(item.published) <= 30).length)),
    rule('other-people', 'Other individuals named alongside', 'distinct people in matching records', FEED, (c) =>
      count(
        new Set(
          c.items
            .flatMap((item) => item.people)
            .filter((name) => name !== c.person.name),
        ).size,
      )),
    rule('sector', 'Sector-level records', 'sector = true', FEED, (c) =>
      count(c.items.filter((item) => item.sector).length)),
    rule('sources', 'Distinct source systems', 'distinct sourceId', FEED, (c) =>
      count(new Set(c.items.map((item) => item.sourceId)).size)),
    rule('sec-8k', 'Issuer current reports', 'titles containing 8-K', SEC, (c) =>
      count(c.items.filter((item) => /8-K/i.test(item.title)).length)),
    rule('sec-periodic', 'Issuer periodic reports', 'titles containing 10-Q or 10-K', SEC, (c) =>
      count(c.items.filter((item) => /10-[QK]/i.test(item.title)).length)),
    rule('federal-register', 'Federal Register documents', 'publisher = Federal Register', FEED, (c) =>
      count(c.items.filter((item) => /federal register/i.test(item.publisher)).length)),
    rule('record-links', 'Source links available', 'count of URLs', FEED, (c) =>
      count(c.items.filter((item) => Boolean(item.url)).length)),
  ],
};

const composites: Family<PersonContext> = {
  id: 'composites',
  label: 'Composite screens',
  blurb: 'The screens that fired, summarised. Each line names the underlying measures so the judgement can be checked.',
  rules: [
    rule('screens-fired', 'Pattern screens fired', 'count of transfer-pattern hits', SEC, (c) =>
      count(transferPatterns(lines(c), c.person.name).length)),
    rule('high-screens', 'High-severity screens', 'screens rated high', SEC, (c) =>
      count(
        transferPatterns(lines(c), c.person.name).filter((pattern) => pattern.severity === 'high').length,
      )),
    rule('late', 'Late filing present', 'late-filing screen', SEC, (c) =>
      transferPatterns(lines(c), c.person.name).some((pattern) => pattern.id === 'late-filing') ? 'yes' : 'no'),
    rule('liquidation', 'Near-total disposition present', 'near-total-liquidation screen', SEC, (c) =>
      transferPatterns(lines(c), c.person.name).some((pattern) => pattern.id === 'near-total-liquidation') ? 'yes' : 'no'),
    rule('exercise-sale', 'Exercise-and-sell present', 'exercise-and-sell screen', SEC, (c) =>
      transferPatterns(lines(c), c.person.name).some((pattern) => pattern.id === 'exercise-and-sell') ? 'yes' : 'no'),
    rule('cluster', 'Cluster-selling present at the issuer', 'cluster-selling screen', SEC, (c) =>
      transferPatterns(c.issuerTransactions).some((pattern) => pattern.id === 'cluster-selling') ? 'yes' : 'no'),
    rule('outlier', 'Size outlier present', 'size-outlier screen', SEC, (c) =>
      transferPatterns(lines(c), c.person.name).some((pattern) => pattern.id === 'size-outlier') ? 'yes' : 'no'),
    rule('gift', 'Gift transfer present', 'gift-transfer screen', SEC, (c) =>
      transferPatterns(lines(c), c.person.name).some((pattern) => pattern.id === 'gift-transfer') ? 'yes' : 'no'),
    rule('round-trip', 'Rapid round trip present', 'rapid-round-trip screen', SEC, (c) =>
      transferPatterns(c.issuerTransactions).some((pattern) => pattern.id === 'rapid-round-trip') ? 'yes' : 'no'),
    rule('net-direction', 'Net direction', 'sale value − purchase value', SEC, (c) => {
      const value = saleValue(c);
      if (!value) return null;
      return { value: `net disposed ${usd(value)}`, tone: 'watch' as const };
    }),
    rule('sell-pressure', 'Sale value against charter deposits', 'sale value ÷ charter deposits', FDIC, (c) => {
      const value = saleValue(c);
      return c.fin && value > 0 ? pct(safeRatio(value, c.fin.latest.dep * 1000), 4) : null;
    }),
    rule('screen-density', 'Screens per reported line', 'screens ÷ lines', SEC, (c) =>
      lines(c).length ? (transferPatterns(lines(c), c.person.name).length / lines(c).length).toFixed(2) : null),
    rule('critical-screens', 'Critical-severity screens', 'screens rated critical', SEC, (c) =>
      count(transferPatterns(lines(c), c.person.name).filter((pattern) => pattern.severity === 'critical').length)),
    rule('bank-flag', 'Bank under a live high record', 'bank has a high or critical feed record', FEED, (c) =>
      c.items.some((item) => item.severity === 'high' || item.severity === 'critical') ? 'yes' : 'no'),
    rule('bank-noncurrent-flag', 'Bank noncurrent above the Georgia median', 'NCLNLSR > peer median', FDIC, (c) =>
      c.fin && c.peer ? (c.fin.latest.nclnr > c.peer.nclnr ? 'yes' : 'no') : null),
    rule('bank-capital-flag', 'Bank equity below the Georgia median', 'equity ratio < peer median', FDIC, (c) =>
      c.fin && c.peer
        ? safeRatio(c.fin.latest.eq, c.fin.latest.asset) < c.peer.equityRatio
          ? 'yes'
          : 'no'
        : null),
    rule('role-weight', 'Role weight for review', 'officer > director > owner > other', SEC, (c) =>
      c.person.roleBits & 1 ? 'officer (highest weight)' : c.person.roleBits & 2 ? 'director' : c.person.roleBits & 4 ? '10% owner' : 'other'),
    rule('review-band', 'Review band from fired screens', 'screens × role weight × net direction', SEC, (c) => {
      const hits = transferPatterns(lines(c), c.person.name).length;
      const officer = Boolean(c.person.roleBits & 1);
      const net = saleValue(c) > 0;
      const score = hits * (officer ? 2 : 1) + (net ? 1 : 0);
      const band = score >= 5 ? 'elevated' : score >= 2 ? 'watch' : 'routine';
      return { value: `${band} (score ${score})`, tone: band === 'elevated' ? 'risk' : band === 'watch' ? 'watch' : 'steady' };
    }),
    rule('purchase-value', 'Reported purchase value', 'sum shares × price on code P', SEC, (c) =>
      purchases(c).length ? usd(sum(purchases(c).map((line) => tradeValue(line)).filter(Number.isFinite))) : null),
    rule('bank-record-count', 'Bank records in the window', 'feed items naming the bank', FEED, (c) =>
      count(c.items.filter((item) => item.institutions.some((name) => name === c.person.bank)).length)),
  ],
};

export const INDIVIDUAL_FAMILIES_B2: Family<PersonContext>[] = [
  bankLinkage,
  externalRecords,
  composites,
];
