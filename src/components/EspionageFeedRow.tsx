import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, ChevronDown, Landmark, Users } from 'lucide-react';
import { FINANCIAL_SOURCE } from '../data/georgiaFinancialInstitutions.ts';
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
  PRIORITY_COLOR,
  classifyAnomaly,
  priorityBand,
  priorityScore,
  type PriorityBand,
} from '../lib/sourcedAnomaly.ts';
import { BEACON_TTL_MS } from '../lib/anomalyBeacon.ts';
import {
  KIND_COLOR,
  KIND_LABEL,
  filingFromLive,
  indicatorsForItem,
  institutionByName,
  loadFilingDetail,
  relativeTime,
  type OsintFilingDetailPayload,
  type OsintInsiderPayload,
  type OsintItem,
} from '../lib/osintClient.ts';

/**
 * LIVE OSINT STREAM ROW
 *
 * One record published by an external source, with the detail panel it opens: publisher,
 * timestamp, source link, the institutions and individuals the record names, the twenty
 * financial-forensic indicators computed for it, and the button that opens the 280-measure
 * administrative dossier for the charter it names.
 *
 * No account number, login, credential, MAC address or IP address appears anywhere: no
 * public record publishes one for these banks or people.
 */

interface FeedRowProps {
  item: OsintItem;
  index: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  onDeepDive: (institutionName: string) => void;
}

export const TONE_COLOR: Record<string, string> = {
  risk: '#f44336',
  watch: '#ffb300',
  steady: '#00e676',
  plain: '#4b5563',
};

export function IndicatorGrid({ rows, caption }: { rows: IndicatorRow[]; caption: string }) {
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

export function FilingDetail({ item }: { item: OsintItem }) {
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

export const FeedRow = memo(function FeedRow({ item, index, expanded, onToggle, onDeepDive }: FeedRowProps) {
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

          {detail.institution ? (
            <button
              onClick={() => onDeepDive(detail.institution!.name)}
              className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-widest border border-emerald-500/50 rounded px-2 py-1 text-emerald-200 hover:bg-emerald-950/40 cursor-pointer"
            >
              <Building2 size={11} /> admin deep dive — 280 institution indicators, FDIC quarters, insider lines
            </button>
          ) : (
            <div className="text-[9px] text-zinc-600">
              This record names no single charter, so no institution dossier is attached. The twenty-point set
              above is computed from statewide FDIC totals.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function peopleFromLive(data: OsintInsiderPayload): { people: PersonView[]; filings: ReturnType<typeof filingFromLive>[] } {
  const filings = data.filings.map((row) => filingFromLive(row, data.issuer));
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

export type RoleFilter = 'ALL' | 'EMPLOYEE' | 'DIRECTOR' | 'OWNER' | 'OTHER';
