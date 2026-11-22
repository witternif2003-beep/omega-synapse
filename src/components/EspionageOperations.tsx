import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Download,
  Info,
  Landmark,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react';
import { FINANCIAL_SOURCE } from '../data/georgiaFinancialInstitutions.ts';
import { GA_BANK_FILERS, GA_BANK_FILER_SOURCE } from '../data/gaBankFilers.ts';
import {
  individualIndicators,
  institutionForBank,
  money,
  roleClass,
  roleText,
  type IndicatorRow,
  type PersonView,
} from '../lib/financialIndicators.ts';
import {
  ANOMALY_CLASSES,
  PRIORITY_COLOR,
  classifyAnomaly,
  priorityBand,
  priorityScore,
  type PriorityBand,
} from '../lib/sourcedAnomaly.ts';
import { publishAnomalyBeacon, BEACON_TTL_MS } from '../lib/anomalyBeacon.ts';
import {
  KIND_COLOR,
  KIND_LABEL,
  filingFromLive,
  indicatorsForItem,
  institutionByName,
  loadFeed,
  loadFilingDetail,
  loadInsiders,
  relativeTime,
  type GeorgiaInstitution,
  type OsintFilingDetailPayload,
  type OsintFeedPayload,
  type OsintFilingRow,
  type OsintInsiderPayload,
  type OsintItem,
} from '../lib/osintClient.ts';

/**
 * ESPIONAGE OPERATIONS - LIVE OSINT STREAM
 *
 * Every row is a record published by an external source: an SEC EDGAR filing, a Federal
 * Register document, a Federal Reserve or Justice Department release, an FDIC press
 * release, or an OFAC action. The feed is fetched from the server, which fetched it from
 * those publishers; nothing is seeded in the browser.
 *
 * Opening a row shows the detail page for that record: the publisher, timestamp, source
 * link, the institutions the record names, the individuals it names, and the twenty
 * financial-forensic indicators computed for that record - from the institution's FDIC
 * figures when a bank is named, and from statewide FDIC totals when the record is a
 * regulator or sanctions action that names no single bank.
 *
 * Individuals come from their own SEC Form 4 filings, fetched live for all 27 Georgia
 * bank companies and cached on the server for one week. A person is labelled issuer
 * employee (officer), non-employee director, non-employee owner, or other reporting
 * person, because that is what the filing reports. Contractor status is not a field in
 * any SEC or FDIC publication, so no contractor label is claimed.
 *
 * No account number, login, credential, MAC address or IP address appears anywhere: no
 * public record publishes one for these banks or people, and inventing one would be
 * fabrication.
 */

interface FeedRowProps {
  item: OsintItem;
  index: number;
  expanded: boolean;
  onToggle: (id: string) => void;
}

const TONE_COLOR: Record<string, string> = {
  risk: '#f44336',
  watch: '#ffb300',
  steady: '#00e676',
  plain: '#4b5563',
};

