import { useMemo, useState } from 'react';
import { Activity, MapPin, Info, Search, X, ChevronRight } from 'lucide-react';
import {
  GEORGIA_COUNTY_PROFILES,
  COUNTY_SOURCE,
  type CountyInstitutionProfile,
} from '../data/georgiaCountyForensic.ts';
import {
  assessCounties,
  formatUsd,
  RISK_BAND_COLORS,
  RISK_BAND_LABELS,
  type CountyRiskAssessment,
  type RiskBand,
} from '../lib/forensicRisk.ts';
import {
  COUNTY_BANKS_BY_FIPS,
  GEORGIA_BANK_NAMES,
  type CountyBankRow,
} from '../data/georgiaCountyBanks.ts';

/**
 * GEORGIA COUNTY FORENSIC OVERLAY
 *
 * County coverage is real: 159 counties from the Census county list, joined to the FDIC
 * Summary of Deposits 2025 response for institution counts, branch counts, deposits and
 * intra-county concentration (HHI).
 *
 * The risk score rendered here is ILLUSTRATIVE and says so on the panel. It is a fixed,
 * reproducible blend of the real concentration measures plus a deterministic
 * pseudo-signal; it is not an assessment of any institution and is not derived from
 * surveillance of anyone.
 */

const SNAPSHOT_ID = 'fiscal-2025-sod';

type FilterMode = 'ALL' | 'WITH_BRANCHES' | 'TOP_QUARTILE';

interface Row extends CountyRiskAssessment {
  profile: CountyInstitutionProfile;
}

const BAND_ORDER: RiskBand[] = ['CRITICAL', 'HIGH', 'ACTIVE', 'ELEVATED', 'MINIMAL'];

