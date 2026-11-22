import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  Info,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { GA_BANK_FILER_SOURCE } from '../data/gaBankFilers.ts';
import {
  ANOMALY_CLASSES,
  PRIORITY_COLOR,
  classifyAnomaly,
  priorityBand,
  priorityScore,
  type PriorityBand,
} from '../lib/sourcedAnomaly.ts';
import { publishAnomalyBeacon } from '../lib/anomalyBeacon.ts';
import { InstitutionDossier, PersonDossier } from './OsintDeepDive.tsx';
import { FeedRow } from './EspionageFeedRow.tsx';
import { IndividualsPanel, CoveragePanel } from './EspionagePanels.tsx';
import type { SourceFilter } from './EspionagePanels.tsx';
import {
  KIND_LABEL,
  institutionByName,
  loadFeed,
  relativeTime,
  type GeorgiaInstitution,
  type OsintFeedPayload,
  type OsintInsiderPayload,
} from '../lib/osintClient.ts';

/**
 * ESPIONAGE OPERATIONS - LIVE OSINT STREAM
 *
 * Every row is a record published by an external source: an SEC EDGAR filing, a Federal
 * Register document, a Federal Reserve or Justice Department release, an FDIC press
 * release, or an OFAC action. The feed is fetched from the server, which fetched it from
 * those publishers; nothing is seeded in the browser.
 *
 * Opening a row shows the detail page for that record and the button that opens the
 * 280-measure administrative dossier for the charter it names: fourteen families of twenty
 * measures, the FDIC quarterly series, every reported Form 4 line and the transfer-pattern
 * screens. A person's dossier opens from the individuals panel. Those families and screens
 * are labelled derivations because the FBI has not published such a list, and no wire or
 * account record is published for these banks.
 *
 * No account number, login, credential, MAC address or IP address appears anywhere: no
 * public record publishes one for these banks or people, and inventing one would be
 * fabrication.
 */

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
  const [dossier, setDossier] = useState<
    | { kind: 'institution'; inst: GeorgiaInstitution }
    | { kind: 'person'; key: string; payload: OsintInsiderPayload }
    | null
  >(null);

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

  const openInstitution = (name: string) => {
    const inst = institutionByName(name) ?? feed?.institutions.find((row) => row.name === name) ?? null;
    if (inst) setDossier({ kind: 'institution', inst });
    else setNotice(`${name} is not in the FDIC institution list, so its quarterly dossier cannot be loaded`);
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
            <span className="px-2 py-0.5 border border-cyan-500/40 bg-cyan-950/40 text-cyan-200 text-[10px] rounded">
              ADMIN MODE · 280 INDICATORS PER ENTITY
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
            publisher’s own text names it. Opening a bank or a person shows the administrative dossier: two hundred
            and eighty measures in fourteen families, the FDIC quarterly series, every reported Form 4 line and the
            transfer-pattern screens. Those families and screens are labelled derivations because the FBI has not
            published such a list, no wire or account record is published for these banks, and no account number,
            login, credential, MAC address or IP address is shown or invented.
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

        {dossier?.kind === 'institution' && (
          <InstitutionDossier
            institution={dossier.inst}
            institutions={feed?.institutions ?? []}
            items={feed?.items ?? []}
            onClose={() => setDossier(null)}
          />
        )}
        {dossier?.kind === 'person' && (
          <PersonDossier
            personKey={dossier.key}
            payload={dossier.payload}
            institutions={feed?.institutions ?? []}
            items={feed?.items ?? []}
            onClose={() => setDossier(null)}
          />
        )}

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
                  onDeepDive={openInstitution}
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

        <IndividualsPanel
          institutions={feed?.institutions ?? []}
          items={feed?.items ?? []}
          onDeepDive={(key, payload) => setDossier({ kind: 'person', key, payload })}
        />

        <CoveragePanel
          rows={feed?.institutions ?? []}
          onOpen={(inst) => setDossier({ kind: 'institution', inst })}
        />

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