function IndicatorGrid({ rows, caption }: { rows: IndicatorRow[]; caption: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-widest text-emerald-300">
          // 20-point financial forensic indicators
        </span>
        <span className="text-[9px] text-zinc-600">{caption}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5 min-w-0">
            <div
              className="text-[8.5px] uppercase tracking-wider text-zinc-500 leading-tight truncate"
              title={row.label}
            >
              {row.label}
            </div>
            <div className="text-[11px] font-bold text-zinc-100 tabular-nums break-words">{row.value}</div>
            <div className="mt-1 h-[2px] w-full bg-zinc-800 rounded overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: row.tone === 'plain' ? '12%' : '72%',
                  backgroundColor: TONE_COLOR[row.tone] ?? '#4b5563',
                }}
              />
            </div>
            <div className="mt-0.5 text-[8px] text-zinc-600 leading-tight line-clamp-2" title={row.basis}>
              {row.basis}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilingDetail({ item }: { item: OsintItem }) {
  const [state, setState] = useState<OsintFilingDetailPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!item.cik || !item.accession) return;
    loadFilingDetail(item.cik, item.accession, item.document ?? '')
      .then((payload) => {
        if (!cancelled) setState(payload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.cik, item.accession, item.document]);

  if (!item.cik || !item.accession) return null;

  return (
    <div className="border border-cyan-500/30 bg-cyan-950/10 rounded px-2 py-1.5 space-y-1">
      <div className="text-[9px] uppercase tracking-widest text-cyan-300">Reporting person named in the filing</div>
      {state?.filing ? (
        <>
          <div className="text-[11px] text-white font-bold">{state.filing.owner}</div>
          <div className="text-[9.5px] text-zinc-400">
            {roleText(state.filing.roleBits, state.filing.title)} · {roleClass(state.filing.roleBits)} ·
            filed {state.filing.filed || 'date not reported'}
          </div>
          <div className="text-[9px] text-zinc-500">
            {state.filing.code ? `code ${state.filing.code}` : 'no transaction code'} ·{' '}
            {state.filing.shares > 0 ? `${state.filing.shares.toLocaleString()} shares` : 'shares not reported'}
            {state.filing.price > 0 ? ` at $${state.filing.price.toFixed(2)}` : ''} ·{' '}
            {state.filing.ownership === 'I' ? 'indirect holding' : 'direct holding'}
          </div>
        </>
      ) : failed ? (
        <div className="text-[9.5px] text-amber-300">
          The filing document could not be read just now. Open the EDGAR record below to read it at the source.
        </div>
      ) : (
        <div className="text-[9.5px] text-zinc-500">Reading the filing document from EDGAR…</div>
      )}
    </div>
  );
}