function scorePercent(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

export default function CountyForensicOverlay() {
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [query, setQuery] = useState('');
  const [selectedFips, setSelectedFips] = useState<string | null>(null);

  const assessments = useMemo(() => assessCounties(GEORGIA_COUNTY_PROFILES, SNAPSHOT_ID), []);

  const selectedBanks = useMemo<CountyBankRow[]>(() => {
    const rows = selectedFips ? COUNTY_BANKS_BY_FIPS[selectedFips] ?? [] : [];
    return [...rows].sort((a, b) => b[2] - a[2]);
  }, [selectedFips]);

  const rows: Row[] = useMemo(
    () =>
      assessments.map((assessment) => ({
        ...assessment,
        profile:
          GEORGIA_COUNTY_PROFILES.find((county) => county.fips === assessment.fips) ??
          GEORGIA_COUNTY_PROFILES[0],
      })),
    [assessments],
  );

  const withBranches = rows.filter((row) => row.profile.branches > 0);
  const coverage = withBranches.length;
  const totalInstitutions = rows.reduce((sum, row) => sum + row.profile.institutions, 0);
  const totalBranches = rows.reduce((sum, row) => sum + row.profile.branches, 0);
  const totalDeposits = rows.reduce((sum, row) => sum + row.profile.depositsUsd, 0);

  const bandCounts = useMemo(() => {
    const counts: Record<RiskBand, number> = {
      CRITICAL: 0,
      HIGH: 0,
      ACTIVE: 0,
      ELEVATED: 0,
      MINIMAL: 0,
    };
    rows.forEach((row) => {
      counts[row.band] += 1;
    });
    return counts;
  }, [rows]);

  const visible = useMemo(() => {
    const sortedByScore = [...rows].sort((a, b) => b.score - a.score);
    const cutoff = Math.ceil(sortedByScore.length / 4);
    const topFips = new Set(sortedByScore.slice(0, cutoff).map((row) => row.fips));
    const needle = query.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (filter === 'WITH_BRANCHES' && row.profile.branches === 0) return false;
        if (filter === 'TOP_QUARTILE' && !topFips.has(row.fips)) return false;
        if (needle && !`${row.name} ${row.fips}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);
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
              159 / 159 COUNTIES
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
            <span>
              FDIC SOD <strong className="text-zinc-200">{COUNTY_SOURCE.surveyYear}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              SNAPSHOT <strong className="text-zinc-200">{SNAPSHOT_ID}</strong>
            </span>
          </div>
        </div>

        {/* Illustrative disclosure - deliberately prominent */}
        <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-950/25 rounded px-3 py-2">
          <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            <strong className="text-amber-300">Illustrative scoring.</strong> County names,
            FIPS codes, institution counts, branch counts, deposits and HHI are real, taken
            from the U.S. Census county list and the FDIC Summary of Deposits{' '}
            {COUNTY_SOURCE.surveyYear} response for Georgia. The risk score is a fixed,
            reproducible demo function over those figures plus a deterministic
            pseudo-signal. It is not a vulnerability assessment, not an attribution, and not
            derived from surveillance of any institution or person.
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
            <div
              key={stat.label}
              className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2"
            >
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                {stat.label}
              </div>
              <div className="text-sm font-bold text-emerald-300">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Colour scale legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400">
          <span className="uppercase tracking-widest text-zinc-500">Risk scale</span>
          {BAND_ORDER.map((band) => (
            <span key={band} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: RISK_BAND_COLORS[band] }}
              />
              {band} ({bandCounts[band]})
            </span>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {chip('ALL', `All (${rows.length})`)}
          {chip('WITH_BRANCHES', `With branches (${coverage})`)}
          {chip('TOP_QUARTILE', 'Top quartile by score')}
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
                    <th className="text-left px-2 py-1.5 font-semibold w-28">Score</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const isActive = row.fips === selectedFips;
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
                                className="h-full rounded"
                                style={{
                                  width: `${Math.max(2, row.score * 100)}%`,
                                  backgroundColor: RISK_BAND_COLORS[row.band],
                                }}
                              />
                            </div>
                            <span
                              className="tabular-nums text-[10px] font-bold w-9 text-right"
                              style={{ color: RISK_BAND_COLORS[row.band] }}
                            >
                              {scorePercent(row.score)}
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
              Showing {visible.length} of {rows.length} counties · click a row for the
              drill-down
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
                    <div className="text-sm font-bold text-white">
                      {selected.name} County
                    </div>
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

                <div
                  className="rounded px-3 py-2 border"
                  style={{
                    borderColor: `${RISK_BAND_COLORS[selected.band]}66`,
                    backgroundColor: `${RISK_BAND_COLORS[selected.band]}14`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-400">
                      Illustrative score
                    </span>
                    <span
                      className="text-lg font-bold tabular-nums"
                      style={{ color: RISK_BAND_COLORS[selected.band] }}
                    >
                      {scorePercent(selected.score)}
                    </span>
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: RISK_BAND_COLORS[selected.band] }}>
                    {selected.band} — {RISK_BAND_LABELS[selected.band]}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {selected.components.map((component) => (
                    <div key={component.label}>
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>
                          {component.label}{' '}
                          <span className="text-zinc-600">×{component.weight.toFixed(2)}</span>
                        </span>
                        <span className="tabular-nums text-zinc-300">
                          {(component.value * 100).toFixed(1)}
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-cyan-400/70"
                          style={{ width: `${Math.max(1, component.value * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px] border-t border-zinc-800 pt-2">
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
                        FDIC Summary of Deposits 2025, branch-level response. Deposits are
                        the sum of that institution's branches inside the county.
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
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: RISK_BAND_COLORS[row.band] }}
                      />
                      {row.name}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {row.profile.institutions} inst · {formatUsd(row.profile.depositsUsd)}
                    </span>
                  </button>
                ))}
                <div className="text-[9px] text-zinc-600 pt-1">
                  Select any county above for the component breakdown.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-[9px] text-zinc-600 leading-relaxed border-t border-zinc-900 pt-2">
          Sources: {COUNTY_SOURCE.countyList}; {COUNTY_SOURCE.institutionData}. Score model:
          src/lib/forensicRisk.ts (deterministic, no randomness). Data regenerated per FDIC
          survey year.
        </div>
      </div>
    </section>
  );
}
