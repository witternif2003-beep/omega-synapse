/**
 * FDIC QUARTERLY FINANCIALS
 *
 * Every active Georgia institution files a quarterly Report of Condition and Income with
 * the FDIC. The BankFind financials API republishes those filings, so the deep-dive panels
 * are built from regulator numbers rather than from any estimate: total assets, deposits,
 * equity, net income, past-due and noncurrent loans, net charge-offs, provisions, brokered
 * deposits, securities, employees and the nonperforming ratio.
 *
 * One request returns the latest quarter for all Georgia charters; a second returns an
 * eight-quarter series for the trend measures. Both are cached for twelve hours, which
 * matches the quarterly filing cadence.
 */

const FDIC_FIN = 'https://api.fdic.gov/banks/financials';

export interface FinQuarter {
  asset: number;
  dep: number;
  eq: number;
  netinc: number;
  roa: number;
  roe: number;
  p3: number;
  p9: number;
  ncln: number;
  nclnr: number;
  ntln: number;
  ntlnr: number;
  bro: number;
  scaf: number;
  scaffr: number;
  numemp: number;
  lnlsnet: number;
  elnatr: number;
  nperfv: number;
}

export interface GaFinancial {
  cert: string;
  latest: FinQuarter;
  /** Quarter-end dates, oldest first. */
  quarters: string[];
  asset: number[];
  dep: number[];
  eq: number[];
  netinc: number[];
  roa: number[];
  nclnr: number[];
}

export interface PeerMedians {
  count: number;
  roa: number;
  roe: number;
  nclnr: number;
  ntlnr: number;
  equityRatio: number;
  brokeredRatio: number;
  loanDeposit: number;
  nonperform: number;
}

export interface GaFinancialPayload {
  ok: boolean;
  retrieved: string;
  quarter: string;
  peer: PeerMedians | null;
  institutions: Record<string, GaFinancial>;
  error?: string;
  note: string;
}

const LATEST_FIELDS = [
  'CERT',
  'REPDTE',
  'ASSET',
  'DEP',
  'EQ',
  'NETINC',
  'ROA',
  'ROE',
  'P3ASSET',
  'P9ASSET',
  'NCLNLS',
  'NCLNLSR',
  'NTLNLS',
  'NTLNLSR',
  'BRO',
  'SCAF',
  'SCAFR',
  'NUMEMP',
  'LNLSNET',
  'ELNATR',
  'NPERFV',
].join(',');

const SERIES_FIELDS = 'CERT,REPDTE,ASSET,DEP,EQ,NETINC,ROA,NCLNLSR';

export const FINANCIAL_NOTE =
  'FDIC BankFind financials API (Reports of Condition and Income, all active Georgia charters). ' +
  'Dollar figures are thousands of US dollars as filed with the FDIC.';

const TTL_MS = 12 * 3_600_000;
let cache: { at: number; payload: GaFinancialPayload } | null = null;

