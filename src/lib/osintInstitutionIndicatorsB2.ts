/**
 * INSTITUTION INDICATOR FAMILIES, SECOND SET, SECOND MODULE
 *
 * Supervision and public records, insider roles, filing compliance and record integrity:
 * the four families that close the 280-measure dossier.
 */

import { safeRatio } from './osintFinancials.ts';
import {
  count,
  dayGap,
  daysSince,
  pct,
  sum,
  tradeValue,
  type Family,
  type InstitutionContext,
  type RuleResult,
} from './osintIndicatorTypes.ts';

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: InstitutionContext) => RuleResult,
) => ({ key, label, basis, source, run });

const REPORT = 'FDIC call report';
const SOD = 'FDIC Summary of Deposits';
const SEC = 'SEC EDGAR Form 4';
const FEED = 'OSINT feed';

const saleLines = (c: InstitutionContext) => c.transactions.filter((line) => line.code === 'S');

const supervision: Family<InstitutionContext> = {
  id: 'supervision',
  label: 'Supervision & public records',
  blurb: 'Every regulator, court or press record in the live window that names this charter, by agency and severity.',
  rules: [
    rule('records', 'Records naming the bank', 'feed items attributing this institution', FEED, (c) =>
      c.items.length ? count(c.items.length) : 'none in the window'),
    rule('federal-register', 'Federal Register documents', 'publisher = Federal Register', FEED, (c) =>
      count(c.items.filter((item) => /federal register/i.test(item.publisher)).length)),
    rule('fdic-agency', 'FDIC documents', 'publisher = FDIC', FEED, (c) =>
      count(c.items.filter((item) => /fdic/i.test(item.publisher)).length)),
    rule('frb-agency', 'Federal Reserve documents', 'publisher = Federal Reserve', FEED, (c) =>
      count(c.items.filter((item) => /federal reserve/i.test(item.publisher)).length)),
    rule('occ-agency', 'OCC documents', 'publisher = OCC', FEED, (c) =>
      count(c.items.filter((item) => /occ|comptroller/i.test(item.publisher)).length)),
    rule('fincen-agency', 'FinCEN documents', 'publisher = FinCEN', FEED, (c) =>
      count(c.items.filter((item) => /fincen/i.test(item.publisher)).length)),
    rule('doj', 'Justice Department records', 'publisher = Department of Justice', FEED, (c) =>
      count(c.items.filter((item) => /justice/i.test(item.publisher)).length)),
    rule('ofac', 'OFAC records', 'publisher = OFAC', FEED, (c) =>
      count(c.items.filter((item) => /ofac/i.test(item.publisher)).length)),
    rule('enforcement', 'Enforcement records', 'kind = enforcement', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'enforcement').length)),
    rule('sanctions', 'Sanctions records', 'kind = sanctions', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'sanctions').length)),
    rule('litigation', 'Litigation records', 'kind = litigation', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'litigation').length)),
    rule('press', 'Press records', 'kind = press', FEED, (c) =>
      count(c.items.filter((item) => item.kind === 'press').length)),
    rule('critical', 'Critical-severity records', 'severity = critical', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'critical').length)),
    rule('high', 'High-severity records', 'severity = high', FEED, (c) =>
      count(c.items.filter((item) => item.severity === 'high').length)),
    rule('latest', 'Latest record headline', 'newest item by published date', FEED, (c) => {
      if (!c.items.length) return null;
      return [...c.items].sort((a, b) => b.published.localeCompare(a.published))[0].title;
    }),
    rule('latest-age', 'Age of the latest record', 'now − published', FEED, (c) => {
      if (!c.items.length) return null;
      return `${daysSince([...c.items].map((item) => item.published).sort().pop()!)} days`;
    }),
    rule('records-30', 'Records in the last thirty days', 'published within 30 days', FEED, (c) =>
      count(c.items.filter((item) => daysSince(item.published) <= 30).length)),
    rule('agencies', 'Distinct agencies naming the bank', 'distinct publisher', FEED, (c) =>
      count(new Set(c.items.map((item) => item.publisher)).size)),
    rule('named-people', 'Individuals named by those records', 'count of attributed people', FEED, (c) =>
      count(new Set(c.items.flatMap((item) => item.people)).size)),
    rule('sector-flag', 'Sector-level records', 'sector = true', FEED, (c) =>
      count(c.items.filter((item) => item.sector).length)),
  ],
};