const FeedRow = memo(function FeedRow({ item, index, expanded, onToggle }: FeedRowProps) {
  const institution = item.institutions.length ? institutionByName(item.institutions[0]) : null;
  const family = classifyAnomaly(`${item.title} ${item.summary}`);
  const score = priorityScore(item.severity, item.published, institution);
  const band = priorityBand(score);
  const detail = useMemo(() => (expanded ? indicatorsForItem(item) : null), [expanded, item]);
  const secondsLeft = Math.max(
    0,
    Math.round((Date.parse(item.published) + BEACON_TTL_MS - Date.now()) / 1000),
  );

  return (
    <div className="border-t border-zinc-900">
      <button
        onClick={() => onToggle(item.id)}
        className="w-full text-left px-2 py-1.5 flex items-start gap-2 hover:bg-white/[0.03] cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="text-[9px] text-zinc-600 tabular-nums w-6 shrink-0 pt-0.5">{index + 1}</span>
        <span
          className="text-[8px] font-bold px-1.5 py-[1px] rounded shrink-0 border mt-0.5"
          style={{ borderColor: KIND_COLOR[item.kind], color: KIND_COLOR[item.kind] }}
        >
          {KIND_LABEL[item.kind].toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-zinc-200 leading-snug">{item.title}</span>
          <span className="block text-[9px] text-zinc-500 mt-0.5 truncate">
            {family.label} · {item.publisher} · {relativeTime(item.published)} ·{' '}
            {item.institutions.length ? item.institutions.join(' / ') : 'statewide, no single bank named'}
            {secondsLeft > 0 && item.institutions.length ? ' · strobe active' : ''}
          </span>
        </span>
        <span
          className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0 border mt-0.5"
          style={{ borderColor: PRIORITY_COLOR[band as PriorityBand], color: PRIORITY_COLOR[band as PriorityBand] }}
        >
          {band}
        </span>
        <ChevronDown
          size={12}
          className={`text-zinc-500 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && detail && (
        <div className="px-3 pb-3 space-y-2.5 border-l-2 border-emerald-700/50 ml-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-zinc-500 pt-1">
            <span className="text-emerald-300">SOURCE RECORD</span>
            <span>{item.publisher}</span>
            <span>published {new Date(item.published).toISOString().slice(0, 16).replace('T', ' ')}Z</span>
            <span>priority {score}</span>
            {item.accession && <span>accession {item.accession}</span>}
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-300 underline decoration-dotted"
            >
              open the source record <ArrowUpRight size={10} />
            </a>
          </div>

          {item.summary && <p className="text-[10px] text-zinc-400 leading-relaxed">{item.summary}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border border-zinc-800 rounded px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1">
                <Landmark size={10} /> Institutions named by the record
              </div>
              {item.institutions.length ? (
                <div className="space-y-1">
                  {item.institutions.map((name) => {
                    const inst = institutionByName(name);
                    return (
                      <div key={name} className="text-[10px] text-zinc-300">
                        {name}
                        <span className="block text-[9px] text-zinc-600">
                          {inst
                            ? `${inst.branches} GA branches · ${money(inst.depositsUsd)} in GA branch deposits · ${inst.countyCount} counties (FDIC SOD ${FINANCIAL_SOURCE.surveyYear})`
                            : 'FDIC institution; Georgia branch figures not in the Summary of Deposits response'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[9.5px] text-zinc-500">
                  This publication names no single Georgia bank, so it is shown as a statewide
                  regulator/sanctions record rather than attributed to one institution.
                </div>
              )}
            </div>

            <div className="border border-zinc-800 rounded px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1">
                <Users size={10} /> Individuals
              </div>
              {item.people.length > 0 ? (
                <div className="text-[10px] text-zinc-300">{item.people.join(', ')}</div>
              ) : (
                <div className="text-[9.5px] text-zinc-500">
                  {item.kind === 'insider' || item.kind === 'filing'
                    ? 'The reporting person is read from the filing document below.'
                    : 'The publisher names no individual in this record.'}
                </div>
              )}
              <FilingDetail item={item} />
            </div>
          </div>

          <IndicatorGrid
            rows={detail.rows}
            caption={
              detail.scope === 'institution'
                ? `derived from FDIC Summary of Deposits ${FINANCIAL_SOURCE.surveyYear} figures for ${detail.institution?.name}`
                : `derived from statewide FDIC Summary of Deposits ${FINANCIAL_SOURCE.surveyYear} totals — no single bank is named`
            }
          />
        </div>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* individuals                                                                 */
/* -------------------------------------------------------------------------- */

function peopleFromLive(data: OsintInsiderPayload): {
  people: PersonView[];
  filings: ReturnType<typeof filingFromLive>[];
} {
  const filings = data.filings.map((row: OsintFilingRow) => filingFromLive(row, data.issuer));
  const grouped = new Map<string, typeof filings>();
  for (const filing of filings) {
    const list = grouped.get(filing.owner) ?? [];
    list.push(filing);
    grouped.set(filing.owner, list);
  }
  const institution = institutionForBank(data.issuer.bank);
  const people: PersonView[] = [];
  for (const [owner, list] of grouped) {
    const sorted = [...list].sort((a, b) => b.filed.localeCompare(a.filed));
    const latest = sorted[0];
    people.push({
      key: `${data.issuer.key}:${owner}`,
      owner,
      issuerKey: data.issuer.key,
      issuerName: data.issuer.name,
      bank: data.issuer.bank,
      role: roleText(latest.roleBits, latest.title),
      roleClass: roleClass(latest.roleBits),
      filings: sorted,
      latest,
      institution,
    });
  }
  return { people: people.sort((a, b) => b.latest.filed.localeCompare(a.latest.filed)), filings };
}

type RoleFilter = 'ALL' | 'EMPLOYEE' | 'DIRECTOR' | 'OWNER' | 'OTHER';

function IndividualsPanel() {
  const [cik, setCik] = useState(GA_BANK_FILERS[0]?.cik ?? '');
  const [data, setData] = useState<OsintInsiderPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');

  const load = useCallback((target: string) => {
    setState('loading');
    loadInsiders(target)
      .then((payload) => {
        setData(payload);
        setState('ready');
        const first = payload.filings[0]?.owner ?? '';
        setSelected((current) =>
          payload.filings.some((row) => row.owner === current) ? current : first,
        );
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    if (cik) load(cik);
  }, [cik, load]);

  const { people, filings } = useMemo(
    () =>
      data
        ? peopleFromLive(data)
        : { people: [] as PersonView[], filings: [] as ReturnType<typeof filingFromLive>[] },
    [data],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      if (roleFilter === 'EMPLOYEE' && person.roleClass !== 'ISSUER EMPLOYEE') return false;
      if (roleFilter === 'DIRECTOR' && person.roleClass !== 'NON-EMPLOYEE DIRECTOR') return false;
      if (roleFilter === 'OWNER' && person.roleClass !== 'NON-EMPLOYEE OWNER') return false;
      if (roleFilter === 'OTHER' && person.roleClass !== 'REPORTING PERSON') return false;
      if (!needle) return true;
      return `${person.owner} ${person.role} ${person.roleClass}`.toLowerCase().includes(needle);
    });
  }, [people, query, roleFilter]);

  const person = useMemo(
    () => people.find((entry) => entry.key === selected) ?? people[0] ?? null,
    [people, selected],
  );
  const indicators = useMemo(
    () => (person ? individualIndicators(person, filings) : []),
    [person, filings],
  );

  const counts = useMemo(() => {
    const tally = { employee: 0, director: 0, owner: 0, other: 0 };
    for (const entry of people) {
      if (entry.roleClass === 'ISSUER EMPLOYEE') tally.employee += 1;
      else if (entry.roleClass === 'NON-EMPLOYEE DIRECTOR') tally.director += 1;
      else if (entry.roleClass === 'NON-EMPLOYEE OWNER') tally.owner += 1;
      else tally.other += 1;
    }
    return tally;
  }, [people]);

  return (
    <div className="border border-zinc-800 rounded bg-[#070f12]">
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
          <UserRound size={12} /> Individuals at Georgia bank companies
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cik}
            onChange={(event) => setCik(event.target.value)}
            className="bg-black/60 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-emerald-500 max-w-[280px]"
            aria-label="Choose a Georgia bank company"
          >
            <optgroup label="Georgia-domiciled bank holding companies">
              {GA_BANK_FILERS.filter((filer) => filer.scope === 'GEORGIA').map((filer) => (
                <option key={filer.cik} value={filer.cik}>
                  {filer.name} — {filer.bank}
                </option>
              ))}
            </optgroup>
            <optgroup label="Operate Georgia branches (domiciled elsewhere)">
              {GA_BANK_FILERS.filter((filer) => filer.scope === 'OPERATES_IN_GEORGIA').map((filer) => (
                <option key={filer.cik} value={filer.cik}>
                  {filer.name} — {filer.bank}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            onClick={() => cik && load(cik)}
            className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
          >
            <RefreshCw size={10} /> refresh
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-zinc-800 flex flex-wrap items-center gap-1.5 text-[9px] text-zinc-500">
        <span className="text-emerald-300">{data?.issuer.name ?? '—'}</span>
        {data?.issuer.ticker && <span>{data.issuer.ticker}</span>}
        <span>CIK {data?.issuer.cik ?? '—'}</span>
        <span>{data?.issuer.bank}</span>
        <span className="text-zinc-600">
          {data?.ok
            ? `${data.filings.length} Form 4 filings · ${data.people} people · refreshed ${relativeTime(data.fetchedAt)} · cached weekly`
            : state === 'error'
              ? 'EDGAR could not be reached; nothing is shown rather than a stale or invented roster'
              : data?.error ?? 'reading EDGAR…'}
        </span>
      </div>

      <div className="px-3 py-1.5 border-b border-zinc-800 flex flex-wrap items-center gap-1.5">
        {[
          { id: 'ALL' as RoleFilter, label: `ALL (${people.length})` },
          { id: 'EMPLOYEE' as RoleFilter, label: `EMPLOYEES (${counts.employee})` },
          { id: 'DIRECTOR' as RoleFilter, label: `DIRECTORS (${counts.director})` },
          { id: 'OWNER' as RoleFilter, label: `10% OWNERS (${counts.owner})` },
          { id: 'OTHER' as RoleFilter, label: `OTHER (${counts.other})` },
        ].map((option) => (
          <button
            key={option.id}
            onClick={() => setRoleFilter(option.id)}
            className={`px-2 py-0.5 text-[9.5px] rounded border cursor-pointer ${
              roleFilter === option.id
                ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50'
                : 'border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2 top-1.5 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="name or role"
            className="bg-black/60 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="max-h-[440px] overflow-auto border-b lg:border-b-0 lg:border-r border-zinc-800">
          {state === 'loading' && (
            <div className="px-3 py-4 text-[10px] text-zinc-500">Reading Form 4 filings from EDGAR…</div>
          )}
          {state !== 'loading' && visible.length === 0 && (
            <div className="px-3 py-4 text-[10px] text-zinc-500">
              {data?.ok
                ? 'No person in this company’s filings matches the filter.'
                : 'No filings to show. EDGAR returned nothing for this company.'}
            </div>
          )}
          {visible.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setSelected(entry.key)}
              className={`w-full text-left px-3 py-1.5 border-b border-zinc-900/70 cursor-pointer ${
                entry.key === person?.key ? 'bg-emerald-950/40' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-200 truncate">{entry.owner}</span>
                <span className="text-[9px] text-zinc-500 shrink-0">{entry.latest.filed}</span>
              </div>
              <div className="text-[9px] text-zinc-500 truncate">{entry.role}</div>
              <div className="text-[8.5px] text-zinc-600">
                {entry.roleClass} · {entry.filings.length} filing(s)
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3 min-w-0">
          {person ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500">Individual dossier</div>
                  <div className="text-sm font-bold text-white">{person.owner}</div>
                  <div className="text-[10px] text-zinc-400">
                    {person.role} · {person.issuerName} · {person.bank}
                  </div>
                  <div className="text-[9px] text-zinc-600 flex flex-wrap items-center gap-1.5 mt-0.5">
                    <Building2 size={10} /> {person.roleClass}
                    <span className="px-1.5 py-[1px] border border-zinc-700 rounded">
                      contractor status not published
                    </span>
                  </div>
                </div>
                <a
                  href={person.latest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-950/40"
                >
                  Form 4 filing <ArrowUpRight size={10} />
                </a>
              </div>

              <IndicatorGrid
                rows={indicators}
                caption="each value read from this person's Form 4 fields and the FDIC figures for their bank"
              />

              <div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Filings on record</div>
                <div className="space-y-1">
                  {person.filings.slice(0, 6).map((filing) => (
                    <a
                      key={filing.id}
                      href={filing.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-2 text-[10px] border border-zinc-800 rounded px-2 py-1 hover:border-emerald-600"
                    >
                      <span className="text-zinc-300 truncate">
                        {filing.filed} · {filing.code || 'no code'} ·{' '}
                        {filing.shares > 0 ? `${filing.shares.toLocaleString()} sh` : 'shares not reported'} ·{' '}
                        {filing.ownership === 'I' ? 'indirect' : 'direct'}
                      </span>
                      <ArrowUpRight size={10} className="text-zinc-500 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-[10px] text-zinc-500">
              Choose a company to read its insider filings from EDGAR.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* coverage                                                                    */
/* -------------------------------------------------------------------------- */

function CoveragePanel({ rows }: { rows: GeorgiaInstitution[] }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (!needle) return true;
      return `${row.name} ${row.city} ${row.holdingCompany} ${row.cert}`.toLowerCase().includes(needle);
    });
    return list.sort((a, b) => b.assetsThousands - a.assetsThousands);
  }, [rows, query]);

  return (
    <div className="border border-zinc-800 rounded bg-[#070f12]">
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
          <Landmark size={12} /> Every active Georgia institution — {rows.length} monitored
        </span>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1.5 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="bank, city, certificate or holding company"
            className="bg-black/60 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 w-64"
          />
        </div>
      </div>
      <div className="max-h-[280px] overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#0a1418] text-[8.5px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-1 font-normal">Institution</th>
              <th className="px-2 py-1 font-normal">City</th>
              <th className="px-2 py-1 font-normal">Cert</th>
              <th className="px-2 py-1 font-normal">Holding company (FDIC)</th>
              <th className="px-2 py-1 font-normal text-right">Assets</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.cert}-${row.name}`} className="border-t border-zinc-900/70 text-[10px]">
                <td className="px-3 py-1 text-zinc-200">{row.name}</td>
                <td className="px-2 py-1 text-zinc-500">{row.city || '—'}</td>
                <td className="px-2 py-1 text-zinc-500 tabular-nums">{row.cert || '—'}</td>
                <td className="px-2 py-1 text-zinc-500 truncate max-w-[220px]">{row.holdingCompany || '—'}</td>
                <td className="px-2 py-1 text-zinc-400 tabular-nums text-right">
                  {row.assetsThousands > 0 ? money(row.assetsThousands * 1000) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-[10px] text-zinc-500">No institution matches that search.</div>
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-zinc-800 text-[9px] text-zinc-600">
        Showing {filtered.length} of {rows.length} · FDIC BankFind, filters STALP:GA AND ACTIVE:1 · assets are the
        FDIC total-asset field
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* feed                                                                        */
/* -------------------------------------------------------------------------- */

type SourceFilter = 'ALL' | 'SEC' | 'REGULATOR' | 'DOJ' | 'SANCTIONS';

const SOURCE_GROUPS: Record<SourceFilter, string[]> = {
  ALL: [],
  SEC: ['sec-form4', 'sec-8k'],
  REGULATOR: ['fr-fdic', 'fr-frb', 'fr-occ', 'fr-fincen', 'frb-press', 'fdic-press'],
  DOJ: ['doj-news'],
  SANCTIONS: ['ofac'],
};

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function EspionageOperations() {
  const [feed, setFeed] = useState<OsintFeedPayload | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [query, setQuery] = useState('');
  const [attributedOnly, setAttributedOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  const refresh = useCallback(() => {
    loadFeed()
      .then((payload) => {
        setFeed(payload);
        setState('live');
        setLastRefresh(Date.now());
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // A row that arrived in the last half hour raises a two-minute map beacon.
  useEffect(() => {
    if (!feed) return;
    const cutoff = Date.now() - 30 * 60_000;
    for (const item of feed.items) {
      if (!item.institutions.length) continue;
      if (Date.parse(item.published) < cutoff) continue;
      const inst = institutionByName(item.institutions[0]);
      if (!inst) continue;
      publishAnomalyBeacon({
        id: item.id,
        county: inst.primary.name,
        x: inst.marker.x,
        y: inst.marker.y,
        label: item.title,
        severity: item.severity,
      });
    }
  }, [feed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!feed) return [];
    const needle = query.trim().toLowerCase();
    const allowed = SOURCE_GROUPS[sourceFilter];
    return feed.items.filter((item) => {
      if (allowed.length && !allowed.includes(item.sourceId)) return false;
      if (attributedOnly && !item.institutions.length) return false;
      if (!needle) return true;
      return `${item.title} ${item.summary} ${item.publisher} ${item.institutions.join(' ')}`
        .toLowerCase()
        .includes(needle);
    });
  }, [feed, query, sourceFilter, attributedOnly]);

  const ranked = useMemo(() => {
    return filtered.map((item) => {
      const inst = item.institutions.length ? institutionByName(item.institutions[0]) : null;
      return {
        item,
        inst,
        cls: classifyAnomaly(`${item.title} ${item.summary}`),
        score: priorityScore(item.severity, item.published, inst),
      };
    });
  }, [filtered]);

  const byFamily = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of ranked) counts.set(row.cls.key, (counts.get(row.cls.key) ?? 0) + 1);
    return ANOMALY_CLASSES.map((family) => ({ ...family, count: counts.get(family.key) ?? 0 }));
  }, [ranked]);

  const attributed = feed?.items.filter((item) => item.institutions.length).length ?? 0;
  const sourcesOnline = feed?.sources.filter((source) => source.ok).length ?? 0;
  const institutionsNamed = useMemo(() => {
    const names = new Set<string>();
    for (const item of feed?.items ?? []) for (const name of item.institutions) names.add(name);
    return names.size;
  }, [feed]);

  const handleExport = () => {
    if (!feed?.items.length) {
      setNotice('No sourced records loaded yet — nothing to export');
      return;
    }
    const rows = [
      ['# Live OSINT feed | headline, publisher, timestamp and URL are as published by the source'],
      ['Record ID', 'Kind', 'Headline', 'Publisher', 'Published', 'Institutions named', 'Individuals', 'Source URL'],
      ...feed.items.map((item) => [
        item.id,
        KIND_LABEL[item.kind],
        item.title,
        item.publisher,
        item.published,
        item.institutions.join(' / ') || 'statewide',
        item.people.join(' / '),
        item.url,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `georgia-osint-feed-${feed.items.length}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setNotice(`Exported ${feed.items.length} published records to CSV`);
  };

  return (
    <section
      id="espionage-operations"
      className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200 scroll-mt-2"
    >
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <ShieldAlert size={15} className="text-emerald-400 shrink-0" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Espionage Operations — Live OSINT Stream
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              SOURCED ONLY
            </span>
            <span className="px-2 py-0.5 border border-zinc-700 bg-zinc-900/70 text-zinc-400 text-[10px] rounded">
              {feed?.coverage.institutions ?? 0} GA INSTITUTIONS · {feed?.coverage.georgiaFilers ?? 0} GA FILERS
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  state === 'live' ? 'bg-emerald-400 animate-pulse' : state === 'error' ? 'bg-rose-500' : 'bg-amber-400'
                }`}
              />
              <Radio size={11} className="text-zinc-500" />
              {state === 'live' ? 'LIVE' : state === 'error' ? 'RETRYING' : 'CONNECTING'}
              <span className="text-zinc-600">
                · {sourcesOnline}/{feed?.sources.length ?? 0} sources · {relativeTime(new Date(lastRefresh).toISOString())}
              </span>
            </span>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
            >
              <RefreshCw size={11} /> refresh
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
            >
              <Download size={11} /> CSV
            </button>
          </div>
        </div>

        {/* Disclosure */}
        <div className="flex items-start gap-2 border border-emerald-500/40 bg-emerald-950/20 rounded px-3 py-2">
          <Info size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[10.5px] leading-relaxed text-emerald-100/90">
            <strong className="text-emerald-300">Every row links to its publisher.</strong> The stream reads SEC
            EDGAR filings, the Federal Register, Federal Reserve and Department of Justice releases, FDIC press
            releases and OFAC actions, and refreshes every minute; the server refreshes the institution list from
            the FDIC and the insider filings from EDGAR weekly. A row is attributed to a bank only when the
            publisher’s own text names it. The twenty-point sets are labelled derivations because the FBI has not
            published such a list, and no account number, login, credential, MAC address or IP address is shown or
            invented.
          </p>
        </div>

        {notice && (
          <div className="border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 text-[10.5px] rounded px-3 py-1.5">
            {notice}
          </div>
        )}

        {/* Sources */}
        <div className="flex flex-wrap gap-1.5">
          {(feed?.sources ?? []).map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.error ?? source.label}
              className={`flex items-center gap-1 text-[9px] border rounded px-1.5 py-0.5 ${
                source.ok
                  ? 'border-emerald-700/60 text-emerald-300/90 hover:border-emerald-400'
                  : 'border-rose-800/60 text-rose-300/80'
              }`}
            >
              <span className={`inline-block w-1 h-1 rounded-full ${source.ok ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              {source.label.replace(/ \(.*\)$/, '')} · {source.count}
            </a>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Published records', value: (feed?.items.length ?? 0).toLocaleString() },
            { label: 'Attributed to a bank', value: attributed.toLocaleString() },
            { label: 'Banks named', value: institutionsNamed.toLocaleString() },
            {
              label: 'Insider filers covered',
              value: `${feed?.coverage.georgiaFilers ?? 0} / ${feed?.coverage.filers ?? 0}`,
            },
          ].map((stat) => (
            <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
              <div className="text-[13px] font-bold text-emerald-300 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Feed + register */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
          <div className="border border-zinc-800 rounded bg-[#070f12]">
            <div className="px-3 py-2 border-b border-zinc-800 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <Activity size={12} /> Live OSINT stream — all Georgia institutions
                </span>
                <span className="text-[9px] text-zinc-500">{filtered.length} rows · open a row for the detail page</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'SEC', 'REGULATOR', 'DOJ', 'SANCTIONS'] as SourceFilter[]).map((group) => (
                  <button
                    key={group}
                    onClick={() => setSourceFilter(group)}
                    className={`px-2 py-0.5 text-[9px] rounded border cursor-pointer ${
                      sourceFilter === group
                        ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50'
                        : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {group}
                  </button>
                ))}
                <button
                  onClick={() => setAttributedOnly((value) => !value)}
                  className={`px-2 py-0.5 text-[9px] rounded border cursor-pointer ${
                    attributedOnly
                      ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50'
                      : 'border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  BANK NAMED ONLY
                </button>
                <div className="relative ml-auto">
                  <Search size={11} className="absolute left-2 top-1.5 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="bank, headline or publisher"
                    className="bg-black/60 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 w-52"
                  />
                </div>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              {state === 'error' && !feed && (
                <div className="px-3 py-6 text-[10.5px] text-rose-300 leading-relaxed">
                  The feed request failed. Nothing is shown rather than a cached or invented list — press refresh
                  to retry.
                </div>
              )}
              {state !== 'error' && filtered.length === 0 && (
                <div className="px-3 py-6 text-[10.5px] text-zinc-500 leading-relaxed">
                  {feed
                    ? 'No published record matches this filter right now. The stream shows only what the publishers have released; it does not seed itself.'
                    : 'Reading the published record from EDGAR, the Federal Register, the Federal Reserve, the Department of Justice, the FDIC and OFAC…'}
                </div>
              )}
              {filtered.slice(0, 120).map((item, index) => (
                <FeedRow
                  key={item.id}
                  item={item}
                  index={index}
                  expanded={expanded.has(item.id)}
                  onToggle={toggle}
                />
              ))}
              {filtered.length > 120 && (
                <div className="px-3 py-2 text-[9px] text-zinc-600">
                  Showing the 120 most recent of {filtered.length} records. Narrow the filter to see the rest.
                </div>
              )}
            </div>
          </div>

          <div className="border border-zinc-800 rounded bg-[#070f12]">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Tax &amp; finance register by priority
              </span>
              <span className="text-[9px] text-zinc-500">severity · size · recency</span>
            </div>
            <div className="max-h-[240px] overflow-auto divide-y divide-zinc-900">
              {byFamily.map((family) => (
                <div key={family.key} className="px-3 py-1 flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="text-zinc-300">{family.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-16 bg-zinc-800 rounded overflow-hidden">
                      <span
                        className="block h-full bg-emerald-500"
                        style={{
                          width: `${Math.min(100, (family.count / Math.max(1, ranked.length)) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="tabular-nums text-zinc-400 w-6 text-right">{family.count}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-800 max-h-[318px] overflow-auto">
              {[...ranked]
                .sort((a, b) => b.score - a.score)
                .slice(0, 30)
                .map((row, index) => (
                  <button
                    key={`rank-${row.item.id}`}
                    onClick={() => toggle(row.item.id)}
                    className="w-full text-left px-3 py-1 flex items-start gap-2 text-[10px] border-b border-zinc-900/60 hover:bg-white/[0.03] cursor-pointer"
                  >
                    <span className="text-zinc-600 tabular-nums w-5 shrink-0">{index + 1}</span>
                    <span
                      className="text-[8.5px] font-bold px-1.5 rounded border shrink-0"
                      style={{
                        borderColor: PRIORITY_COLOR[priorityBand(row.score) as PriorityBand],
                        color: PRIORITY_COLOR[priorityBand(row.score) as PriorityBand],
                      }}
                    >
                      {priorityBand(row.score)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-zinc-300 truncate">{row.item.title}</span>
                      <span className="block text-[9px] text-zinc-600 truncate">
                        {row.cls.label} · {row.item.publisher}
                        {row.inst ? ` · ${row.inst.name}` : ' · statewide'}
                      </span>
                    </span>
                    <span className="tabular-nums text-zinc-500">{row.score}</span>
                  </button>
                ))}
              {ranked.length === 0 && (
                <div className="px-3 py-4 text-[10px] text-zinc-600">
                  Register empty until a published record arrives.
                </div>
              )}
            </div>
          </div>
        </div>

        <IndividualsPanel />

        <CoveragePanel rows={feed?.institutions ?? []} />

        <p className="text-[9px] text-zinc-600 leading-relaxed">
          Sources: SEC EDGAR ({GA_BANK_FILER_SOURCE.filings}; {GA_BANK_FILER_SOURCE.ownership}), the Federal
          Register API, Federal Reserve Board press releases, Department of Justice news, FDIC press releases,
          OFAC recent actions, and FDIC BankFind institutions ({feed?.coverage.source ?? 'FDIC BankFind'}; retrieved{' '}
          {feed?.coverage.retrieved ?? '—'}). Map beacons last two minutes and are raised only for a record that
          names an FDIC institution.
        </p>
      </div>
    </section>
  );
}
