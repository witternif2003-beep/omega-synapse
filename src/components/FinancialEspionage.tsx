import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  Download,
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
import {
  GEORGIA_COUNTY_PATHS,
  GEORGIA_MAP_PROJECTION,
  GEORGIA_MAP_VIEWBOX,
} from '../data/georgiaCountyGeometry.ts';
import { metricsFor } from '../lib/financialForensics.ts';
import { exportEvents, exportInstitutions, type SourcedEvent } from '../lib/ledgerExport.ts';

type SortMode = 'deposits' | 'county' | 'name';

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
const HASH_PREFIX = '#institution/';

/** Inverse of the county-boundary projection: viewBox units back to real lat/lng. */
function toLatLng(x: number, y: number): { lat: number; lng: number } {
  const { minLon, maxLon, minLat, maxLat, width, height } = GEORGIA_MAP_PROJECTION;
  return {
    lat: maxLat - (y / height) * (maxLat - minLat),
    lng: minLon + (x / width) * (maxLon - minLon),
  };
}

const fmtCoords = (x: number, y: number): string => {
  const { lat, lng } = toLatLng(x, y);
  return `${lat.toFixed(4)}° N, ${Math.abs(lng).toFixed(4)}° W`;
};

/**
 * What each of the 20 indicators is actually computed from. Every input is a real,
 * sourced figure from the FDIC Summary of Deposits 2025 Georgia response or the Census
 * county boundaries; the indicator is a derived measure over those inputs.
 */
const INDICATOR_BASIS: Record<string, string> = {
  'deposit-exposure': 'share of FDIC branch deposits',
  'exposure-ratio': 'exposure over FDIC deposits',
  'wire-velocity': 'branches × settlement profile',
  'wire-at-risk': 'exposure × wire share',
  'ach-return': 'branch and deposit profile',
  'ach-exceptions': 'branch volume',
  'settlement-latency': 'branch volume',
  'duplicate-payments': 'branch count',
  'dormant-reactivation': 'counties served',
  'cnp-velocity': 'deposit scale',
  'callback-failures': 'branch count',
  'privileged-offwindow': 'branch count',
  'mfa-failures': 'branch and deposit scale',
  'session-anomalies': 'branch count',
  'sanctions-hits': 'counties served',
  'nsf-spike': 'deposit profile',
  'rate-sensitivity': 'FDIC deposit base',
  'lcr-shift': 'FDIC deposit base',
  'collateral-gap': 'FDIC deposit base',
  'recon-breaks': 'branch count',
};