async function fdicJson(query: string): Promise<unknown> {
  // The BankFind API answers 429 when a burst arrives, so the request is retried twice with
  // a short backoff before the panel reports the source as unavailable.
  let lastError = 'FDIC financials unavailable';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    const response = await fetch(`${FDIC_FIN}?${query}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'OmegaProtocolDashboard/1.0 (research)' },
    });
    if (response.ok) return response.json();
    lastError = `FDIC financials HTTP ${response.status}`;
    if (response.status !== 429 && response.status < 500) break;
  }
  throw new Error(lastError);
}

interface FdicRow {
  data?: Record<string, unknown>;
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  const list = (payload as { data?: FdicRow[] })?.data ?? [];
  return list.map((row) => row?.data ?? {}).filter((row) => row && row.CERT);
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const quarterOf = (value: unknown): string => String(value ?? '').slice(0, 8);

function toQuarter(row: Record<string, unknown>): FinQuarter {
  return {
    asset: num(row.ASSET),
    dep: num(row.DEP),
    eq: num(row.EQ),
    netinc: num(row.NETINC),
    roa: num(row.ROA),
    roe: num(row.ROE),
    p3: num(row.P3ASSET),
    p9: num(row.P9ASSET),
    ncln: num(row.NCLNLS),
    nclnr: num(row.NCLNLSR),
    ntln: num(row.NTLNLS),
    ntlnr: num(row.NTLNLSR),
    bro: num(row.BRO),
    scaf: num(row.SCAF),
    scaffr: num(row.SCAFR),
    numemp: num(row.NUMEMP),
    lnlsnet: num(row.LNLSNET),
    elnatr: num(row.ELNATR),
    nperfv: num(row.NPERFV),
  };
}

function median(values: number[]): number {
  const clean = values.filter((value) => Number.isFinite(value) && value !== 0);
  if (!clean.length) return 0;
  const sorted = [...clean].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function peersOf(institutions: Record<string, GaFinancial>): PeerMedians {
  const list = Object.values(institutions);
  const ratios = (pick: (row: GaFinancial) => number) => list.map(pick);
  return {
    count: list.length,
    roa: median(ratios((row) => row.latest.roa)),
    roe: median(ratios((row) => row.latest.roe)),
    nclnr: median(ratios((row) => row.latest.nclnr)),
    ntlnr: median(ratios((row) => row.latest.ntlnr)),
    equityRatio: median(ratios((row) => (row.latest.asset ? (row.latest.eq / row.latest.asset) * 100 : 0))),
    brokeredRatio: median(ratios((row) => (row.latest.dep ? (row.latest.bro / row.latest.dep) * 100 : 0))),
    loanDeposit: median(ratios((row) => (row.latest.dep ? (row.latest.lnlsnet / row.latest.dep) * 100 : 0))),
    nonperform: median(ratios((row) => row.latest.nperfv)),
  };
}

export async function fetchGeorgiaFinancials(): Promise<GaFinancialPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.payload;
  try {
    const latestRows = rowsOf(
      await fdicJson(
        `filters=${encodeURIComponent('STALP:GA AND ACTIVE:1')}&fields=${LATEST_FIELDS}` +
          `&sort_by=REPDTE&sort_order=DESC&limit=200&format=json`,
      ),
    );
    if (!latestRows.length) throw new Error('FDIC financials returned no Georgia rows');
    const newest = latestRows.reduce((max, row) => {
      const quarter = quarterOf(row.REPDTE);
      return quarter > max ? quarter : max;
    }, '');
    const current = latestRows.filter((row) => quarterOf(row.REPDTE) === newest);

    const institutions: Record<string, GaFinancial> = {};
    for (const row of current) {
      const cert = String(row.CERT ?? '');
      if (!cert) continue;
      institutions[cert] = {
        cert,
        latest: toQuarter(row),
        quarters: [newest],
        asset: [num(row.ASSET)],
        dep: [num(row.DEP)],
        eq: [num(row.EQ)],
        netinc: [num(row.NETINC)],
        roa: [num(row.ROA)],
        nclnr: [num(row.NCLNLSR)],
      };
    }

    // Eight-quarter series for the trend measures (the FDIC publishes quarterly, so a
    // two-year window is the longest span the panel can show without a longer query).
    const start = `${Number(newest.slice(0, 4)) - 2}0101`;
    let seriesRows: Record<string, unknown>[] = [];
    try {
      seriesRows = rowsOf(
        await fdicJson(
          `filters=${encodeURIComponent(`STALP:GA AND REPDTE:[${start} TO ${newest}]`)}` +
            `&fields=${SERIES_FIELDS}&limit=4000&format=json`,
        ),
      );
    } catch {
      // A failed trend request still leaves the latest quarter usable, so the dossier keeps
      // the current figures and reports a one-column series rather than nothing at all.
      seriesRows = [];
    }
    const byQuarter = new Map<string, Map<string, Record<string, unknown>>>();
    for (const row of seriesRows) {
      const quarter = quarterOf(row.REPDTE);
      if (quarter > newest) continue;
      const cert = String(row.CERT ?? '');
      if (!institutions[cert]) continue;
      if (!byQuarter.has(cert)) byQuarter.set(cert, new Map());
      byQuarter.get(cert)!.set(quarter, row);
    }
    for (const [cert, quarters] of byQuarter) {
      const target = institutions[cert];
      const dates = [...quarters.keys()].sort().slice(-8);
      target.quarters = dates;
      target.asset = dates.map((date) => num(quarters.get(date)?.ASSET));
      target.dep = dates.map((date) => num(quarters.get(date)?.DEP));
      target.eq = dates.map((date) => num(quarters.get(date)?.EQ));
      target.netinc = dates.map((date) => num(quarters.get(date)?.NETINC));
      target.roa = dates.map((date) => num(quarters.get(date)?.ROA));
      target.nclnr = dates.map((date) => num(quarters.get(date)?.NCLNLSR));
    }

    const payload: GaFinancialPayload = {
      ok: true,
      retrieved: new Date().toISOString().slice(0, 10),
      quarter: newest,
      peer: peersOf(institutions),
      institutions,
      note: FINANCIAL_NOTE,
    };
    cache = { at: Date.now(), payload };
    return payload;
  } catch (error) {
    if (cache) return cache.payload;
    return {
      ok: false,
      retrieved: new Date().toISOString().slice(0, 10),
      quarter: '',
      peer: null,
      institutions: {},
      error: error instanceof Error ? error.message : 'FDIC financials unavailable',
      note: FINANCIAL_NOTE,
    };
  }
}
