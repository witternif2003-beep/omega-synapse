/**
 * LIVE OSINT FEED - SOURCE READERS
 *
 * The server half of the espionage tab: published records are fetched from external
 * publishers, normalised, and matched to Georgia financial institutions. It never invents
 * an event: if a publisher cannot be reached the source is reported as unreachable and
 * contributes nothing.
 */

import {
  FDIC_GEORGIA_SNAPSHOT,
  FDIC_SNAPSHOT_SOURCE,
  type FdicInstitutionRow,
} from '../data/fdicGeorgiaInstitutions.ts';
import { GA_BANK_FILERS, type GaBankFiler } from '../data/gaBankFilers.ts';

const USER_AGENT = 'OmegaProtocolDashboard/1.0 (research; contact omega@example.org)';

export type OsintKind =
  | 'insider'
  | 'filing'
  | 'regulatory'
  | 'enforcement'
  | 'sanctions'
  | 'litigation'
  | 'press';

export type OsintSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface OsintItem {
  id: string;
  sourceId: string;
  publisher: string;
  kind: OsintKind;
  title: string;
  summary: string;
  url: string;
  published: string;
  severity: OsintSeverity;
  /** Published institution names this item names, up to three. */
  institutions: string[];
  /** People named by the publisher in the item itself. */
  people: string[];
  /** True when the publication is a regulator/sanctions action that is not bank-specific. */
  sector: boolean;
  /** SEC company CIK when the item comes from an EDGAR filing. */
  cik?: string;
  /** EDGAR accession number when the item comes from a filing. */
  accession?: string;
  /** EDGAR primary document for the filing. */
  document?: string;
}

export interface OsintSourceReport {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface OsintFeed {
  generatedAt: string;
  coverage: {
    institutions: number;
    source: string;
    retrieved: string;
    filers: number;
    georgiaFilers: number;
  };
  sources: OsintSourceReport[];
  items: OsintItem[];
  institutions: GeorgiaInstitution[];
}

export async function getText(url: string, timeoutMs = 12_000): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, text/html;q=0.8',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export const decode = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tag = (name: string, block: string): string => {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : '';
};

export const attr = (name: string, block: string): string => {
  const match = block.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? decode(match[1]) : '';
};

export const toIso = (value: string): string => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
};

export const hash = (value: string): string => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

export interface GeorgiaInstitution {
  name: string;
  city: string;
  cert: string;
  holdingCompany: string;
  assetsThousands: number;
}

export const norm = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[.,'’]/g, ' ')
    .replace(/\b(NATIONAL ASSOCIATION|N A|NA|INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|THE|F S B|FSB|S S B|SSB|L P|LP|LTD)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let institutionCache: { at: number; rows: GeorgiaInstitution[]; source: string; retrieved: string } | null = null;

function snapshotInstitutions(): GeorgiaInstitution[] {
  return FDIC_GEORGIA_SNAPSHOT.map((row: FdicInstitutionRow) => ({
    name: row[0],
    city: row[1],
    cert: row[2],
    holdingCompany: row[3],
    assetsThousands: row[4],
  }));
}

export async function georgiaInstitutions(): Promise<{
  rows: GeorgiaInstitution[];
  source: string;
  retrieved: string;
}> {
  const now = Date.now();
  if (institutionCache && now - institutionCache.at < 6 * 3_600_000) {
    return institutionCache;
  }
  const snapshot = {
    rows: snapshotInstitutions(),
    source: `${FDIC_SNAPSHOT_SOURCE.dataset} snapshot (${FDIC_SNAPSHOT_SOURCE.filters})`,
    retrieved: FDIC_SNAPSHOT_SOURCE.retrieved,
  };
  try {
    const url =
      'https://api.fdic.gov/banks/institutions?filters=STALP:GA%20AND%20ACTIVE:1' +
      '&fields=NAME,CITY,CERT,NAMEHCR,ASSET&limit=1000&format=json';
    const body = JSON.parse(await getText(url, 14_000)) as {
      data?: Array<{ data?: Record<string, unknown> }>;
    };
    const rows: GeorgiaInstitution[] = (body.data ?? [])
      .map((entry) => entry.data ?? {})
      .map((row) => ({
        name: String(row.NAME ?? '').trim(),
        city: String(row.CITY ?? '').trim(),
        cert: String(row.CERT ?? '').trim(),
        holdingCompany: String(row.NAMEHCR ?? '').trim(),
        assetsThousands: Number(row.ASSET ?? 0),
      }))
      .filter((row) => row.name);
    if (rows.length < 20) throw new Error(`only ${rows.length} institutions returned`);
    const live = {
      rows,
      source: 'FDIC BankFind institutions API (STALP:GA AND ACTIVE:1)',
      retrieved: new Date().toISOString().slice(0, 10),
    };
    institutionCache = { at: now, ...live };
    return live;
  } catch {
    institutionCache = { at: now - 5.5 * 3_600_000, ...snapshot };
    return snapshot;
  }
}

export interface Matcher {
  phrase: string;
  name: string;
  bank: string;
}

export function buildMatchers(rows: GeorgiaInstitution[]): Matcher[] {
  const seen = new Set<string>();
  const matchers: Matcher[] = [];
  const push = (value: string, name: string, bank: string) => {
    const phrase = norm(value);
    if (phrase.length < 5) return;
    const key = `${phrase}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    matchers.push({ phrase: ` ${phrase} `, name, bank });
  };
  for (const row of rows) {
    push(row.name, row.name, row.name);
    if (row.holdingCompany) push(row.holdingCompany, row.name, row.name);
  }
  for (const filer of GA_BANK_FILERS) {
    push(filer.name, filer.bank || filer.name, filer.bank);
    if (filer.bank) push(filer.bank, filer.bank, filer.bank);
    if (filer.holdingCompany) push(filer.holdingCompany, filer.bank || filer.name, filer.bank);
  }
  return matchers.sort((a, b) => b.phrase.length - a.phrase.length);
}

export function attribute(text: string, matchers: Matcher[], limit = 3): string[] {
  const haystack = ` ${norm(text)} `;
  const hits: string[] = [];
  for (const matcher of matchers) {
    if (haystack.includes(matcher.phrase) && !hits.includes(matcher.bank)) {
      hits.push(matcher.bank || matcher.name);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

interface SecEntry {
  cik: string;
  title: string;
  url: string;
  updated: string;
  form: string;
  company: string;
  person: string;
}

export function parseEdgarAtom(xml: string): SecEntry[] {
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  const out: SecEntry[] = [];
  for (const raw of entries) {
    const block = raw.split(/<\/entry>/i)[0] ?? '';
    const title = tag('title', block);
    const link = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? '';
    const updated = toIso(tag('updated', block));
    const formMatch = /^([0-9A-Za-z-]+)\s*-\s*(.*)$/.exec(title);
    const rest = formMatch?.[2] ?? title;
    const cikMatch = /\((\d{6,10})\)/.exec(title);
    const person = (rest.split('(')[0] ?? '').trim();
    out.push({
      cik: cikMatch ? String(Number(cikMatch[1])) : '',
      title,
      url: link.startsWith('http') ? link : `https://www.sec.gov${link}`,
      updated,
      form: formMatch?.[1] ?? '',
      company: rest,
      person,
    });
  }
  return out;
}