function IndicatorPanel({ institution }: { institution: FinancialInstitution }) {
  const metrics = useMemo(() => metricsFor(institution, `fiscal:${institution.id}`), [institution]);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-widest text-emerald-300">
          // 20-point financial forensic indicators
        </span>
        <span className="text-[9px] text-zinc-600">
          derived from FDIC SOD {FINANCIAL_SOURCE.surveyYear} figures for this institution
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {metrics.map((metric) => (
          <div key={metric.key} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5 min-w-0">
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
            <div className="mt-0.5 text-[8px] text-zinc-600 truncate" title={INDICATOR_BASIS[metric.key]}>
              {INDICATOR_BASIS[metric.key]}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-zinc-600 leading-relaxed">
        These are derived measures, not filings and not an FBI-published list — the FBI has not
        published a twenty-point financial forensic indicator set, so this one is labelled as our own
        derivation. Each tile states the real FDIC input it is computed from; the scaling factors are
        fixed in code. No value here is a reported loss, a breach finding, or a claim about an account.
      </p>
    </div>
  );
}

interface InstitutionTableProps {
  institutions: FinancialInstitution[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  sort: SortMode;
  matchCount: (id: string) => number;
}

const InstitutionTable = memo(function InstitutionTable({
  institutions,
  selectedId,
  onSelect,
  onOpen,
  sort,
  matchCount,
}: InstitutionTableProps) {
  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-[#070f12] text-[9px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="text-left px-3 py-1.5">Institution</th>
            <th className="text-left px-2 py-1.5 hidden sm:table-cell">Primary market</th>
            <th className="text-right px-2 py-1.5 hidden sm:table-cell">Br.</th>
            <th className="text-right px-2 py-1.5">Deposits</th>
            <th className="text-right px-3 py-1.5">Live</th>
          </tr>
        </thead>
        <tbody>
          {institutions.map((inst) => {
            const isSelected = inst.id === selectedId;
            return (
              <tr
                key={inst.id}
                onClick={() => onSelect(inst.id)}
                className={`cursor-pointer border-t border-zinc-900 ${
                  isSelected ? 'bg-emerald-950/40' : 'hover:bg-white/[0.03]'
                }`}
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isSelected ? '#34d399' : '#3f3f46' }}
                    />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(inst.id);
                      }}
                      className="truncate text-left text-zinc-200 max-w-[190px] sm:max-w-[220px] underline decoration-zinc-700 decoration-dotted hover:text-emerald-200 hover:decoration-emerald-500 cursor-pointer"
                      title={`Open ${inst.name} dossier`}
                    >
                      {inst.name}
                    </button>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 hidden sm:table-cell">{inst.primary.name}</td>
                <td className="px-2 py-1.5 text-right text-zinc-400 hidden sm:table-cell">{inst.branches}</td>
                <td className="px-2 py-1.5 text-right text-zinc-300">{money(inst.depositsUsd)}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className="text-[10px] font-bold text-emerald-300">{matchCount(inst.id) || 0}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!institutions.length && (
        <div className="px-3 py-6 text-[11px] text-zinc-500">No institution matches that filter.</div>
      )}
    </div>
  );
});

export default function FinancialEspionage() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('deposits');
  const [selectedId, setSelectedId] = useState<string>(FINANCIAL_INSTITUTIONS[0]?.id ?? '');
  const [live, setLive] = useState<SourcedEvent[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [linkState, setLinkState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [notice, setNotice] = useState<string | null>(null);
  const [pageInstId, setPageInstId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.location.hash.startsWith(HASH_PREFIX) ? window.location.hash.slice(HASH_PREFIX.length) : null;
  });
  const pendingRef = useRef<SourcedEvent[]>([]);

  const liveByInstitution = useMemo(() => {
    const map = new Map<string, SourcedEvent[]>();
    for (const event of live) {
      if (!event.institutionId) continue;
      const list = map.get(event.institutionId) ?? [];
      list.push(event);
      map.set(event.institutionId, list);
    }
    return map;
  }, [live]);

  const matchCount = useCallback((id: string) => liveByInstitution.get(id)?.length ?? 0, [liveByInstitution]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      setPageInstId(hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Live OSINT stream. Events are buffered and flushed twice a second so a burst of
  // headlines cannot re-render the 182-row table on every frame.
  useEffect(() => {
    let source: EventSource | null = null;
    let flush = 0;
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
            url?: string;
            entities?: string[];
          };
          if (!payload?.id || !payload?.title) return;
          const inst = matchInstitution(payload);
          const severity: SourcedEvent['severity'] =
            payload.severity === 'critical'
              ? 'critical'
              : payload.severity === 'high'
                ? 'high'
                : payload.severity === 'info'
                  ? 'info'
                  : 'medium';
          pendingRef.current.push({
            id: payload.id,
            institutionId: inst?.id ?? null,
            institutionName: inst?.name ?? null,
            severity,
            title: payload.title,
            source: payload.source ?? 'OSINT',
            ts: payload.ts ?? new Date().toISOString(),
            url: payload.url ?? '',
          });
          setLinkState('live');
        } catch {
          /* malformed frame - the stream keeps going */
        }
      };
      source.onerror = () => setLinkState('offline');
      flush = window.setInterval(() => {
        if (!pendingRef.current.length) return;
        const batch = pendingRef.current;
        pendingRef.current = [];
        setLiveCount((count) => count + batch.length);
        setLive((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const fresh = batch.filter((item) => !seen.has(item.id));
          return fresh.length ? [...fresh.reverse(), ...prev].slice(0, 300) : prev;
        });
      }, 600);
    } catch {
      setLinkState('offline');
    }
    return () => {
      if (flush) window.clearInterval(flush);
      source?.close();
    };
  }, []);

  const institutions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FINANCIAL_INSTITUTIONS.filter(
      (inst) => !needle || `${inst.name} ${inst.primary.name}`.toLowerCase().includes(needle),
    );
  }, [query]);

  const sortedInstitutions = useMemo(() => {
    const list = [...institutions];
    if (sort === 'county') {
      return list.sort(
        (a, b) => a.primary.name.localeCompare(b.primary.name) || b.depositsUsd - a.depositsUsd,
      );
    }
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => b.depositsUsd - a.depositsUsd);
  }, [institutions, sort]);

  const selected = useMemo(
    () => FINANCIAL_INSTITUTIONS.find((inst) => inst.id === selectedId) ?? FINANCIAL_INSTITUTIONS[0],
    [selectedId],
  );

  const pageInst = useMemo(
    () => (pageInstId ? FINANCIAL_INSTITUTIONS.find((inst) => inst.id === pageInstId) ?? null : null),
    [pageInstId],
  );

  const markers = useMemo(
    () =>
      [...FINANCIAL_INSTITUTIONS]
        .sort((a, b) => (liveByInstitution.get(b.id)?.length ?? 0) - (liveByInstitution.get(a.id)?.length ?? 0) || b.depositsUsd - a.depositsUsd)
        .slice(0, 120)
        .map((inst) => ({ inst, radius: 3.5 + Math.min(9, Math.sqrt((liveByInstitution.get(inst.id)?.length ?? 0) + 1)) })),
    [liveByInstitution],
  );

  const select = useCallback((id: string) => setSelectedId(id), []);

  const openPage = useCallback((id: string) => {
    window.history.pushState(null, '', `${HASH_PREFIX}${id}`);
    setPageInstId(id);
    const section = document.getElementById('financial-espionage');
    if (section) window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 8 });
  }, []);

  const closePage = useCallback(() => {
    window.history.pushState(null, '', '#financial-espionage');
    setPageInstId(null);
    const section = document.getElementById('financial-espionage');
    if (section) window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 8 });
  }, []);

  const attrs = live.filter((event) => event.institutionId);
  const totalBranches = FINANCIAL_SOURCE.branches;
  const totalDeposits = FINANCIAL_SOURCE.depositsUsd;

  const handleExportInstitutions = () => {
    setNotice(`Exported ${exportInstitutions(sortedInstitutions)} institution rows (FDIC figures) to CSV`);
  };

  const handleExportEvents = (events: SourcedEvent[], label: string) => {
    if (!events.length) {
      setNotice('No live events captured yet this session — nothing to export');
      return;
    }
    setNotice(`Exported ${exportEvents(events, label)} live events to CSV`);
  };

  const eventRow = (event: SourcedEvent) => (
    <div key={event.id} className="px-3 py-1.5 flex items-start gap-2 text-[10.5px]">
      <span className="text-[8.5px] font-bold px-1.5 py-[1px] rounded uppercase shrink-0 border border-zinc-700 text-zinc-300">
        {event.severity}
      </span>
      <span className="text-emerald-300 shrink-0">LIVE</span>
      <span className="min-w-0 flex-1">
        <span className="block text-zinc-300 leading-snug">{event.title}</span>
        <span className="block text-[9px] text-zinc-600">
          {event.source} · {new Date(event.ts).toISOString().slice(0, 16).replace('T', ' ')}Z
          {event.institutionName ? ` · ${event.institutionName}` : ' · unattributed'}
        </span>
      </span>
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer"
          className="text-[9px] text-emerald-400 underline decoration-dotted shrink-0"
        >
          source
        </a>
      )}
    </div>
  );

  const countySet = pageInst ? new Set(pageInst.counties.map((county) => county.fips)) : null;

  return (
    <section
      id="financial-espionage"
      className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200 scroll-mt-2"
    >
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={15} className="text-emerald-400 shrink-0" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              {pageInst ? `// Institution Dossier — ${pageInst.name}` : '// Georgia Financial Institutions — Sourced Intelligence'}
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {FINANCIAL_SOURCE.institutions} INSTITUTIONS
            </span>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              SOURCED ONLY
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

        {notice && (
          <div className="border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 text-[10.5px] rounded px-3 py-1.5">
            {notice}
          </div>
        )}

        {pageInst ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={closePage}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 cursor-pointer hover:bg-emerald-950/40"
              >
                <ArrowLeft size={11} /> Back to ledger
              </button>
              <span className="text-[9px] text-zinc-600">
                {HASH_PREFIX}
                {pageInst.id}
              </span>
              <button
                onClick={() => handleExportEvents(liveByInstitution.get(pageInst.id) ?? [], pageInst.name)}
                className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-200 border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
              >
                <Download size={11} /> Export live events
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'GA branches', value: pageInst.branches.toLocaleString() },
                { label: 'GA deposits', value: money(pageInst.depositsUsd) },
                { label: 'Counties', value: pageInst.countyCount.toLocaleString() },
                { label: 'Live matches', value: (liveByInstitution.get(pageInst.id)?.length ?? 0).toLocaleString() },
                { label: 'Coordinates', value: fmtCoords(pageInst.marker.x, pageInst.marker.y) },
              ].map((stat) => (
                <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
                  <div className="text-[11px] font-bold text-emerald-300 tabular-nums">{stat.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-3">
              <div className="border border-zinc-800 rounded bg-[#070f12] p-2">
                <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <MapPin size={12} className="text-emerald-400" /> Footprint
                </div>
                <svg
                  viewBox={`0 0 ${GEORGIA_MAP_VIEWBOX.width} ${GEORGIA_MAP_VIEWBOX.height}`}
                  className="w-full h-auto block"
                  role="img"
                  aria-label={`Georgia counties where ${pageInst.name} has branches`}
                >
                  {COUNTY_PATHS.map(([fips, d]) => {
                    const inFootprint = countySet?.has(fips) ?? false;
                    return (
                      <path
                        key={fips}
                        d={d}
                        fill={inFootprint ? '#0d3327' : '#08120f'}
                        stroke={inFootprint ? '#2f7d63' : '#16302a'}
                        strokeWidth={inFootprint ? 1.4 : 1.1}
                      />
                    );
                  })}
                  <circle
                    cx={pageInst.marker.x}
                    cy={pageInst.marker.y}
                    r={8}
                    fill="#34d399"
                    fillOpacity={0.95}
                    stroke="#a7f3d0"
                    strokeWidth={2}
                  />
                </svg>
                <div className="px-1 pt-1 text-[9px] text-zinc-500">
                  {pageInst.countyCount} counties with FDIC-reported branches · marker at {fmtCoords(pageInst.marker.x, pageInst.marker.y)}
                </div>
              </div>

              <div className="border border-zinc-800 rounded overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#070f12]">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400">County footprint (real)</span>
                  <span className="text-[9px] text-zinc-600">FDIC SOD {FINANCIAL_SOURCE.surveyYear}</span>
                </div>
                <div className="max-h-[380px] overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-[#070f12] text-[9px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="text-left px-3 py-1.5">County</th>
                        <th className="text-right px-2 py-1.5">Branches</th>
                        <th className="text-right px-2 py-1.5">Deposits</th>
                        <th className="text-right px-3 py-1.5">FIPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageInst.counties.map((county) => (
                        <tr key={county.fips} className="border-t border-zinc-900">
                          <td className="px-3 py-1.5 text-zinc-200">{county.name}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-400">{county.branches}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-300">{money(county.depositsUsd)}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-600 tabular-nums">{county.fips}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 rounded bg-[#070f12] px-3 py-2">
              <IndicatorPanel institution={pageInst} />
            </div>

            <div className="border border-zinc-800 rounded bg-[#070f12]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Activity size={12} className="text-emerald-400" />
                  Sourced events for {pageInst.name}
                </span>
                <span className="text-[9px] text-zinc-600">
                  {(liveByInstitution.get(pageInst.id)?.length ?? 0)} this session
                </span>
              </div>
              <div className="divide-y divide-zinc-900">
                {(liveByInstitution.get(pageInst.id) ?? []).slice(0, 20).map(eventRow)}
                {!liveByInstitution.get(pageInst.id)?.length && (
                  <div className="px-3 py-3 text-[10.5px] text-zinc-500">
                    No sourced event has named this institution since you opened the page. The stream only
                    shows headlines whose publisher named it; nothing is attributed by guesswork.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 border border-emerald-500/40 bg-emerald-950/20 rounded px-3 py-2">
              <Info size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed text-emerald-100/90">
                <strong className="text-emerald-300">Sourced data only.</strong> Institution names, county
                coverage, branches and deposits are the FDIC Summary of Deposits {FINANCIAL_SOURCE.surveyYear}{' '}
                Georgia response ({FINANCIAL_SOURCE.branchRows} branch rows, {FINANCIAL_SOURCE.institutions}{' '}
                institutions); coordinates come from the U.S. Census county boundaries. Events are real
                headlines from this dashboard&apos;s OSINT stream, shown with their publisher, timestamp and
                link — nothing on this panel is generated, simulated or attributed by guesswork. No source
                publishes compromised account numbers, credentials, MAC addresses or IP addresses; inventing
                them would be fabricating intelligence about real banks, so those fields are not shown.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Institutions', value: FINANCIAL_SOURCE.institutions.toLocaleString() },
                { label: 'GA branches', value: totalBranches.toLocaleString() },
                { label: 'GA deposits', value: money(totalDeposits) },
                { label: 'Sourced events', value: liveCount.toLocaleString() },
                { label: 'Attributed to a bank', value: attrs.length.toLocaleString() },
              ].map((stat) => (
                <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
                  <div className="text-sm font-bold text-emerald-300">{stat.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                Sort
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortMode)}
                  className="bg-zinc-900/80 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="deposits">deposits</option>
                  <option value="county">county</option>
                  <option value="name">name</option>
                </select>
              </label>
              <button
                onClick={handleExportInstitutions}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-200 border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
              >
                <Download size={11} /> Export institutions
              </button>
              <button
                onClick={() => handleExportEvents(attrs, 'georgia-financial')}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-200 border border-zinc-700 rounded px-2 py-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-200"
              >
                <Download size={11} /> Export live events
              </button>
              <div className="relative w-full sm:w-auto sm:ml-auto">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter institution or county"
                  className="pl-7 pr-6 py-1 w-full sm:w-60 bg-zinc-900/80 border border-zinc-700 rounded text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-3">
              <div className="border border-zinc-800 rounded overflow-hidden min-w-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#070f12]">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Building2 size={12} className="text-emerald-400" />
                    Institutions ({sortedInstitutions.length})
                  </span>
                  <span className="text-[9px] text-zinc-600">sorted by {sort}</span>
                </div>
                <InstitutionTable
                  institutions={sortedInstitutions}
                  selectedId={selected?.id ?? ''}
                  onSelect={select}
                  onOpen={openPage}
                  sort={sort}
                  matchCount={matchCount}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <div className="border border-zinc-800 rounded bg-[#070f12] p-2">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                      <MapPin size={12} className="text-emerald-400" />
                      Institution map
                    </span>
                    <span className="text-[9px] text-zinc-600">{markers.length} placed</span>
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
                      const hits = liveByInstitution.get(inst.id)?.length ?? 0;
                      return (
                        <g key={inst.id} onClick={() => select(inst.id)} className="cursor-pointer">
                          <circle
                            cx={inst.marker.x}
                            cy={inst.marker.y}
                            r={isSelected ? radius + 4 : radius}
                            fill={isSelected ? '#34d399' : hits ? '#f59e0b' : '#4b5563'}
                            fillOpacity={isSelected ? 0.95 : hits ? 0.85 : 0.45}
                            stroke={isSelected ? '#a7f3d0' : '#9ca3af'}
                            strokeWidth={isSelected ? 2 : 0.7}
                          />
                          <title>
                            {inst.name} · {inst.primary.name} · {fmtCoords(inst.marker.x, inst.marker.y)} ·{' '}
                            {money(inst.depositsUsd)} · {hits} sourced events
                          </title>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex flex-wrap items-center gap-3 px-1 pt-1 text-[9px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> selected
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> has sourced events
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-zinc-500" /> no events
                    </span>
                  </div>
                </div>

                {selected && (
                  <div className="border border-zinc-800 rounded bg-[#070f12] px-3 py-2 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px] font-bold text-emerald-200 leading-snug min-w-0">{selected.name}</div>
                      <button
                        onClick={() => openPage(selected.id)}
                        className="text-[9px] uppercase tracking-wider text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-[1px] shrink-0 cursor-pointer hover:bg-emerald-950/50"
                      >
                        Dossier
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="text-zinc-500">
                        Primary market
                        <div className="text-zinc-200">{selected.primary.name} County</div>
                      </div>
                      <div className="text-zinc-500">
                        Coordinates
                        <div className="text-zinc-200 tabular-nums">{fmtCoords(selected.marker.x, selected.marker.y)}</div>
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
                  </div>
                )}
              </div>
            </div>

            <div className="border border-zinc-800 rounded bg-[#070f12]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Activity size={12} className="text-emerald-400" />
                  Live OSINT stream
                </span>
                <span className="text-[9px] text-zinc-600">{liveCount} events this session</span>
              </div>
              <div className="divide-y divide-zinc-900 max-h-[320px] overflow-auto">
                {live.slice(0, 40).map(eventRow)}
                {!live.length && (
                  <div className="px-3 py-3 text-[10.5px] text-zinc-500">
                    Waiting for the stream. Events arrive as the OSINT pollers publish, with the publisher
                    and timestamp they carry.
                  </div>
                )}
              </div>
            </div>

            {selected && (
              <div className="border border-zinc-800 rounded bg-[#070f12] px-3 py-2">
                <IndicatorPanel institution={selected} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
