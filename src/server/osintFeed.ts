import {
  type OsintKind,
  type OsintSeverity,
  type OsintItem,
  type OsintSourceReport,
  type OsintFeed,
  getText,
  tag,
  attr,
  toIso,
  hash,
  georgiaInstitutions,
  type Matcher,
  buildMatchers,
  attribute,
  type FilerFiling,
  mapLimit,
  filingsForFiler,
  secItem,
  decode,
} from './osintSources.ts';
import { GA_BANK_FILERS, type GaBankFiler } from '../data/gaBankFilers.ts';

/**
 * LIVE OSINT FEED - BUILDER, PUBLISHER PARSERS AND INSIDER FILINGS
 *
 * Reads SEC EDGAR, the Federal Register, Federal Reserve and Department of Justice RSS
 * releases, FDIC press releases and OFAC actions, then parses each requested Form 4
 * document into individual transaction lines. Nothing is synthesised: a publisher that
 * cannot be reached contributes nothing and is reported unreachable.
 */

export async function fetchFilingDetail(
  cik: string,
  accession: string,
  document: string,
): Promise<{ ok: boolean; url: string; filing: OsintFilingRow | null; error?: string }> {
  const clean = accession.replace(/-/g, '');
  const name = (document || 'primary_doc.xml').replace(/^[^/]+\//, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${clean}/${name}`;
  try {
    const xml = await getText(url, 12_000);
    const filing = parseForm4(xml, url, accession)?.row ?? null;
    return { ok: Boolean(filing), url, filing };
  } catch (error) {
    return {
      ok: false,
      url,
      filing: null,
      error: error instanceof Error ? error.message : 'filing not readable',
    };
  }
}

const FR_AGENCIES: Array<{ id: string; label: string; agency: string }> = [
  { id: 'fr-fdic', label: 'Federal Register — FDIC', agency: 'federal-deposit-insurance-corporation' },
  { id: 'fr-frb', label: 'Federal Register — Federal Reserve', agency: 'federal-reserve-system' },
  { id: 'fr-occ', label: 'Federal Register — OCC', agency: 'comptroller-of-the-currency' },
  { id: 'fr-fincen', label: 'Federal Register — FinCEN', agency: 'financial-crimes-enforcement-network' },
];

interface FrDoc {
  title?: string;
  abstract?: string;
  publication_date?: string;
  html_url?: string;
  type?: string;
  agencies?: Array<{ name?: string }>;
}

async function fetchFederalRegister(agency: string): Promise<FrDoc[]> {
  const url =
    `https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=${agency}` +
    '&per_page=12&order=newest&fields%5B%5D=title&fields%5B%5D=abstract&fields%5B%5D=publication_date' +
    '&fields%5B%5D=html_url&fields%5B%5D=type&fields%5B%5D=agencies';
  const body = JSON.parse(await getText(url, 12_000)) as { results?: FrDoc[] };
  return body.results ?? [];
}

interface RssItem {
  title: string;
  url: string;
  published: string;
  description: string;
}

function parseRss(xml: string): RssItem[] {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  const out: RssItem[] = [];
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0] ?? '';
    const title = tag('title', block);
    if (!title) continue;
    const link = tag('link', block) || attr('href', block);
    const published =
      toIso(tag('pubDate', block)) ||
      toIso(tag('dc:date', block)) ||
      toIso(tag('updated', block)) ||
      toIso(tag('published', block));
    out.push({ title, url: link, published, description: tag('description', block) });
  }
  return out;
}

async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    return parseRss(await getText(url, 12_000));
  } catch {
    return [];
  }
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function parseLongDate(text: string): string {
  const match = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  const day = match[2].padStart(2, '0');
  return `${match[3]}-${month}-${day}T12:00:00.000Z`;
}

function parseFdicPress(html: string): RssItem[] {
  const out: RssItem[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<div class="views-row">/i).slice(1);
  for (const block of blocks) {
    if (out.length >= 12) break;
    const href = /href="(\/news\/press-releases\/20\d\d\/[^"#?]+)"/i.exec(block)?.[1];
    if (!href) continue;
    const url = `https://www.fdic.gov${href}`;
    if (seen.has(url)) continue;
    const title = decode(
      /<p class="news-title">\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(block)?.[1] ?? '',
    );
    if (!title) continue;
    seen.add(url);
    const date = /<time[^>]*datetime="([^"]+)"/i.exec(block)?.[1] ?? '';
    out.push({
      title,
      url,
      published: date ? `${date}T12:00:00.000Z` : '',
      description: '',
    });
  }
  return out;
}