const insiderRoles: Family<InstitutionContext> = {
  id: 'insider-roles',
  label: 'Insider roles & selling structure',
  blurb: 'Who inside the bank company reported trading, in what role, and how the sales split across those roles.',
  rules: [
    rule('insiders', 'Reporting insiders', 'distinct rptOwnerName', SEC, (c) =>
      c.transactions.length ? count(new Set(c.transactions.map((line) => line.owner)).size) : null),
    rule('officers', 'Officers reporting', 'distinct owners with isOfficer', SEC, (c) =>
      count(new Set(c.transactions.filter((line) => line.roleBits & 1).map((line) => line.owner)).size)),
    rule('directors', 'Directors reporting', 'distinct owners with isDirector', SEC, (c) =>
      count(new Set(c.transactions.filter((line) => line.roleBits & 2).map((line) => line.owner)).size)),
    rule('owners', 'Ten-percent owners reporting', 'distinct owners with isTenPercentOwner', SEC, (c) =>
      count(new Set(c.transactions.filter((line) => line.roleBits & 4).map((line) => line.owner)).size)),
    rule('other', 'Other reporting persons', 'distinct owners with isOther only', SEC, (c) =>
      count(new Set(c.transactions.filter((line) => !(line.roleBits & 7)).map((line) => line.owner)).size)),
    rule('titles', 'Officer titles reported', 'distinct officerTitle', SEC, (c) =>
      [...new Set(c.transactions.map((line) => line.title).filter(Boolean))].join('; ') || null),
    rule('filing-count', 'Form 4 filings read', 'count of filings', SEC, (c) =>
      c.filings.length ? count(c.filings.length) : null),
    rule('lines', 'Reported transaction lines', 'count of lines', SEC, (c) => count(c.transactions.length)),
    rule('lines-per-insider', 'Lines per insider', 'lines ÷ insiders', SEC, (c) => {
      const people = new Set(c.transactions.map((line) => line.owner)).size;
      return people ? (c.transactions.length / people).toFixed(2) : null;
    }),
    rule('sellers', 'Sellers', 'distinct owners on code S', SEC, (c) =>
      count(new Set(saleLines(c).map((line) => line.owner)).size)),
    rule('officer-sale-share', 'Officer share of sale value', 'officer sale value ÷ total sale value', SEC, (c) => {
      const total = sum(saleLines(c).map((line) => tradeValue(line)).filter(Number.isFinite));
      const officer = sum(
        saleLines(c)
          .filter((line) => line.roleBits & 1)
          .map((line) => tradeValue(line))
          .filter(Number.isFinite),
      );
      return total > 0 ? pct(safeRatio(officer, total)) : null;
    }),
    rule('director-sale-share', 'Director share of sale value', 'director sale value ÷ total', SEC, (c) => {
      const total = sum(saleLines(c).map((line) => tradeValue(line)).filter(Number.isFinite));
      const director = sum(
        saleLines(c)
          .filter((line) => line.roleBits & 2)
          .map((line) => tradeValue(line))
          .filter(Number.isFinite),
      );
      return total > 0 ? pct(safeRatio(director, total)) : null;
    }),
    rule('largest-seller', 'Largest seller by reported value', 'max owner sale value', SEC, (c) => {
      const tally = new Map<string, number>();
      for (const line of saleLines(c)) {
        const value = tradeValue(line);
        if (!Number.isFinite(value)) continue;
        tally.set(line.owner, (tally.get(line.owner) ?? 0) + value);
      }
      if (!tally.size) return null;
      return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }),
    rule('buyers', 'Buyers', 'distinct owners on code P', SEC, (c) =>
      count(new Set(c.transactions.filter((line) => line.code === 'P').map((line) => line.owner)).size)),
    rule('newest-insider', 'Most recently active insider', 'owner on the newest line', SEC, (c) => {
      if (!c.transactions.length) return null;
      return [...c.transactions].sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed))[0].owner;
    }),
    rule('newest-date', 'Date of the newest line', 'max transactionDate', SEC, (c) => {
      const dates = c.transactions.map((line) => line.traded).filter(Boolean).sort();
      return dates[dates.length - 1] ?? null;
    }),
    rule('distinct-dates', 'Distinct transaction dates', 'distinct transactionDate', SEC, (c) =>
      count(new Set(c.transactions.map((line) => line.traded).filter(Boolean)).size)),
    rule('event-days', 'Busiest single transaction date', 'max lines on one date', SEC, (c) => {
      const tally = new Map<string, number>();
      for (const line of c.transactions) tally.set(line.traded, (tally.get(line.traded) ?? 0) + 1);
      if (!tally.size) return null;
      const [date, lines] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      return `${date} — ${lines} lines`;
    }),
    rule('roles-selling', 'Role classes among sellers', 'distinct role patterns on sales', SEC, (c) =>
      count(new Set(saleLines(c).map((line) => line.roleBits & 7)).size)),
    rule('role-coverage', 'Roles present at the issuer', 'officer / director / owner / other', SEC, (c) => {
      const bits = new Set(c.transactions.map((line) => line.roleBits & 7));
      const labels = [...bits].map((value) => (value & 1 ? 'officer' : value & 2 ? 'director' : value & 4 ? 'owner' : 'other'));
      return labels.length ? labels.join(', ') : null;
    }),
  ],
};

