import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronRight,
  Info,
  MapPin,
  Radio,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  FINANCIAL_INSTITUTIONS,
  FINANCIAL_SOURCE,
  matchInstitution,
  type FinancialInstitution,
} from '../data/georgiaFinancialInstitutions.ts';
import { GEORGIA_COUNTY_PATHS, GEORGIA_MAP_VIEWBOX } from '../data/georgiaCountyGeometry.ts';
import {
  ANOMALY_LEDGER,
  LEDGER_BAND_COLOR,
  LEDGER_SIZE,
  anomaliesFor,
  metricsFor,
  timeAgoLabel,
  type AnomalyRecord,
  type LiveRecord,
  type Severity,
} from '../lib/financialForensics.ts';

type SeverityFilter = 'all' | Severity;

const money = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const METRIC_TONE: Record<'risk' | 'watch' | 'steady', string> = {
  risk: '#f44336',
  watch: '#ffb300',
  steady: '#00e676',
};

const COUNTY_PATHS = Object.entries(GEORGIA_COUNTY_PATHS);

interface AnomalyCardProps {
  record: AnomalyRecord;
  institution: FinancialInstitution;
  open: boolean;
  onToggle: () => void;
}

function MetricGrid({ institution, record }: { institution: FinancialInstitution; record: AnomalyRecord }) {
  const metrics = useMemo(() => metricsFor(institution, record.id), [institution, record.id]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {metrics.map((metric) => (
        <div key={metric.key} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5">
          <div className="text-[8.5px] uppercase tracking-wider text-zinc-500 leading-tight truncate" title={metric.label}>
            {metric.label}
          </div>
          <div className="text-[11px] font-bold text-zinc-100 tabular-nums">{metric.display}</div>
          <div className="mt-1 h-[2px] w-full bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full"
              style={{ width: `${Math.max(4, Math.round(metric.level * 100))}%`, backgroundColor: METRIC_TONE[metric.tone] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnomalyCard({ record, institution, open, onToggle }: AnomalyCardProps) {
  const colour = LEDGER_BAND_COLOR[record.severity];
  return (
    <div className="border border-zinc-800 rounded bg-[#070f12]">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-start gap-2 cursor-pointer hover:bg-white/[0.02]"
      >
        {open ? (
          <ChevronDown size={13} className="text-zinc-500 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-zinc-500 mt-0.5 shrink-0" />
        )}
        <span
          className="text-[9px] font-bold px-1.5 py-[1px] rounded uppercase tracking-wider shrink-0"
          style={{ color: colour, border: `1px solid ${colour}66`, backgroundColor: `${colour}14` }}
        >
          {record.severity}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold text-zinc-100 leading-snug">{record.title}</span>
          <span className="block text-[10px] text-zinc-500 truncate">
            {record.vector} · {timeAgoLabel(record.offsetMinutes)}
          </span>
        </span>
        <span className="text-[8px] tracking-wider text-amber-400/80 border border-amber-500/40 rounded px-1 py-[1px] shrink-0">
          DEMO
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {[
              { label: 'Systems touched', rows: record.systems },
              { label: 'Logins observed', rows: record.logins },
              { label: 'Accounts referenced', rows: record.accounts },
            ].map((block) => (
              <div key={block.label} className="border border-zinc-800 rounded px-2 py-1.5 bg-[#060d10]">
                <div className="text-[8.5px] uppercase tracking-widest text-zinc-500 mb-1">{block.label}</div>
                {block.rows.map((row) => (
                  <div key={row} className="text-[10px] text-zinc-300 truncate" title={row}>
                    {row}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-widest text-emerald-300">
                // 20 recommended financial metrics
              </span>
              <span className="text-[9px] text-zinc-600">illustrative model over real FDIC scale</span>
            </div>
            <MetricGrid institution={institution} record={record} />
          </div>

          <p className="text-[9.5px] text-zinc-500 leading-relaxed">
            Demo record for <strong className="text-zinc-400">{institution.name}</strong>: fabricated
            scenario, fabricated masked account and login placeholders. Not an observation of,
            intrusion into, or claim about this institution or any person.
          </p>
        </div>
      )}
    </div>
  );
}

export default function FinancialEspionage() {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<string>(FINANCIAL_INSTITUTIONS[0]?.id ?? '');
  const [openAnomaly, setOpenAnomaly] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [live, setLive] = useState<LiveRecord[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [linkState, setLinkState] = useState<'connecting' | 'live' | 'offline'>('connecting');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of ANOMALY_LEDGER) map.set(record.institutionId, (map.get(record.institutionId) ?? 0) + 1);
    return map;
  }, []);

  const institutions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FINANCIAL_INSTITUTIONS.filter((inst) => {
      if (needle && !`${inst.name} ${inst.primary.name}`.toLowerCase().includes(needle)) return false;
      if (severity !== 'all') {
        const list = anomaliesFor(inst.id);
        if (!list.some((record) => record.severity === severity)) return false;
      }
      return true;
    });
  }, [query, severity]);

  const selected = useMemo(
    () => FINANCIAL_INSTITUTIONS.find((inst) => inst.id === selectedId) ?? FINANCIAL_INSTITUTIONS[0],
    [selectedId],
  );

  const selectedAnomalies = useMemo(() => {
    if (!selected) return [];
    const list = [...anomaliesFor(selected.id)];
    if (severity !== 'all') {
      const filtered = list.filter((record) => record.severity === severity);
      return filtered.length ? filtered : list;
    }
    return list;
  }, [selected, severity]);

  const visibleAnomalies = showAll ? selectedAnomalies : selectedAnomalies.slice(0, 8);

  const sortedInstitutions = useMemo(
    () => [...institutions].sort((a, b) => b.depositsUsd - a.depositsUsd),
    [institutions],
  );

  /** Marker list: biggest institutions first so the map is not a hairball. */
  const markers = useMemo(
    () =>
      [...FINANCIAL_INSTITUTIONS]
        .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
        .slice(0, 70)
        .map((inst) => ({
          inst,
          anomalies: counts.get(inst.id) ?? 0,
          radius: 3.5 + Math.min(9, Math.sqrt(counts.get(inst.id) ?? 0)),
        })),
    [counts],
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setOpenAnomaly(null);
    setShowAll(false);
  }, []);

  // Live OSINT stream - the only genuinely real-time part of this section.
  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/events');
      source.onopen = () => setLinkState('live');
      source.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data) as {
            id?: string;
            title?: string;
            source?: string;
            severity?: string;
            ts?: string;
            summary?: string;
            entities?: string[];
          };
          if (!payload?.id || !payload?.title) return;
          const inst = matchInstitution(payload);
          const sev: Severity =
            payload.severity === 'critical' ? 'critical' : payload.severity === 'high' ? 'high' : 'medium';
          const record: LiveRecord = {
            id: payload.id,
            institutionId: inst?.id ?? null,
            institutionName: inst?.name ?? null,
            severity: sev,
            title: payload.title,
            source: payload.source ?? 'OSINT',
            ts: payload.ts ?? new Date().toISOString(),
            demo: false,
          };
          setLive((prev) => (prev.some((r) => r.id === record.id) ? prev : [record, ...prev].slice(0, 8)));
          setLiveCount((count) => count + 1);
          setLinkState('live');
        } catch {
          /* malformed frame - ignore, the stream keeps going */
        }
      };
      source.onerror = () => setLinkState('offline');
    } catch {
      setLinkState('offline');
    }
    return () => {
      source?.close();
    };
  }, []);

  const totalBranches = FINANCIAL_SOURCE.branches;
  const totalDeposits = FINANCIAL_SOURCE.depositsUsd;
  const criticalRecords = useMemo(
    () => ANOMALY_LEDGER.filter((record) => record.severity === 'critical').length,
    [],
  );

  const chip = (mode: SeverityFilter, label: string) => (
    <button
      key={mode}
      onClick={() => setSeverity(mode)}
      className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
        severity === mode
          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
          : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-zinc-500'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section
      id="financial-espionage"
      className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200"
    >
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-emerald-400" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Georgia Financial Institutions — Espionage &amp; Forensic Ledger
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {FINANCIAL_SOURCE.institutions} INSTITUTIONS
            </span>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {LEDGER_SIZE.toLocaleString()} RECORDS
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
            <span>
              FDIC SOD <strong className="text-zinc-200">{FINANCIAL_SOURCE.surveyYear}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  linkState === 'live' ? 'bg-emerald-400 animate-pulse' : linkState === 'offline' ? 'bg-rose-500' : 'bg-amber-400'
                }`}
              />
              <Radio size={11} className="text-zinc-500" />
              {linkState === 'live' ? 'LIVE STREAM' : linkState === 'offline' ? 'STREAM RETRYING' : 'CONNECTING'}
            </span>
          </div>
        </div>

        {/* Disclosure */}
        <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-950/25 rounded px-3 py-2">
          <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            <strong className="text-amber-300">Real and illustrative, kept apart.</strong> Institution
            names, county coverage, branch counts and deposit totals are real: FDIC Summary of
            Deposits {FINANCIAL_SOURCE.surveyYear}, STALPBR=GA, {FINANCIAL_SOURCE.branchRows} branch
            rows across {FINANCIAL_SOURCE.institutions} institutions. The {LEDGER_SIZE.toLocaleString()}{' '}
            ledger records below are <strong className="text-amber-300">generated demo scenarios</strong>{' '}
            from a fixed hash, identical on every device and reload; the 20 metrics are an illustrative
            model over the real FDIC scale. No bank, account, login or person named in a demo record is
            claimed to be compromised, and no loss figure is a real loss. Rows marked{' '}
            <strong className="text-emerald-300">LIVE</strong> are real headlines from this dashboard&apos;s
            OSINT stream.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[
            { label: 'Institutions', value: FINANCIAL_SOURCE.institutions.toLocaleString() },
            { label: 'GA branches', value: totalBranches.toLocaleString() },
            { label: 'GA deposits', value: money(totalDeposits) },
            { label: 'Ledger records', value: LEDGER_SIZE.toLocaleString() },
            { label: 'Critical records', value: criticalRecords.toLocaleString() },
            { label: 'Live events seen', value: liveCount.toLocaleString() },
          ].map((stat) => (
            <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
              <div className="text-sm font-bold text-emerald-300">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {chip('all', `All (${FINANCIAL_INSTITUTIONS.length})`)}
          {chip('critical', 'Critical')}
          {chip('high', 'High')}
          {chip('medium', 'Medium')}
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter institution or county"
              className="pl-7 pr-6 py-1 w-60 bg-zinc-900/80 border border-zinc-700 rounded text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-3">
          {/* Institution list */}
          <div className="border border-zinc-800 rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#070f12]">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Building2 size={12} className="text-emerald-400" />
                Institutions ({sortedInstitutions.length})
              </span>
              <span className="text-[9px] text-zinc-600">sorted by GA deposits</span>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-[#070f12] text-[9px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="text-left px-3 py-1.5">Institution</th>
                    <th className="text-left px-2 py-1.5 hidden sm:table-cell">Primary market</th>
                    <th className="text-right px-2 py-1.5">Br.</th>
                    <th className="text-right px-2 py-1.5">Deposits</th>
                    <th className="text-right px-3 py-1.5">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInstitutions.map((inst) => {
                    const isSelected = inst.id === selected?.id;
                    const count = counts.get(inst.id) ?? 0;
                    return (
                      <tr
                        key={inst.id}
                        onClick={() => select(inst.id)}
                        className={`cursor-pointer border-t border-zinc-900 ${
                          isSelected ? 'bg-emerald-950/40' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: isSelected ? '#34d399' : '#3f3f46' }}
                            />
                            <span className="truncate text-zinc-200 max-w-[220px]" title={inst.name}>
                              {inst.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-zinc-500 hidden sm:table-cell">{inst.primary.name}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-400">{inst.branches}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-300">{money(inst.depositsUsd)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="text-[10px] font-bold text-amber-300">{count}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!sortedInstitutions.length && (
                <div className="px-3 py-6 text-[11px] text-zinc-500">No institution matches that filter.</div>
              )}
            </div>
          </div>

          {/* Map + selected facts */}
          <div className="space-y-2">
            <div className="border border-zinc-800 rounded bg-[#070f12] p-2">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <MapPin size={12} className="text-emerald-400" />
                  Institution map
                </span>
                <span className="text-[9px] text-zinc-600">{markers.length} largest placed</span>
              </div>
              <svg
                viewBox={`0 0 ${GEORGIA_MAP_VIEWBOX.width} ${GEORGIA_MAP_VIEWBOX.height}`}
                className="w-full h-auto block"
                role="img"
                aria-label="Georgia county map with institution markers"
              >
                {COUNTY_PATHS.map(([fips, d]) => (
                  <path key={fips} d={d} fill="#08120f" stroke="#16302a" strokeWidth={1.1} />
                ))}
                {markers.map(({ inst, radius }) => {
                  const isSelected = inst.id === selected?.id;
                  return (
                    <g key={inst.id} onClick={() => select(inst.id)} className="cursor-pointer">
                      <circle
                        cx={inst.marker.x}
                        cy={inst.marker.y}
                        r={isSelected ? radius + 4 : radius}
                        fill={isSelected ? '#34d399' : '#f59e0b'}
                        fillOpacity={isSelected ? 0.95 : 0.55}
                        stroke={isSelected ? '#a7f3d0' : '#fbbf24'}
                        strokeWidth={isSelected ? 2 : 0.8}
                      />
                      <title>
                        {inst.name} · {inst.primary.name} · {inst.branches} branches ·{' '}
                        {money(inst.depositsUsd)}
                      </title>
                    </g>
                  );
                })}
              </svg>
              <div className="flex items-center gap-3 px-1 pt-1 text-[9px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> selected
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500/60" /> size = records
                </span>
              </div>
            </div>

            {selected && (
              <div className="border border-zinc-800 rounded bg-[#070f12] px-3 py-2 space-y-1.5">
                <div className="text-[12px] font-bold text-emerald-200 leading-snug">{selected.name}</div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="text-zinc-500">
                    Primary market
                    <div className="text-zinc-200">{selected.primary.name} County</div>
                  </div>
                  <div className="text-zinc-500">
                    Counties served
                    <div className="text-zinc-200">
                      {selected.countyCount} {selected.countyCount === 1 ? 'county' : 'counties'}
                    </div>
                  </div>
                  <div className="text-zinc-500">
                    GA branches
                    <div className="text-zinc-200">{selected.branches}</div>
                  </div>
                  <div className="text-zinc-500">
                    GA branch deposits
                    <div className="text-zinc-200">{money(selected.depositsUsd)}</div>
                  </div>
                </div>
                <div className="text-[9px] text-zinc-600 leading-relaxed">
                  Counties: {selected.counties.slice(0, 6).map((c) => c.name).join(', ')}
                  {selected.counties.length > 6 ? ` +${selected.counties.length - 6}` : ''}
                </div>
                <div className="text-[9px] text-zinc-600">
                  {counts.get(selected.id) ?? 0} ledger records ·{' '}
                  {severity === 'all' ? 'all severities' : `${severity} only`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live strip */}
        <div className="border border-zinc-800 rounded bg-[#070f12]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Activity size={12} className="text-emerald-400" />
              Live OSINT matched to institutions
            </span>
            <span className="text-[9px] text-zinc-600">{liveCount} events this session</span>
          </div>
          <div className="divide-y divide-zinc-900">
            {live.slice(0, 4).map((record) => {
              const colour = LEDGER_BAND_COLOR[record.severity];
              return (
                <div key={record.id} className="px-3 py-1.5 flex items-center gap-2 text-[10.5px]">
                  <span
                    className="text-[8.5px] font-bold px-1.5 py-[1px] rounded uppercase shrink-0"
                    style={{ color: colour, border: `1px solid ${colour}66` }}
                  >
                    {record.severity}
                  </span>
                  <span className="text-emerald-300 shrink-0">LIVE</span>
                  <span className="truncate flex-1 text-zinc-300">{record.title}</span>
                  <button
                    onClick={() => record.institutionId && select(record.institutionId)}
                    className={`text-[9px] shrink-0 ${
                      record.institutionName
                        ? 'text-amber-300 underline decoration-dotted cursor-pointer'
                        : 'text-zinc-600'
                    }`}
                    disabled={!record.institutionId}
                  >
                    {record.institutionName ?? 'unattributed'}
                  </button>
                </div>
              );
            })}
            {!live.length && (
              <div className="px-3 py-3 text-[10.5px] text-zinc-500">
                Waiting for the stream. Events arrive as the OSINT pollers publish; each is matched to a
                Georgia institution by name where possible.
              </div>
            )}
          </div>
        </div>

        {/* Anomaly detail */}
        {selected && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-900/40 pt-3">
              <div className="flex items-center gap-2">
                <ShieldAlert size={13} className="text-amber-400" />
                <h3 className="text-[12px] font-bold tracking-widest text-emerald-200 uppercase">
                  Anomalies · {selected.name}
                </h3>
                <span className="text-[9px] px-1.5 py-[1px] border border-amber-500/40 text-amber-300 rounded">
                  DEMO RECORDS
                </span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-zinc-500">
                <span>{selectedAnomalies.length} records</span>
                <span>·</span>
                <span>{selectedAnomalies.filter((r) => r.severity === 'critical').length} critical</span>
                <button
                  onClick={() => setShowAll((value) => !value)}
                  className="text-emerald-300 underline decoration-dotted cursor-pointer"
                >
                  {showAll ? 'Show first 8' : `Show all ${selectedAnomalies.length}`}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {visibleAnomalies.map((record) => (
                <AnomalyCard
                  key={record.id}
                  record={record}
                  institution={selected}
                  open={openAnomaly === record.id}
                  onToggle={() => setOpenAnomaly((current) => (current === record.id ? null : record.id))}
                />
              ))}
            </div>

            <p className="text-[9.5px] text-zinc-600 leading-relaxed">
              Every card above is one of the {LEDGER_SIZE.toLocaleString()} generated demo records, ordered
              newest first. The 20 metrics under each record are the fixed financial-signal model described
              in the disclosure. Sourced live headlines appear only in the LIVE strip, where they keep their
              original text and publisher.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
