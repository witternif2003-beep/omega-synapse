import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Download,
  Info,
  Radio,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import {
  FINANCIAL_INSTITUTIONS,
  FINANCIAL_SOURCE,
  matchInstitution,
  type FinancialInstitution,
} from '../data/georgiaFinancialInstitutions.ts';
import {
  INSIDER_FILINGS,
  INSIDER_SOURCE,
  type InsiderFiling,
} from '../data/insiderFilings.ts';
import {
  anomalyIndicators,
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
import { BEACON_TTL_MS, publishAnomalyBeacon } from '../lib/anomalyBeacon.ts';
import { exportEvents, type SourcedEvent } from '../lib/ledgerExport.ts';

/**
 * ESPIONAGE OPERATIONS - SOURCED ONLY
 *
 * Three panels, all of them driven by published records:
 *
 *   1. Continuous anomaly feed - the dashboard's own live event stream. Each event shows
 *      the headline, publisher, timestamp and a link to the source, and expands to the
 *      twenty institution indicators computed from that institution's FDIC figures.
 *   2. Priority register - every tax and finance family this stream can classify, ranked
 *      by the sorting rule in sourcedAnomaly.ts (reported severity, institution size,
 *      recency). A family with no events shows zero rather than disappearing.
 *   3. Individuals - named officers, directors and owners taken from their own SEC Form 4
 *      filings, each with twenty individual indicators computed from the filing fields
 *      and the FDIC figures of the bank their issuer operates.
 *
 * The generated records that used to fill this tab (170 fabricated anomaly dossiers,
 * fabricated logins, accounts, firmware findings) are gone. No account number, login,
 * credential, MAC address or IP address is shown: no source publishes one, so none is
 * invented here.
 */

interface FeedEvent extends SourcedEvent {
  summary?: string;
}

type LinkState = 'connecting' | 'live' | 'offline';

const TONE_COLOR: Record<string, string> = {
  risk: '#f44336',
  watch: '#ffb300',
  steady: '#00e676',
  plain: '#4b5563',
};

const BY_ID = new Map(FINANCIAL_INSTITUTIONS.map((inst) => [inst.id, inst]));

const PEOPLE: PersonView[] = (() => {
  const grouped = new Map<string, InsiderFiling[]>();
  for (const filing of INSIDER_FILINGS) {
    const key = `${filing.issuer.key}:${filing.owner}`;
    const list = grouped.get(key) ?? [];
    list.push(filing);
    grouped.set(key, list);
  }
  const people: PersonView[] = [];
  for (const [key, filings] of grouped) {
    const sorted = [...filings].sort((a, b) => b.filed.localeCompare(a.filed));
    const latest = sorted[0];
    people.push({
      key,
      owner: latest.owner,
      issuerKey: latest.issuer.key,
      issuerName: latest.issuer.name,
      bank: latest.issuer.bank,
      role: roleText(latest.roleBits, latest.title),
      roleClass: roleClass(latest.roleBits),
      filings: sorted,
      latest,
      institution: institutionForBank(latest.issuer.bank),
    });
  }
  return people.sort((a, b) => b.latest.filed.localeCompare(a.latest.filed));
})();

const OFFICER_COUNT = PEOPLE.filter((person) => person.roleClass === 'ISSUER EMPLOYEE').length;
const DIRECTOR_COUNT = PEOPLE.filter((person) => person.roleClass === 'NON-EMPLOYEE DIRECTOR').length;

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
            <div className="text-[8.5px] uppercase tracking-wider text-zinc-500 leading-tight truncate" title={row.label}>
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

const FeedRow = memo(function FeedRow({
  event,
  index,
  institution,
  expanded,
  onToggle,
}: {
  event: FeedEvent;
  index: number;
  institution: FinancialInstitution | null;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const cls = classifyAnomaly(`${event.title} ${event.summary ?? ''}`);
  const score = priorityScore(event.severity, event.ts, institution);
  const band = priorityBand(score);
  const secondsLeft = Math.max(0, Math.round((Date.parse(event.ts) + BEACON_TTL_MS - Date.now()) / 1000));
  return (
    <div className="border-t border-zinc-900">
      <button
        onClick={() => onToggle(event.id)}
        className="w-full text-left px-2 py-1.5 flex items-start gap-2 hover:bg-white/[0.03] cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="text-[9px] text-zinc-600 tabular-nums w-6 shrink-0 pt-0.5">{index + 1}</span>
        <span
          className="text-[8.5px] font-bold px-1.5 py-[1px] rounded shrink-0 border"
          style={{ borderColor: PRIORITY_COLOR[band], color: PRIORITY_COLOR[band] }}
        >
          {band}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-zinc-200 leading-snug">{event.title}</span>
          <span className="block text-[9px] text-zinc-500 mt-0.5">
            {cls.label} · {event.source} · {new Date(event.ts).toISOString().slice(0, 16).replace('T', ' ')}Z
            {institution ? ` · ${institution.name}` : ' · unattributed'}
            {secondsLeft > 0 ? ' · strobe active' : ''}
          </span>
        </span>
        <span className="text-[10px] text-zinc-500 tabular-nums shrink-0 pt-0.5">{score}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {event.summary && <p className="text-[10px] text-zinc-400 leading-relaxed">{event.summary}</p>}
          {institution ? (
            <IndicatorGrid
              rows={anomalyIndicators(institution, event.id)}
              caption={`derived from FDIC SOD ${FINANCIAL_SOURCE.surveyYear} figures for ${institution.name}`}
            />
          ) : (
            <p className="text-[10px] text-zinc-500">
              This headline names no FDIC-insured institution, so the institution indicator set is
              not applied. Its source record is the headline, publisher and link above.
            </p>
          )}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-emerald-300 underline decoration-dotted"
            >
              open the source record <ArrowUpRight size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
});

export default function EspionageOperations() {
  const [live, setLive] = useState<FeedEvent[]>([]);
  const [linkState, setLinkState] = useState<LinkState>('connecting');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [personQuery, setPersonQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'EMPLOYEE' | 'DIRECTOR'>('ALL');
  const [selectedPerson, setSelectedPerson] = useState<string>(PEOPLE[0]?.key ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const pendingRef = useRef<FeedEvent[]>([]);

  // Live OSINT stream. Frames are buffered and flushed twice a second so a burst of
  // headlines cannot re-render the ranked register on every frame.
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
            summary: payload.summary,
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
        // Raise a two-minute beacon on the map for every attributed event.
        for (const event of batch) {
          if (!event.institutionId) continue;
          const inst = BY_ID.get(event.institutionId);
          if (!inst) continue;
          publishAnomalyBeacon({
            id: event.id,
            county: inst.primary.name,
            x: inst.marker.x,
            y: inst.marker.y,
            label: event.title,
            severity: event.severity,
          });
        }
        setLive((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const fresh = batch.filter((item) => !seen.has(item.id));
          return fresh.length ? [...fresh.reverse(), ...prev].slice(0, 250) : prev;
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

  const ranked = useMemo(() => {
    return live
      .map((event) => {
        const inst = event.institutionId ? BY_ID.get(event.institutionId) ?? null : null;
        const cls = classifyAnomaly(`${event.title} ${event.summary ?? ''}`);
        const score = priorityScore(event.severity, event.ts, inst);
        return { event, inst, cls, score, band: priorityBand(score) };
      })
      .sort((a, b) => b.score - a.score);
  }, [live]);

  const byFamily = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of ranked) counts.set(row.cls.key, (counts.get(row.cls.key) ?? 0) + 1);
    return ANOMALY_CLASSES.map((family) => ({ ...family, count: counts.get(family.key) ?? 0 }));
  }, [ranked]);

  const people = useMemo(() => {
    const needle = personQuery.trim().toLowerCase();
    const list = PEOPLE.filter((person) => {
      if (roleFilter === 'EMPLOYEE' && person.roleClass !== 'ISSUER EMPLOYEE') return false;
      if (roleFilter === 'DIRECTOR' && person.roleClass !== 'NON-EMPLOYEE DIRECTOR') return false;
      if (!needle) return true;
      return `${person.owner} ${person.issuerName} ${person.bank} ${person.role}`.toLowerCase().includes(needle);
    });
    return list.slice(0, 120);
  }, [personQuery, roleFilter]);

  const person = useMemo(
    () => PEOPLE.find((item) => item.key === selectedPerson) ?? PEOPLE[0] ?? null,
    [selectedPerson],
  );

  const personIndicators = useMemo(
    () => (person ? individualIndicators(person, INSIDER_FILINGS) : []),
    [person],
  );

  const personEvents = useMemo(() => {
    if (!person?.institution) return [];
    return ranked.filter((row) => row.inst?.id === person.institution?.id).slice(0, 6);
  }, [person, ranked]);

  const liveInstitutions = useMemo(() => {
    const set = new Set<string>();
    for (const event of live) if (event.institutionId) set.add(event.institutionId);
    return set.size;
  }, [live]);

  const handleExport = () => {
    if (!live.length) {
      setNotice('No sourced events captured yet this session - nothing to export');
      return;
    }
    const count = exportEvents(
      live.map((event) => ({
        id: event.id,
        institutionId: event.institutionId,
        institutionName: event.institutionName,
        severity: event.severity,
        title: event.title,
        source: event.source,
        ts: event.ts,
        url: event.url,
      })),
      'espionage',
    );
    setNotice(`Exported ${count} sourced anomaly events to CSV`);
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
              // Espionage Operations — Sourced Anomaly Feed
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              SOURCED ONLY
            </span>
            <span className="px-2 py-0.5 border border-zinc-700 bg-zinc-900/70 text-zinc-400 text-[10px] rounded">
              {INSIDER_SOURCE.filings} FORM 4 FILINGS · {PEOPLE.length} PEOPLE
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  linkState === 'live'
                    ? 'bg-emerald-400 animate-pulse'
                    : linkState === 'offline'
                      ? 'bg-rose-500'
                      : 'bg-amber-400'
                }`}
              />
              <Radio size={11} className="text-zinc-500" />
              {linkState === 'live' ? 'LIVE STREAM' : linkState === 'offline' ? 'STREAM RETRYING' : 'CONNECTING'}
            </span>
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
            <strong className="text-emerald-300">Every row names its source.</strong> Anomaly rows
            are events from this dashboard's own monitored stream, shown with the publisher,
            timestamp and link the stream carried; they are not presented as confirmed incidents.
            People are named only because they filed a Form 4 with the U.S. Securities and Exchange
            Commission, and the filing opens from each row. Institution figures are the FDIC Summary
            of Deposits {FINANCIAL_SOURCE.surveyYear} Georgia response. No account number, login,
            credential, MAC address or IP address is shown or invented, and the twenty-point sets
            are labelled derivations because the FBI has not published such a list.
          </p>
        </div>

        {notice && (
          <div className="border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 text-[10.5px] rounded px-3 py-1.5">
            {notice}
          </div>
        )}

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Live anomalies', value: live.length.toLocaleString() },
            { label: 'Institutions named', value: liveInstitutions.toLocaleString() },
            { label: 'Insiders on file', value: PEOPLE.length.toLocaleString() },
            { label: 'Officers / directors', value: `${OFFICER_COUNT} / ${DIRECTOR_COUNT}` },
          ].map((stat) => (
            <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">{stat.label}</div>
              <div className="text-[13px] font-bold text-emerald-300 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Feed + priority register */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="border border-zinc-800 rounded bg-[#070f12]">
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                <Activity size={12} /> Continuous anomaly feed
              </span>
              <span className="text-[9px] text-zinc-500">
                {ranked.length} events · tap a row for its 20 indicators
              </span>
            </div>
            <div className="max-h-[460px] overflow-auto">
              {ranked.length === 0 ? (
                <div className="px-3 py-6 text-[10.5px] text-zinc-500 leading-relaxed">
                  No sourced anomaly has arrived since this page opened. The feed shows only events
                  the stream publishes; it does not seed itself with invented records.
                </div>
              ) : (
                ranked.map((row, index) => (
                  <FeedRow
                    key={row.event.id}
                    event={row.event}
                    index={index}
                    institution={row.inst}
                    expanded={expanded.has(row.event.id)}
                    onToggle={toggle}
                  />
                ))
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
            <div className="max-h-[200px] overflow-auto divide-y divide-zinc-900">
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
            <div className="border-t border-zinc-800 max-h-[230px] overflow-auto">
              {ranked.slice(0, 25).map((row, index) => (
                <div key={`rank-${row.event.id}`} className="px-3 py-1 flex items-start gap-2 text-[10px] border-b border-zinc-900/60">
                  <span className="text-zinc-600 tabular-nums w-5 shrink-0">{index + 1}</span>
                  <span
                    className="text-[8.5px] font-bold px-1.5 rounded border shrink-0"
                    style={{ borderColor: PRIORITY_COLOR[row.band as PriorityBand], color: PRIORITY_COLOR[row.band as PriorityBand] }}
                  >
                    {row.band}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-zinc-300 truncate">{row.event.title}</span>
                    <span className="block text-[9px] text-zinc-600">
                      {row.cls.label} · {row.event.source}
                      {row.inst ? ` · ${row.inst.name}` : ' · unattributed'}
                    </span>
                  </span>
                  <span className="tabular-nums text-zinc-500">{row.score}</span>
                </div>
              ))}
              {ranked.length === 0 && (
                <div className="px-3 py-4 text-[10px] text-zinc-600">
                  Register empty until a sourced event arrives.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Individuals */}
        <div className="border border-zinc-800 rounded bg-[#070f12]">
          <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
              <UserRound size={12} /> Individuals at Georgia banks
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `ALL (${PEOPLE.length})` },
                { id: 'EMPLOYEE', label: `OFFICERS (${OFFICER_COUNT})` },
                { id: 'DIRECTOR', label: `DIRECTORS (${DIRECTOR_COUNT})` },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setRoleFilter(option.id as typeof roleFilter)}
                  className={`px-2 py-0.5 text-[9.5px] rounded border cursor-pointer ${
                    roleFilter === option.id
                      ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50'
                      : 'border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1.5 text-zinc-500" />
                <input
                  value={personQuery}
                  onChange={(event) => setPersonQuery(event.target.value)}
                  placeholder="name, bank or role"
                  className="bg-black/60 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 w-44"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="max-h-[420px] overflow-auto border-b lg:border-b-0 lg:border-r border-zinc-800">
              {people.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSelectedPerson(item.key)}
                  className={`w-full text-left px-3 py-1.5 border-b border-zinc-900/70 cursor-pointer ${
                    item.key === person?.key ? 'bg-emerald-950/40' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-200 truncate">{item.owner}</span>
                    <span className="text-[9px] text-zinc-500 shrink-0">{item.latest.filed}</span>
                  </div>
                  <div className="text-[9px] text-zinc-500 truncate">
                    {item.role} · {item.issuerName} ({item.latest.issuer.ticker})
                  </div>
                  <div className="text-[8.5px] text-zinc-600">
                    {item.roleClass} · {item.filings.length} filing(s)
                  </div>
                </button>
              ))}
              {people.length === 0 && (
                <div className="px-3 py-4 text-[10px] text-zinc-500">No person matches that filter.</div>
              )}
            </div>

            <div className="p-3 space-y-3 min-w-0">
              {person ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-widest text-zinc-500">Individual dossier</div>
                      <div className="text-sm font-bold text-white">{person.owner}</div>
                      <div className="text-[10px] text-zinc-400">
                        {person.role} · {person.issuerName} ({person.latest.issuer.ticker}) · CIK {person.latest.issuer.cik}
                      </div>
                      <div className="text-[9px] text-zinc-600 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <Building2 size={10} /> {person.bank}
                        <span className="px-1.5 py-[1px] border border-zinc-700 rounded">{person.roleClass}</span>
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
                    rows={personIndicators}
                    caption="each value read from this person's Form 4 fields and the FDIC figures for their bank"
                  />

                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">
                      Filings on record
                    </div>
                    <div className="space-y-1">
                      {person.filings.slice(0, 4).map((filing) => (
                        <a
                          key={`${filing.id}-${filing.filed}`}
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

                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">
                      Live anomalies naming this bank
                    </div>
                    {personEvents.length === 0 ? (
                      <div className="text-[10px] text-zinc-600">
                        No sourced event this session has named {person.institution?.name ?? person.bank}.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {personEvents.map((row) => (
                          <button
                            key={row.event.id}
                            onClick={() => toggle(row.event.id)}
                            className="w-full text-left text-[10px] border border-zinc-800 rounded px-2 py-1 hover:border-emerald-600 cursor-pointer"
                          >
                            <span className="text-zinc-300">{row.event.title}</span>
                            <span className="block text-[9px] text-zinc-600">
                              {row.cls.label} · {row.event.source} · {row.band} ({row.score})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-zinc-500">No individual selected.</div>
              )}
            </div>
          </div>
        </div>

        <p className="text-[9px] text-zinc-600 leading-relaxed">
          Sources: {INSIDER_SOURCE.publisher} {INSIDER_SOURCE.form}; FDIC Summary of Deposits{' '}
          {FINANCIAL_SOURCE.surveyYear} Georgia response; the dashboard's own live event stream for
          headlines. Map beacons are raised only for stream events that name an FDIC institution and
          each lasts two minutes.
        </p>
      </div>
    </section>
  );
}