function parseOfac(html: string): RssItem[] {
  const out: RssItem[] = [];
  const seen = new Set<string>();
  const pattern = /href="(\/recent-actions\/\d{8})"[^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && out.length < 10) {
    const url = `https://ofac.treasury.gov${match[1]}`;
    const title = decode(match[2]);
    if (!title || seen.has(url)) continue;
    seen.add(url);
    const after = html.slice(match.index, match.index + 600);
    const published =
      parseLongDate(after) ||
      `${match[1].slice(8, 12)}-${match[1].slice(12, 14)}-${match[1].slice(14, 16)}T12:00:00.000Z`;
    out.push({ title, url, published, description: '' });
  }
  return out;
}

const GEORGIA_WORDS = /georgia|atlanta|savannah|augusta|macon|columbus|albany|athens|n\.d\. ga|m\.d\. ga|s\.d\. ga|northern district of georgia|middle district of georgia|southern district of georgia/i;

function baseItem(
  sourceId: string,
  publisher: string,
  kind: OsintKind,
  severity: OsintSeverity,
  raw: RssItem,
  matchers: Matcher[],
  summary = '',
): OsintItem {
  const text = `${raw.title} ${raw.description ?? ''}`;
  const institutions = attribute(text, matchers);
  return {
    id: `${kind}-${hash(`${sourceId}:${raw.url || raw.title}`)}`,
    sourceId,
    publisher,
    kind,
    title: raw.title,
    summary: summary || raw.description || '',
    url: raw.url,
    published: raw.published || new Date().toISOString(),
    severity: institutions.length ? severity : severity === 'critical' ? 'high' : 'info',
    institutions,
    people: [],
    sector: true,
  };
}

