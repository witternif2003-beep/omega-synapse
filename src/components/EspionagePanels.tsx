import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Landmark, RefreshCw, Search, UserRound, Users } from 'lucide-react';
import { GA_BANK_FILERS } from '../data/gaBankFilers.ts';
import { money, type PersonView } from '../lib/financialIndicators.ts';
import { IndicatorGrid, peopleFromLive } from './EspionageFeedRow.tsx';
import type { RoleFilter } from './EspionageFeedRow.tsx';
import {
  filingFromLive,
  loadInsiders,
  relativeTime,
  type GeorgiaInstitution,
  type OsintInsiderPayload,
  type OsintItem,
} from '../lib/osintClient.ts';

/**
 * INDIVIDUALS AT GEORGIA BANK COMPANIES, AND THE COVERAGE TABLE
 *
 * Individuals come from their own SEC Form 4 filings, fetched live for every Georgia bank
 * company and cached on the server for one week. A person is labelled issuer employee
 * (officer), non-employee director, non-employee owner, or other reporting person, because
 * that is what the filing reports. Contractor status is not a field in any SEC or FDIC
 * publication, so no contractor label is claimed.
 */

export function IndividualsPanel({
  institutions,
  items,
  onDeepDive,
}: {
  institutions: GeorgiaInstitution[];
  items: OsintItem[];
  onDeepDive: (key: string, payload: OsintInsiderPayload) => void;
}) {
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
        setSelected((current) => (payload.filings.some((row) => row.owner === current) ? current : first));
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    if (cik) load(cik);
  }, [cik, load]);

  const { people, filings } = useMemo(
    () => (data ? peopleFromLive(data) : { people: [] as PersonView[], filings: [] as ReturnType<typeof filingFromLive>[] }),
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
                <div className="flex flex-wrap items-center gap-1.5">
                  {data && (
                    <button
                      onClick={() => onDeepDive(person.key, data)}
                      className="flex items-center gap-1 text-[10px] text-emerald-200 border border-emerald-500/50 bg-emerald-950/30 rounded px-2 py-1 hover:bg-emerald-950/60 cursor-pointer"
                    >
                      <Users size={10} /> admin deep dive — 280 individual indicators
                    </button>
                  )}
                  <a
                    href={person.latest.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-950/40"
                  >
                    Form 4 filing <ArrowUpRight size={10} />
                  </a>
                </div>
              </div>

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

export function CoveragePanel({
  rows,
  onOpen,
}: {
  rows: GeorgiaInstitution[];
  onOpen: (institution: GeorgiaInstitution) => void;
}) {
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
              <tr
                key={`${row.cert}-${row.name}`}
                onClick={() => onOpen(row)}
                className="border-t border-zinc-900/70 text-[10px] cursor-pointer hover:bg-emerald-950/30"
                title="open the institution deep dive"
              >
                <td className="px-3 py-1 text-zinc-200">
                  {row.name}
                  <span className="ml-1.5 text-[8px] text-emerald-400">DEEP DIVE</span>
                </td>
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
        FDIC total-asset field · click a row for its 280-measure dossier
      </div>
    </div>
  );
}

export type SourceFilter = 'ALL' | 'SEC' | 'REGULATOR' | 'DOJ' | 'SANCTIONS';