export interface FilerFiling {
  filer: GaBankFiler;
  form: string;
  accession: string;
  document: string;
  filed: string;
  url: string;
}

export async function mapLimit<T, R>(input: T[], limit: number, run: (value: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(input.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), input.length) }, async () => {
    while (cursor < input.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await run(input[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Form 4 and 8-K filings from the last SEC_WINDOW_DAYS for one Georgia bank company. */
export const SEC_WINDOW_DAYS = 45;

export async function filingsForFiler(filer: GaBankFiler): Promise<FilerFiling[]> {
  const padded = filer.cik.padStart(10, '0');
  const body = JSON.parse(
    await getText(`https://data.sec.gov/submissions/CIK${padded}.json`, 12_000),
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
  const recent = body.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const accessions = recent.accessionNumber ?? [];
  const dates = recent.filingDate ?? [];
  const docs = recent.primaryDocument ?? [];
  const cutoff = Date.now() - SEC_WINDOW_DAYS * 86_400_000;
  const out: FilerFiling[] = [];
  for (let i = 0; i < forms.length && out.length < 8; i += 1) {
    const form = forms[i] ?? '';
    if (!/^(4|8-K|10-Q|10-K)$/.test(form)) continue;
    const filed = dates[i] ?? '';
    if (!filed || Date.parse(`${filed}T00:00:00Z`) < cutoff) continue;
    const accession = accessions[i] ?? '';
    if (!accession) continue;
    out.push({
      filer,
      form,
      accession,
      document: docs[i] ?? '',
      filed,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(filer.cik)}/${accession.replace(/-/g, '')}/`,
    });
  }
  return out;
}

export function secItem(filing: FilerFiling): OsintItem {
  const { filer, form } = filing;
  const isForm4 = form === '4';
  const bank = filer.bank || filer.name;
  return {
    id: `sec-${hash(`${form}:${filing.accession}`)}`,
    sourceId: isForm4 ? 'sec-form4' : 'sec-8k',
    publisher: 'U.S. Securities and Exchange Commission, EDGAR',
    kind: isForm4 ? 'insider' : 'filing',
    title: isForm4
      ? `Form 4 insider filing — ${filer.name}${filer.ticker ? ` (${filer.ticker})` : ''}`
      : `${filer.name}${filer.ticker ? ` (${filer.ticker})` : ''} filed Form ${form}`,
    summary:
      `${filer.name}${filer.city ? `, ${filer.city}` : ''}${
        filer.scope === 'GEORGIA' ? ' is a Georgia-domiciled bank holding company' : ' operates Georgia branches'
      }. Its bank ${bank} appears in the FDIC Georgia institution list. Filed ${filing.filed}; ` +
      'open the EDGAR record to read the filing itself. The reporting person is shown from the filing document.',
    url: filing.url,
    published: `${filing.filed}T12:00:00.000Z`,
    severity: isForm4 ? 'medium' : 'high',
    institutions: [bank],
    people: [],
    sector: false,
    cik: filer.cik,
    accession: filing.accession,
    document: filing.document,
  };
}