function lateLine(traded: string, filed: string): boolean {
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

const filingCompliance: Family<InstitutionContext> = {
  id: 'filing-compliance',
  label: 'Filing compliance',
  blurb: 'Whether the Form 4 documents behind this dossier were filed on time and carried the fields the form requires.',
  rules: [
    rule('late-lines', 'Lines filed after the deadline', '> 2 business days from trade to filing', SEC, (c) =>
      count(c.transactions.filter((line) => lateLine(line.traded, line.filed)).length)),
    rule('late-share', 'Late share of reported lines', 'lines over four calendar days ÷ lines', SEC, (c) => {
      if (!c.transactions.length) return null;
      const late = c.transactions.filter((line) => {
        const gap = dayGap(line.traded, line.filed);
        return Number.isFinite(gap) && gap > 4;
      }).length;
      return pct(safeRatio(late, c.transactions.length));
    }),
    rule('mean-lag', 'Mean trade-to-filing lag', 'mean filingDate − transactionDate', SEC, (c) => {
      const gaps = c.transactions.map((line) => dayGap(line.traded, line.filed)).filter(Number.isFinite);
      return gaps.length ? `${(sum(gaps) / gaps.length).toFixed(1)} days` : null;
    }),
    rule('max-lag', 'Longest lag', 'max filingDate − transactionDate', SEC, (c) => {
      const gaps = c.transactions.map((line) => dayGap(line.traded, line.filed)).filter(Number.isFinite);
      return gaps.length ? `${Math.round(Math.max(...gaps))} days` : null;
    }),
    rule('same-day', 'Lines filed the same day as the trade', 'lag = 0', SEC, (c) =>
      count(c.transactions.filter((line) => dayGap(line.traded, line.filed) === 0).length)),
    rule('unpriced', 'Lines without a reported price', 'transactionPricePerShare absent', SEC, (c) =>
      count(c.transactions.filter((line) => line.price <= 0).length)),
    rule('missing-holdings', 'Lines without shares held after', 'sharesOwnedFollowingTransaction absent', SEC, (c) =>
      count(c.transactions.filter((line) => line.after < 0).length)),
    rule('missing-date', 'Lines without a transaction date', 'transactionDate absent', SEC, (c) =>
      count(c.transactions.filter((line) => !line.traded).length)),
    rule('derivative-lines', 'Derivative lines', 'derivativeTable=true', SEC, (c) =>
      count(c.transactions.filter((line) => line.derivative).length)),
    rule('plan-flagged', 'Lines with a Rule 10b5-1 flag', 'aff10b5One = 1', SEC, (c) =>
      count(c.transactions.filter((line) => line.tenb5one).length)),
    rule('plan-share', 'Share of lines with a trading plan', 'flagged ÷ lines', SEC, (c) =>
      c.transactions.length ? pct(safeRatio(c.transactions.filter((line) => line.tenb5one).length, c.transactions.length)) : null),
    rule('indirect-lines', 'Indirect-ownership lines', 'directOrIndirectOwnership = I', SEC, (c) =>
      count(c.transactions.filter((line) => line.ownership === 'I').length)),
    rule('gift-lines', 'Gift lines', 'transactionCode G', SEC, (c) =>
      count(c.transactions.filter((line) => line.code === 'G').length)),
    rule('withholding-lines', 'Tax-withholding lines', 'transactionCode F', SEC, (c) =>
      count(c.transactions.filter((line) => line.code === 'F').length)),
    rule('award-lines', 'Award lines', 'transactionCode A', SEC, (c) =>
      count(c.transactions.filter((line) => line.code === 'A').length)),
    rule('exercise-lines', 'Option exercise lines', 'transactionCode M', SEC, (c) =>
      count(c.transactions.filter((line) => line.code === 'M').length)),
    rule('codes', 'Distinct transaction codes', 'distinct transactionCode', SEC, (c) =>
      count(new Set(c.transactions.map((line) => line.code).filter(Boolean)).size)),
    rule('documents', 'Distinct source documents', 'distinct accession', SEC, (c) =>
      count(new Set(c.transactions.map((line) => line.accession)).size)),
    rule('on-time-lines', 'Lines filed inside the deadline', '≤ 2 business days from trade to filing', SEC, (c) =>
      count(c.transactions.filter((line) => !lateLine(line.traded, line.filed)).length)),
    rule('field-completeness', 'Completeness of the reported lines', 'date + code + shares + price + holdings', SEC, (c) => {
      if (!c.transactions.length) return null;
      const complete = c.transactions.filter(
        (line) => line.traded && line.code && line.shares >= 0 && line.after >= 0,
      ).length;
      return `${complete} of ${c.transactions.length} lines carry all five fields`;
    }),
  ],
};

const recordIntegrity: Family<InstitutionContext> = {
  id: 'record-integrity',
  label: 'Record integrity',
  blurb: 'How fresh and how complete the underlying filings are, so a reader can weigh every other measure.',
  rules: [
    rule('call-quarter', 'Latest call-report quarter', 'max REPDTE', REPORT, (c) =>
      c.fin ? c.fin.quarters[c.fin.quarters.length - 1] : null),
    rule('call-age', 'Age of the latest call report', 'quarters since the newest REPDTE', REPORT, (c) => {
      if (!c.fin) return null;
      const quarter = c.fin.quarters[c.fin.quarters.length - 1];
      const year = Number(quarter.slice(0, 4));
      const month = Number(quarter.slice(4, 6));
      const now = new Date();
      const behind =
        (now.getUTCFullYear() - year) * 4 + (Math.floor(now.getUTCMonth() / 3) + 1 - Math.ceil(month / 3));
      return `${Math.max(0, behind)} quarter(s) behind the current quarter`;
    }),
    rule('quarters-series', 'Quarters in the series', 'count of REPDTE values', REPORT, (c) =>
      c.fin ? count(c.fin.quarters.length) : null),
    rule('fields-reported', 'Call-report fields with a non-zero value', 'count of the 19 reported fields', REPORT, (c) => {
      if (!c.fin) return null;
      const values = Object.values(c.fin.latest).filter((value) => Number(value) !== 0);
      return `${values.length} of 19`;
    }),
    rule('zero-fields', 'Call-report fields reported as zero', 'count of zero values', REPORT, (c) => {
      if (!c.fin) return null;
      return count(Object.values(c.fin.latest).filter((value) => Number(value) === 0).length);
    }),
    rule('asset-present', 'Total assets reported', 'ASSET > 0', REPORT, (c) =>
      c.fin && c.fin.latest.asset > 0 ? 'yes' : 'not reported'),
    rule('deposit-present', 'Deposits reported', 'DEP > 0', REPORT, (c) =>
      c.fin && c.fin.latest.dep > 0 ? 'yes' : 'not reported'),
    rule('equity-present', 'Equity reported', 'EQ > 0', REPORT, (c) =>
      c.fin && c.fin.latest.eq > 0 ? 'yes' : 'not reported'),
    rule('income-present', 'Net income reported', 'NETINC filed', REPORT, (c) =>
      c.fin ? (c.fin.latest.netinc !== 0 ? 'yes' : 'filed as zero') : null),
    rule('employees-present', 'Employee count reported', 'NUMEMP', REPORT, (c) =>
      c.fin && c.fin.latest.numemp > 0 ? count(c.fin.latest.numemp) : null),
    rule('sod-present', 'Summary of Deposits match', 'institution found in the SOD response', SOD, (c) =>
      c.sod ? 'matched' : 'not in the SOD response'),
    rule('sod-branches', 'SOD branches reported', 'branch count', SOD, (c) => (c.sod ? count(c.sod.branches) : null)),
    rule('cert', 'FDIC certificate', 'CERT', 'FDIC institutions API', (c) => c.inst.cert || null),
    rule('name', 'Institution name', 'NAME', 'FDIC institutions API', (c) => c.inst.name || null),
    rule('city', 'Head office city', 'CITY', 'FDIC institutions API', (c) => c.inst.city || null),
    rule('holding', 'Holding company on file', 'NAMEHCR', 'FDIC institutions API', (c) =>
      c.inst.holdingCompany || 'not filed'),
    rule('insider-source', 'Insider source', 'SEC EDGAR primary documents', SEC, (c) =>
      c.filings.length ? `${c.filings.length} documents parsed` : 'no Form 4 documents for this charter'),
    rule('insider-cache', 'Insider cache', 'server-side weekly cache', SEC, () =>
      'seven days, refresh reloads from EDGAR'),
    rule('feed-sources', 'Feed sources naming the bank', 'distinct sourceId', FEED, (c) =>
      count(new Set(c.items.map((item) => item.sourceId)).size)),
    rule('record-breadth', 'All records reviewed for this charter', 'call report + SOD + Form 4 + feed', 'This dossier', (c) =>
      `${c.fin ? 1 : 0} call report · ${c.sod ? c.sod.branches : 0} branches · ${c.filings.length} Form 4 · ${c.items.length} feed records`),
  ],
};

export const INSTITUTION_FAMILIES_B2: Family<InstitutionContext>[] = [
  supervision,
  insiderRoles,
  filingCompliance,
  recordIntegrity,
];
