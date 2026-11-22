import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, Clock, DollarSign, Fingerprint, Layers, Radar, Search } from 'lucide-react';
import {
  CRIME_FAMILIES,
  FAMILY_BY_KEY,
  SEVERITY_COLOR,
  SEVERITY_RANK,
  usd,
  type CrimeFamily,
  type CrimeIncident,
} from '../lib/crimeEngine.ts';
import { sinceLabel, useCrimeQueue } from '../lib/crimeQueue.ts';

/**
 * FINANCIAL CRIME QUEUE
 *
 * The queue view of the anomaly engine: every incident with its dollar amount, the
 * methodology that recovers that amount, the incident facts, the evidence links and the
 * recognition codes that fired. Incidents are queued in this browser the first time they are
 * seen and stay numbered while the same records keep arriving, so a refresh does not shuffle
 * a row the reader is looking at — new detections announce themselves with a NEW badge.
 *
 * These are threshold screens over published records. No row is a finding of a crime, and no
 * account number, wire, credential, MAC address or IP address appears anywhere.
 */

const FAMILY_FILTERS: Array<{ key: 'ALL' | CrimeFamily; label: string }> = [
  { key: 'ALL', label: 'ALL' },
  ...CRIME_FAMILIES.map((family) => ({ key: family.key as 'ALL' | CrimeFamily, label: family.label })),
];

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="text-[8px] font-bold px-1.5 py-[1px] rounded border shrink-0 whitespace-nowrap"
      style={{ borderColor: color, color }}
    >
      {text}
    </span>
  );
}