export async function buildOsintFeed(): Promise<OsintFeed> {
  const [universe, filerFilings, fedPress, dojNews, fdicPress, ofac, frDocs] = await Promise.all([
    georgiaInstitutions(),
    mapLimit(GA_BANK_FILERS, 9, (filer) => filingsForFiler(filer).catch(() => [] as FilerFiling[])),
    fetchRss('https://www.federalreserve.gov/feeds/press_all.xml'),
    fetchRss('https://www.justice.gov/news/rss'),
    getText('https://www.fdic.gov/news/press-releases').then(parseFdicPress).catch(() => [] as RssItem[]),
    getText('https://ofac.treasury.gov/recent-actions').then(parseOfac).catch(() => [] as RssItem[]),
    Promise.all(
      FR_AGENCIES.map((source) =>
        fetchFederalRegister(source.agency)
          .then((docs) => ({ source, docs }))
          .catch(() => ({ source, docs: [] as FrDoc[] })),
      ),
    ),
  ]);

  const matchers = buildMatchers(universe.rows);
  const sources: OsintSourceReport[] = [];
  const items: OsintItem[] = [];

  const allFilings = filerFilings.flat();
  const form4Items = allFilings.filter((filing) => filing.form === '4').map(secItem);
  const otherItems = allFilings.filter((filing) => filing.form !== '4').map(secItem);
  items.push(...form4Items, ...otherItems);
  const filersReached = filerFilings.filter((rows) => rows.length > 0).length;
  sources.push({
    id: 'sec-form4',
    label: 'SEC EDGAR Form 4 insider filings (Georgia bank companies)',
    url: 'https://www.sec.gov/edgar/search/',
    ok: filersReached > 0,
    count: form4Items.length,
    error: filersReached ? undefined : 'EDGAR submissions unavailable',
  });
  sources.push({
    id: 'sec-8k',
    label: 'SEC EDGAR 8-K, 10-Q and 10-K filings (same companies)',
    url: 'https://www.sec.gov/edgar/search/',
    ok: filersReached > 0,
    count: otherItems.length,
    error: filersReached ? undefined : 'EDGAR submissions unavailable',
  });

  for (const { source, docs } of frDocs) {
    const built = docs.slice(0, 6).map((doc) => {
      const raw: RssItem = {
        title: doc.title ?? '',
        url: doc.html_url ?? '',
        published: doc.publication_date ? `${doc.publication_date}T12:00:00.000Z` : '',
        description: doc.abstract ?? '',
      };
      return baseItem(
        source.id,
        'Federal Register',
        doc.type === 'Rule' || doc.type === 'Proposed Rule' ? 'regulatory' : 'enforcement',
        doc.type === 'Rule' || doc.type === 'Proposed Rule' ? 'medium' : 'high',
        raw,
        matchers,
        `${doc.type ?? 'Document'} published by ${(doc.agencies ?? [])
          .map((agency) => agency.name)
          .filter(Boolean)
          .join(', ') || 'a federal financial regulator'}.`,
      );
    });
    items.push(...built);
    sources.push({
      id: source.id,
      label: source.label,
      url: 'https://www.federalregister.gov/',
      ok: docs.length > 0,
      count: built.length,
      error: docs.length ? undefined : 'no documents returned',
    });
  }

  const fedBuilt = fedPress
    .filter((raw) => {
      const text = `${raw.title} ${raw.description}`;
      return (
        /enforcement action|consent order|cease and desist|penalty|fined|prohibition|formal agreement|bank holding|state member bank|savings and loan/i.test(
          text,
        ) ||
        attribute(text, matchers).length > 0 ||
        (GEORGIA_WORDS.test(text) && /bank|financial|deposit|lending/i.test(text))
      );
    })
    .slice(0, 8)
    .map((raw) =>
      baseItem(
        'frb-press',
        'Federal Reserve Board',
        /enforcement|consent|cease|penalt|action against/i.test(raw.title) ? 'enforcement' : 'press',
        'high',
        raw,
        matchers,
      ),
    );
  items.push(...fedBuilt);
  sources.push({
    id: 'frb-press',
    label: 'Federal Reserve Board press releases',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    ok: fedPress.length > 0,
    count: fedBuilt.length,
    error: fedPress.length ? undefined : 'no releases returned',
  });

  const dojBuilt = dojNews
    .filter((raw) => {
      const text = `${raw.title} ${raw.description}`;
      const financial =
        /bank(|er|ing|s)?\b|credit union|financial institution|money laundering|launder|securities fraud|insider trading|tax evasion|embezzl|sanction|mortgage fraud|bank fraud|wire fraud|structured deposits/i.test(
          text,
        );
      if (!financial) return false;
      return attribute(text, matchers).length > 0 || GEORGIA_WORDS.test(text);
    })
    .slice(0, 6)
    .map((raw) =>
      baseItem('doj-news', 'U.S. Department of Justice', 'litigation', 'high', raw, matchers),
    );
  items.push(...dojBuilt);
  sources.push({
    id: 'doj-news',
    label: 'Department of Justice news',
    url: 'https://www.justice.gov/news/rss',
    ok: dojNews.length > 0,
    count: dojBuilt.length,
    error: dojNews.length ? undefined : 'no releases returned',
  });

  const fdicBuilt = fdicPress.slice(0, 10).map((raw) =>
    baseItem('fdic-press', 'Federal Deposit Insurance Corporation', 'press', 'medium', raw, matchers),
  );
  items.push(...fdicBuilt);
  sources.push({
    id: 'fdic-press',
    label: 'FDIC press releases',
    url: 'https://www.fdic.gov/news/press-releases',
    ok: fdicPress.length > 0,
    count: fdicBuilt.length,
    error: fdicPress.length ? undefined : 'no releases returned',
  });

  const ofacBuilt = ofac.slice(0, 10).map((raw) =>
    baseItem('ofac', 'U.S. Treasury, OFAC', 'sanctions', 'critical', raw, matchers),
  );
  items.push(...ofacBuilt);
  sources.push({
    id: 'ofac',
    label: 'OFAC recent actions',
    url: 'https://ofac.treasury.gov/recent-actions',
    ok: ofac.length > 0,
    count: ofacBuilt.length,
    error: ofac.length ? undefined : 'no actions returned',
  });

  const deduped = new Map<string, OsintItem>();
  for (const item of items) {
    if (!item.title || !item.url) continue;
    const key = `${item.sourceId}:${item.url}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const ordered = [...deduped.values()].sort(
    (a, b) => Date.parse(b.published) - Date.parse(a.published),
  );

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      institutions: universe.rows.length,
      source: universe.source,
      retrieved: universe.retrieved,
      filers: GA_BANK_FILERS.length,
      georgiaFilers: GA_BANK_FILERS.filter((filer) => filer.scope === 'GEORGIA').length,
    },
    sources,
    items: ordered,
    institutions: universe.rows,
  };
}

export interface OsintFilingRow {
  id: string;
  owner: string;
  roleBits: number;
  title: string;
  filed: string;
  traded: string;
  code: string;
  shares: number;
  price: number;
  after: number;
  ownership: string;
  url: string;
}

/** One reported line item from a Form 4 document. */
export interface OsintTransaction {
  accession: string;
  owner: string;
  roleBits: number;
  title: string;
  filed: string;
  traded: string;
  code: string;
  shares: number;
  price: number;
  after: number;
  ownership: string;
  nature: string;
  security: string;
  derivative: boolean;
  tenb5one: boolean;
  url: string;
}

export interface OsintInsiderResponse {
  ok: boolean;
  issuer: {
    key: string;
    name: string;
    cik: string;
    ticker: string;
    bank: string;
    city: string;
    scope: string;
  };
  fetchedAt: string;
  cacheSeconds: number;
  error?: string;
  filings: OsintFilingRow[];
  /** Every reported transaction line, not only the first line of each filing. */
  transactions: OsintTransaction[];
  people: number;
}

const INSIDER_TTL_MS = 7 * 24 * 3_600_000;
const insiderCache = new Map<string, { at: number; response: OsintInsiderResponse }>();

function firstBlock(name: string, xml: string): string {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return match?.[1] ?? '';
}

function valueOf(parent: string, name: string): string {
  const block = firstBlock(name, parent);
  if (!block) return '';
  return tag('value', block);
}

function numberOf(value: string): number {
  if (!value) return -1;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : -1;
}

function pickDate(rows: OsintFilingRow[], accession: string): string {
  const row = rows.find((entry) => entry.id === accession);
  return row ? row.filed : '';
}

function parseForm4(
  xml: string,
  url: string,
  accession: string,
): { row: OsintFilingRow; transactions: OsintTransaction[] } | null {
  const owner = tag('rptOwnerName', xml).replace(/\s+/g, ' ').trim();
  if (!owner) return null;
  const relationship = firstBlock('reportingOwnerRelationship', xml);
  const roleBits =
    (tag('isOfficer', relationship) === '1' ? 1 : 0) |
    (tag('isDirector', relationship) === '1' ? 2 : 0) |
    (tag('isTenPercentOwner', relationship) === '1' ? 4 : 0) |
    (tag('isOther', relationship) === '1' ? 8 : 0);
  const title = tag('officerTitle', relationship) || tag('otherText', relationship);
  const transaction =
    firstBlock('nonDerivativeTransaction', xml) || firstBlock('derivativeTransaction', xml);
  const filed = tag('periodOfReport', xml);
  const tenb5one = /<aff10b5One>\s*(?:1|true)\s*<\/aff10b5One>/i.test(xml);

  const blocks: Array<{ block: string; derivative: boolean }> = [];
  for (const match of xml.matchAll(/<nonDerivativeTransaction[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) {
    blocks.push({ block: match[1], derivative: false });
  }
  for (const match of xml.matchAll(/<derivativeTransaction[^>]*>([\s\S]*?)<\/derivativeTransaction>/gi)) {
    blocks.push({ block: match[1], derivative: true });
  }

  const transactions: OsintTransaction[] = blocks
    .map(({ block, derivative }) => {
      // Form 4 nests each field differently (transactionDate and transactionCoding sit beside
      // transactionAmounts, ownershipNature wraps its own values), so every field is read
      // recursively from the transaction block rather than from a guessed wrapper.
      return {
        accession,
        owner,
        roleBits: roleBits || 0,
        title,
        filed: filed.slice(0, 10),
        traded: valueOf(block, 'transactionDate'),
        code: tag('transactionCode', block),
        shares: numberOf(valueOf(block, 'transactionShares')),
        price: numberOf(valueOf(block, 'transactionPricePerShare')),
        after: numberOf(valueOf(block, 'sharesOwnedFollowingTransaction')),
        ownership: valueOf(block, 'directOrIndirectOwnership') || 'D',
        nature: valueOf(block, 'natureOfOwnership'),
        security: tag('securityTitle', block),
        derivative,
        tenb5one,
        url,
      };
    })
    .filter((item) => item.traded || item.code || item.shares >= 0);

  return {
    row: {
      id: accession,
      owner,
      roleBits: roleBits || 0,
      title,
      filed,
      traded: valueOf(transaction, 'transactionDate'),
      code: tag('transactionCode', transaction),
      shares: numberOf(valueOf(transaction, 'transactionShares')),
      price: numberOf(valueOf(transaction, 'transactionPricePerShare')),
      after: numberOf(valueOf(transaction, 'sharesOwnedFollowingTransaction')),
      ownership: valueOf(transaction, 'directOrIndirectOwnership') || 'D',
      url,
    },
    transactions,
  };
}

export async function fetchInsiders(cik: string): Promise<OsintInsiderResponse> {
  const filer: GaBankFiler = GA_BANK_FILERS.find((entry) => entry.cik === cik) ?? GA_BANK_FILERS[0];
  const cached = insiderCache.get(filer.cik);
  const base = {
    issuer: {
      key: filer.key,
      name: filer.name,
      cik: filer.cik,
      ticker: filer.ticker,
      bank: filer.bank,
      city: filer.city,
      scope: filer.scope,
    },
    cacheSeconds: INSIDER_TTL_MS / 1000,
  };
  if (cached && Date.now() - cached.at < INSIDER_TTL_MS) return cached.response;

  try {
    const padded = filer.cik.padStart(10, '0');
    const submissions = JSON.parse(
      await getText(`https://data.sec.gov/submissions/CIK${padded}.json`, 14_000),
    ) as {
      filings?: {
        recent?: {
          form?: string[];
          accessionNumber?: string[];
          filingDate?: string[];
          primaryDocument?: string[];
        };
      };
    };
    const recent = submissions.filings?.recent ?? {};
    const forms = recent.form ?? [];
    const accessions = recent.accessionNumber ?? [];
    const dates = recent.filingDate ?? [];
    const docs = recent.primaryDocument ?? [];
    const picks: Array<{ accession: string; document: string; filed: string }> = [];
    for (let i = 0; i < forms.length && picks.length < 24; i += 1) {
      if (forms[i] !== '4') continue;
      const accession = accessions[i] ?? '';
      const document = (docs[i] ?? '').replace(/^[^/]+\//, '');
      if (!accession || !document) continue;
      picks.push({ accession, document, filed: dates[i] ?? '' });
    }

    const rows: OsintFilingRow[] = [];
    const lines: OsintTransaction[] = [];
    const concurrency = 6;
    for (let i = 0; i < picks.length; i += concurrency) {
      const slice = picks.slice(i, i + concurrency);
      const parsed = await Promise.all(
        slice.map(async (pick) => {
          const url = `https://www.sec.gov/Archives/edgar/data/${Number(filer.cik)}/${pick.accession.replace(
            /-/g,
            '',
          )}/${pick.document}`;
          try {
            const xml = await getText(url, 12_000);
            const detail = parseForm4(xml, url, pick.accession);
            if (!detail) return null;
            const row = detail.row;
            if (!row.filed) row.filed = pick.filed;
            if (row.filed) row.filed = row.filed.slice(0, 10);
            lines.push(...detail.transactions);
            return row;
          } catch {
            return null;
          }
        }),
      );
      rows.push(...parsed.filter((row): row is OsintFilingRow => row !== null));
    }

    const response: OsintInsiderResponse = {
      ok: rows.length > 0,
      ...base,
      fetchedAt: new Date().toISOString(),
      error: rows.length ? undefined : 'EDGAR returned no parsable Form 4 filings for this company',
      filings: rows.sort((a, b) => b.filed.localeCompare(a.filed)),
      transactions: lines
        .map((line) => (line.filed ? line : { ...line, filed: pickDate(rows, line.accession) }))
        .sort((a, b) => (b.traded || b.filed).localeCompare(a.traded || a.filed)),
      people: new Set(rows.map((row) => row.owner)).size,
    };
    insiderCache.set(filer.cik, { at: Date.now(), response });
    return response;
  } catch (error) {
    const response: OsintInsiderResponse = {
      ok: false,
      ...base,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'EDGAR request failed',
      filings: [],
      transactions: [],
      people: 0,
    };
    insiderCache.set(filer.cik, { at: Date.now() - INSIDER_TTL_MS + 120_000, response });
    return response;
  }
}

export const OSINT_SOURCE_NOTE =
  'SEC EDGAR filings, the Federal Register API, Federal Reserve Board and Department of Justice RSS ' +
  'releases, FDIC press releases and OFAC recent actions; institution universe from the FDIC BankFind ' +
  'institutions API. Every row links to the publisher record it came from.';
