import { useMemo, useState } from 'react';
import { Activity, MapPin, Info, Search, X, ChevronRight } from 'lucide-react';
import {
  GEORGIA_COUNTY_PROFILES,
  COUNTY_SOURCE,
  type CountyInstitutionProfile,
} from '../data/georgiaCountyForensic.ts';
import { formatUsd } from '../lib/forensicRisk.ts';
import {
  COUNTY_BANKS_BY_FIPS,
  GEORGIA_BANK_NAMES,
  type CountyBankRow,
} from '../data/georgiaCountyBanks.ts';

/**
 * GEORGIA COUNTY FORENSIC OVERLAY
 *
 * Sourced data only. County coverage is real: 159 counties from the Census county list,
 * joined to the FDIC Summary of Deposits 2025 response for institution counts, branch
 * counts, deposits and intra-county concentration (HHI). The illustrative risk score
 * that this panel used to blend on top of those figures - including its deterministic
 * pseudo-signal - has been removed, so nothing here is a generated number.
 */

type FilterMode = 'ALL' | 'WITH_BRANCHES' | 'TOP_QUARTILE';

interface Row {
  fips: string;
  name: string;
  profile: CountyInstitutionProfile;
}

export default function CountyForensicOverlay() {
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [query, setQuery] = useState('');
  const [selectedFips, setSelectedFips] = useState<string | null>(null);

  const selectedBanks = useMemo<CountyBankRow[]>(() => {
    const rows = selectedFips ? COUNTY_BANKS_BY_FIPS[selectedFips] ?? [] : [];
    return [...rows].sort((a, b) => b[2] - a[2]);
  }, [selectedFips]);

  const rows: Row[] = useMemo(
    () =>
      GEORGIA_COUNTY_PROFILES.map((profile) => ({
        fips: profile.fips,
        name: profile.name,
        profile,
      })),
    [],
  );

  const withBranches = rows.filter((row) => row.profile.branches > 0);
  const coverage = withBranches.length;
  const totalInstitutions = rows.reduce((sum, row) => sum + row.profile.institutions, 0);
  const totalBranches = rows.reduce((sum, row) => sum + row.profile.branches, 0);
  const totalDeposits = rows.reduce((sum, row) => sum + row.profile.depositsUsd, 0);

  const visible = useMemo(() => {
    const byDeposits = [...rows].sort((a, b) => b.profile.depositsUsd - a.profile.depositsUsd);
    const cutoff = Math.ceil(byDeposits.length / 4);
    const topFips = new Set(byDeposits.slice(0, cutoff).map((row) => row.fips));
    const needle = query.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (filter === 'WITH_BRANCHES' && row.profile.branches === 0) return false;
        if (filter === 'TOP_QUARTILE' && !topFips.has(row.fips)) return false;
        if (needle && !`${row.name} ${row.fips}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.profile.depositsUsd - a.profile.depositsUsd);
  }, [rows, filter, query]);

  const selected = rows.find((row) => row.fips === selectedFips) ?? null;
  const topByInstitutions = [...rows]
    .sort((a, b) => b.profile.institutions - a.profile.institutions)
    .slice(0, 12);

  const chip = (mode: FilterMode, label: string) => (
    <button
      key={mode}
      onClick={() => setFilter(mode)}
      className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
        filter === mode
          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
          : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-emerald-400" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Georgia County Forensic Overlay
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {rows.length} / 159 COUNTIES
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
            <span>
              FDIC SOD <strong className="text-zinc-200">{COUNTY_SOURCE.surveyYear}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              SOURCED <strong className="text-zinc-200">FIGURES ONLY</strong>
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 border border-emerald-500/40 bg-emerald-950/20 rounded px-3 py-2">
          <Info size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-emerald-100/90">
            <strong className="text-emerald-300">Sourced data only.</strong> County names, FIPS
            codes, institution counts, branch counts, deposits and HHI are real, taken from the
            U.S. Census county list and the FDIC Summary of Deposits {COUNTY_SOURCE.surveyYear}{' '}
            response for Georgia. The illustrative risk score that used to be blended on top of
            these figures — including its deterministic pseudo-signal — has been removed, so every
            number on this panel is a published figure or arithmetic over one.
          </p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: 'Counties tracked', value: String(rows.length) },
            { label: 'With FDIC branches', value: String(coverage) },
            { label: 'Institution placements', value: String(totalInstitutions) },
            { label: 'Branches', value: totalBranches.toLocaleString() },
            { label: 'Deposits', value: formatUsd(totalDeposits) },
          ].map((stat) => (
            <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
              <div className="text-sm font-bold text-emerald-300">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {chip('ALL', `All (${rows.length})`)}
          {chip('WITH_BRANCHES', `With branches (${coverage})`)}
          {chip('TOP_QUARTILE', 'Top quartile by deposits')}
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter county or FIPS"
              className="pl-7 pr-6 py-1 w-52 bg-zinc-900/80 border border-zinc-700 rounded text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                aria-label="Clear filter"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* County table */}
          <div className="xl:col-span-2 border border-zinc-800 rounded overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#0a1418] text-zinc-500 uppercase tracking-wider text-[9px]">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold">County</th>
                    <th className="text-left px-2 py-1.5 font-semibold">FIPS</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Inst.</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Br.</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Deposits</th>
                    <th className="text-right px-2 py-1.5 font-semibold">HHI</th>
                    <th className="text-right px-2 py-1.5 font-semibold">Deposit share</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const isActive = row.fips === selectedFips;
                    const share = totalDeposits ? row.profile.depositsUsd / totalDeposits : 0;
                    return (
                      <tr
                        key={row.fips}
                        onClick={() => setSelectedFips(isActive ? null : row.fips)}
                        className={`cursor-pointer border-t border-zinc-900/80 transition-colors ${
                          isActive ? 'bg-emerald-950/40' : 'hover:bg-zinc-900/60'
                        }`}
                      >
                        <td className="px-2 py-1.5 text-zinc-200 font-semibold">{row.name}</td>
                        <td className="px-2 py-1.5 text-zinc-500">{row.fips}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-300">
                          {row.profile.institutions}
                        </td>
                        <td className="px-2 py-1.5 text-right text-zinc-400">
                          {row.profile.branches}
                        </td>
                        <td className="px-2 py-1.5 text-right text-zinc-300">
                          {formatUsd(row.profile.depositsUsd)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-zinc-400">{row.profile.hhi}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-zinc-800 rounded overflow-hidden">
                              <div
                                className="h-full rounded bg-emerald-400/80"
                                style={{ width: `${Math.max(1, share * 100)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-[10px] text-zinc-400 w-10 text-right">
                              {(share * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="text-zinc-600">
                          <ChevronRight size={11} />
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                        No county matches that filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-500">
              Showing {visible.length} of {rows.length} counties · sorted by FDIC branch deposits
            </div>
          </div>

          {/* Right rail: drill-down or top institutions */}
          <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-3">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      Drill-down
                    </div>
                    <div className="text-sm font-bold text-white">{selected.name} County</div>
                    <div className="text-[10px] text-zinc-500">FIPS {selected.fips}</div>
                  </div>
                  <button
                    onClick={() => setSelectedFips(null)}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                    aria-label="Close drill-down"
                  >
                    <X size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="text-zinc-500">Institutions</div>
                  <div className="text-right text-zinc-200">{selected.profile.institutions}</div>
                  <div className="text-zinc-500">Branches</div>
                  <div className="text-right text-zinc-200">{selected.profile.branches}</div>
                  <div className="text-zinc-500">Deposits</div>
                  <div className="text-right text-zinc-200">
                    {formatUsd(selected.profile.depositsUsd)}
                  </div>
                  <div className="text-zinc-500">HHI</div>
                  <div className="text-right text-zinc-200">{selected.profile.hhi}</div>
                  <div className="text-zinc-500">Share of GA deposits</div>
                  <div className="text-right text-zinc-200">
                    {totalDeposits ? ((selected.profile.depositsUsd / totalDeposits) * 100).toFixed(2) : '0.00'}%
                  </div>
                </div>

                {/* Institutions with branches in this county, real FDIC Summary of
                    Deposits rows, heaviest deposit base first. */}
                <div className="border-t border-zinc-800 pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-zinc-500">
                    <span>Banks in {selected.name} County</span>
                    <span className="tabular-nums">{selectedBanks.length}</span>
                  </div>
                  {selectedBanks.length === 0 ? (
                    <div className="text-[10px] text-zinc-500">
                      No FDIC-insured institution reports a branch here.
                    </div>
                  ) : (
                    <>
                      {selectedBanks.slice(0, 12).map((bank: CountyBankRow) => (
                        <div
                          key={`${bank[0]}-${GEORGIA_BANK_NAMES[bank[0]]}`}
                          className="flex items-baseline justify-between gap-2 text-[10px]"
                        >
                          <span className="text-zinc-300 truncate">
                            {GEORGIA_BANK_NAMES[bank[0]]}
                          </span>
                          <span className="tabular-nums text-zinc-400 shrink-0">
                            {bank[1]} br · {formatUsd(bank[2])}
                          </span>
                        </div>
                      ))}
                      {selectedBanks.length > 12 && (
                        <div className="text-[9px] text-zinc-500">
                          + {selectedBanks.length - 12} more institutions
                        </div>
                      )}
                      <div className="text-[9px] text-zinc-600 pt-1 leading-relaxed">
                        FDIC Summary of Deposits {COUNTY_SOURCE.surveyYear}, branch-level
                        response. Deposits are the sum of that institution's branches inside the
                        county.
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-zinc-500">
                  <Activity size={11} className="text-emerald-400" /> Top 12 by institution count
                </div>
                {topByInstitutions.map((row) => (
                  <button
                    key={row.fips}
                    onClick={() => setSelectedFips(row.fips)}
                    className="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded border border-transparent hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 text-zinc-300">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                      {row.name}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {row.profile.institutions} inst · {formatUsd(row.profile.depositsUsd)}
                    </span>
                  </button>
                ))}
                <div className="text-[9px] text-zinc-600 pt-1">
                  Select any county above for its branch, deposit and concentration figures.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-[9px] text-zinc-600 leading-relaxed border-t border-zinc-900 pt-2">
          Sources: {COUNTY_SOURCE.countyList}; {COUNTY_SOURCE.institutionData}. All figures are
          published values or arithmetic over them; no score, score component or pseudo-signal is
          rendered on this panel any more.
        </div>
      </div>
    </section>
  );
}