export function IncidentBody({ incident }: { incident: CrimeIncident }) {
  return (
    <div className="space-y-2 px-3 pb-3 pt-1">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border border-zinc-800 bg-[#060d10] rounded px-2.5 py-2">
        <div>
          <div className="text-[8.5px] uppercase tracking-widest text-zinc-500">Amount at issue</div>
          <div className="text-[16px] font-bold text-amber-200 tabular-nums leading-tight">{usd(incident.amountUsd)}</div>
          <div className="text-[9px] text-zinc-500 leading-snug">{incident.amountBasis}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Chip text={incident.severity.toUpperCase()} color={SEVERITY_COLOR[incident.severity]} />
          <Chip text={incident.patternId} color="#22d3ee" />
          <Chip text={incident.confidence.toUpperCase()} color="#a3e635" />
          {incident.sourceAt && <Chip text={`RECORD ${incident.sourceAt.slice(0, 10)}`} color="#71717a" />}
        </div>
      </div>

      <div className="border border-emerald-900/50 rounded bg-emerald-950/10 px-2.5 py-2 space-y-1.5">
        <div className="text-[9px] uppercase tracking-widest text-emerald-300 flex items-center gap-1">
          <Fingerprint size={10} /> Methodology — how this figure is recovered
        </div>
        <div className="text-[10px] text-zinc-200 font-mono bg-black/40 border border-zinc-800 rounded px-2 py-1 break-words">
          {incident.methodology.formula}
        </div>
        <ol className="space-y-0.5">
          {incident.methodology.steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className="text-[9.5px] text-zinc-400 leading-snug flex gap-1.5">
              <span className="text-emerald-500 tabular-nums shrink-0">{index + 1}.</span>
              <span>
                <span className="text-zinc-300">{step.label}:</span> {step.detail}
              </span>
            </li>
          ))}
        </ol>
        <div className="text-[9px] text-amber-200/90 leading-snug">
          <span className="uppercase tracking-wider text-amber-300/80">Threshold applied:</span> {incident.methodology.threshold}
        </div>
        <div className="text-[9px] text-zinc-500 leading-snug">
          <span className="uppercase tracking-wider text-zinc-400">Reverse it:</span> {incident.methodology.reverse}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="border border-zinc-800 rounded px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Incident details</div>
          <dl className="space-y-0.5">
            {incident.details.map((detail, index) => (
              <div key={`${detail.label}-${index}`} className="flex justify-between gap-2 text-[9.5px]">
                <dt className="text-zinc-500 shrink-0">{detail.label}</dt>
                <dd className="text-zinc-300 text-right break-words">{detail.value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 text-[9.5px]">
              <dt className="text-zinc-500 shrink-0">Subject</dt>
              <dd className="text-zinc-300 text-right break-words">{incident.subject}</dd>
            </div>
            <div className="flex justify-between gap-2 text-[9.5px]">
              <dt className="text-zinc-500 shrink-0">Institution</dt>
              <dd className="text-zinc-300 text-right break-words">{incident.institution}</dd>
            </div>
          </dl>
        </div>

        <div className="border border-zinc-800 rounded px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Evidence and sources</div>
          <div className="space-y-1">
            {incident.evidence.map((evidence, index) => (
              <div key={`${evidence.label}-${index}`} className="text-[9.5px] text-zinc-400 flex items-start gap-1.5">
                <span className="text-emerald-500 shrink-0">›</span>
                <span className="min-w-0">
                  <span className="text-zinc-300">{evidence.label}</span>
                  {evidence.value ? ` · ${evidence.value}` : ''}
                  {evidence.url && (
                    <a
                      href={evidence.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 text-emerald-300 underline decoration-dotted"
                    >
                      open
                    </a>
                  )}
                </span>
              </div>
            ))}
            {incident.sources.map((source) =>
              source.startsWith('http') ? (
                <a key={source} href={source} target="_blank" rel="noreferrer" className="block text-[9px] text-emerald-400/80 truncate underline decoration-dotted">
                  {source}
                </a>
              ) : (
                <div key={source} className="text-[9px] text-zinc-600">
                  {source}
                </div>
              ),
            )}
          </div>
          <div className="mt-1.5 text-[8.5px] uppercase tracking-widest text-zinc-500">Pattern recognition</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {incident.patterns.map((pattern) => (
              <Chip key={pattern} text={pattern} color="#22d3ee" />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[8.5px] text-zinc-600 leading-relaxed">
        Derived screen over published fields. It flags a threshold, not a finding of wrongdoing, and the formula above
        is the whole derivation — every input is printed so the incident can be recomputed by hand. {FAMILY_BY_KEY[incident.family].note}.
      </p>
    </div>
  );
}

export interface CrimeQueuePanelProps {
  incidents: CrimeIncident[];
  /** What this queue covers, e.g. "all 125 Georgia charters" or "7 insiders at this company". */
  scope: string;
  note: string;
  refreshing?: boolean;
  max?: number;
}

export function CrimeQueuePanel({ incidents, scope, note, refreshing = false, max = 80 }: CrimeQueuePanelProps) {
  const queue = useCrimeQueue(incidents);
  const [family, setFamily] = useState<'ALL' | CrimeFamily>('ALL');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return queue.all
      .filter((entry) => (family === 'ALL' ? true : entry.family === family))
      .filter((entry) => {
        if (!needle) return true;
        return `${entry.title} ${entry.subject} ${entry.institution} ${entry.patternId}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, max);
  }, [queue.all, family, query, max]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const recurring = queue.patterns.filter((pattern) => pattern.recurring);
  const activeFamilies = queue.families.slice(0, 8);

  return (
    <div className="border border-amber-900/50 rounded bg-[#0a0c07]">
      <div className="px-3 py-2 border-b border-amber-900/40 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Radar size={13} className="text-amber-300 shrink-0" />
          <span className="text-[10px] uppercase tracking-widest text-amber-200">Financial crime detection queue</span>
          <span className="text-[9px] text-zinc-500">{scope}</span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
          <Chip text={`QUEUED ${queue.total}`} color="#fbbf24" />
          <Chip text={`NEW ${queue.newCount}`} color="#f87171" />
          <Chip text={`${usd(queue.amountUsd)} SCREENED`} color="#22d3ee" />
          <Chip text={`${queue.patterns.length} PATTERNS`} color="#a3e635" />
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-amber-900/30 flex flex-wrap items-center gap-1.5">
        {FAMILY_FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFamily(option.key)}
            className={`px-2 py-0.5 text-[9px] rounded border cursor-pointer ${
              family === option.key
                ? 'border-amber-400 text-amber-200 bg-amber-950/40'
                : 'border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {option.label}
            {option.key !== 'ALL' && ` (${queue.families.find((row) => row.key === option.key)?.count ?? 0})`}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={11} className="absolute left-2 top-1.5 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="subject, bank or pattern code"
            className="bg-black/60 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 w-52"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 px-3 py-2 border-b border-amber-900/30">
        <div className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5">
          <div className="text-[8.5px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
            <Activity size={9} /> In queue
          </div>
          <div className="text-[13px] font-bold text-amber-200 tabular-nums">{queue.total}</div>
          <div className="text-[8px] text-zinc-600">across {activeFamilies.length} families</div>
        </div>
        <div className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5">
          <div className="text-[8.5px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
            <DollarSign size={9} /> Dollars screened
          </div>
          <div className="text-[13px] font-bold text-amber-200 tabular-nums">{usd(queue.amountUsd)}</div>
          <div className="text-[8px] text-zinc-600">{queue.withAmount} of {queue.total} carry a published figure</div>
        </div>
        <div className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5">
          <div className="text-[8.5px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
            <Fingerprint size={9} /> Patterns matched
          </div>
          <div className="text-[13px] font-bold text-amber-200 tabular-nums">{queue.patterns.length}</div>
          <div className="text-[8px] text-zinc-600">{recurring.length} recurring across 3+ entities</div>
        </div>
        <div className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1.5">
          <div className="text-[8.5px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
            <Clock size={9} /> Last detection
          </div>
          <div className="text-[13px] font-bold text-amber-200 tabular-nums">
            {queue.lastSeen ? sinceLabel(queue.clock - queue.lastSeen) : '—'}
          </div>
          <div className="text-[8px] text-zinc-600">queue refreshes with the stream</div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-amber-900/30">
        <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1">
          <Layers size={9} /> Pattern recognition — which screen is recurring
        </div>
        <div className="flex flex-wrap gap-1">
          {queue.patterns.slice(0, 12).map((pattern) => (
            <span
              key={pattern.patternId}
              title={`${pattern.count} incident(s) across ${pattern.entities} subject(s); pattern recurs across the published set`}
              className={`text-[8.5px] px-1.5 py-[1px] rounded border tabular-nums ${
                pattern.recurring
                  ? 'border-rose-500/60 text-rose-200 bg-rose-950/30'
                  : 'border-zinc-700 text-zinc-400'
              }`}
            >
              {pattern.patternId} · {pattern.count}× · {pattern.entities} subject{pattern.entities === 1 ? '' : 's'}
              {pattern.recurring ? ' · recurring' : ''}
            </span>
          ))}
          {queue.patterns.length === 0 && (
            <span className="text-[9px] text-zinc-600">No pattern has fired on the records loaded so far.</span>
          )}
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto divide-y divide-zinc-900/70">
        {visible.length === 0 && (
          <div className="px-3 py-5 text-[10px] text-zinc-500 leading-relaxed">
            Nothing in this queue matches the filter. The engine only reports what the published fields support; an
            empty queue is a result, not a gap to fill.
          </div>
        )}
        {visible.map((entry) => {
          const isOpen = open.has(entry.id);
          return (
            <div key={entry.id} className={entry.isNew ? 'bg-rose-950/10' : ''}>
              <button
                onClick={() => toggle(entry.id)}
                className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-white/[0.03] cursor-pointer"
                aria-expanded={isOpen}
              >
                <span className="text-[9px] text-zinc-600 tabular-nums w-6 shrink-0 pt-0.5">#{entry.queueNo}</span>
                <Chip text={entry.severity.toUpperCase()} color={SEVERITY_COLOR[entry.severity]} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-zinc-200 leading-snug">{entry.title}</span>
                  <span className="block text-[9px] text-zinc-500 truncate">
                    {FAMILY_BY_KEY[entry.family].label} · {entry.subject} · {entry.patternId}
                    {entry.isNew ? ' · NEW' : ` · queued ${sinceLabel(queue.clock - entry.seenAt)}`}
                  </span>
                </span>
                <span className="text-[10.5px] font-bold text-amber-200 tabular-nums shrink-0 pt-0.5">
                  {usd(entry.amountUsd)}
                </span>
                <ChevronDown
                  size={12}
                  className={`text-zinc-500 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && <IncidentBody incident={entry} />}
            </div>
          );
        })}
        {visible.length < queue.total && (
          <div className="px-3 py-2 text-[9px] text-zinc-600">
            Showing the {visible.length} highest-ranked of {queue.total} queued incidents — narrow the family filter or
            search to see the rest.
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-amber-900/30 text-[8.5px] leading-relaxed text-zinc-600">
        {note} Every row prints its dollar basis, formula, inputs and threshold; amounts are reported figures or a
        stated arithmetic over them, never an estimate, and a line with no published price carries no dollar figure.
      </div>
    </div>
  );
}

/** Compact per-subject list, used inside the individuals panel for the selected person. */
export function CrimeIncidentList({
  incidents,
  title,
  note,
}: {
  incidents: CrimeIncident[];
  title: string;
  note: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = useMemo(
    () => [...incidents].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.amountUsd ?? 0) - (a.amountUsd ?? 0)),
    [incidents],
  );
  const total = sorted.reduce((sum, incident) => sum + (incident.amountUsd ?? 0), 0);

  return (
    <div className="border border-amber-900/40 rounded bg-[#0a0c07]">
      <div className="px-2.5 py-1.5 border-b border-amber-900/30 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-widest text-amber-200 flex items-center gap-1">
          <AlertTriangle size={10} /> {title}
        </span>
        <span className="text-[9px] text-zinc-500">
          {sorted.length} incident{sorted.length === 1 ? '' : 's'} · {usd(total)} at issue
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="px-2.5 py-2 text-[9.5px] text-zinc-500">
          No crime screen fired on this person’s published filings. Absence here is not clearance: it means the fields
          that were published did not cross a printed threshold.
        </div>
      ) : (
        <div className="divide-y divide-zinc-900/70">
          {sorted.map((incident) => {
            const isOpen = open.has(incident.id);
            return (
              <div key={incident.id}>
                <button
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(incident.id)) next.delete(incident.id);
                      else next.add(incident.id);
                      return next;
                    })
                  }
                  className="w-full text-left px-2.5 py-1.5 flex items-start gap-2 hover:bg-white/[0.03] cursor-pointer"
                >
                  <Chip text={incident.severity.toUpperCase()} color={SEVERITY_COLOR[incident.severity]} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10.5px] text-zinc-200 leading-snug">{incident.title}</span>
                    <span className="block text-[9px] text-zinc-500 truncate">
                      {FAMILY_BY_KEY[incident.family].label} · {incident.patternId} · {incident.methodology.threshold}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-amber-200 tabular-nums shrink-0">{usd(incident.amountUsd)}</span>
                  <ChevronDown size={11} className={`text-zinc-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && <IncidentBody incident={incident} />}
              </div>
            );
          })}
        </div>
      )}
      <div className="px-2.5 py-1.5 border-t border-amber-900/30 text-[8.5px] text-zinc-600 leading-relaxed">{note}</div>
    </div>
  );
}
