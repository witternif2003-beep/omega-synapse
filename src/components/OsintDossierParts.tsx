import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { FINANCIAL_INSTITUTIONS } from '../data/georgiaFinancialInstitutions.ts';
import { GA_BANK_FILERS } from '../data/gaBankFilers.ts';
import type { TransferPattern } from '../lib/osintPeople.ts';
import { INDICATOR_DISCLAIMER, tradeValue, usd, type DeepRow, type SodProfile } from '../lib/osintIndicatorTypes.ts';
import type { GeorgiaInstitution, OsintTransaction } from '../lib/osintClient.ts';

/**
 * ULTRA DEEP DIVE PANELS, SHARED PIECES
 *
 * The family grid, the pattern list and the transaction ledger used by both dossiers. Every
 * value is computed in the browser from payloads the server fetched from the publishers.
 */

const TONE: Record<string, string> = {
  risk: '#f44336',
  watch: '#ffb300',
  steady: '#00e676',
  info: '#22d3ee',
};

const num = (value: number): string => (Number.isFinite(value) ? value.toLocaleString('en-US') : '—');

const norm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function sodProfile(institution: GeorgiaInstitution): SodProfile | null {
  const target = norm(institution.name).replace(/ national association$/, '');
  const match =
    FINANCIAL_INSTITUTIONS.find((entry) => norm(entry.name) === target) ??
    FINANCIAL_INSTITUTIONS.find((entry) => norm(entry.name).startsWith(target)) ??
    null;
  if (!match) return null;
  return {
    name: match.name,
    branches: match.branches,
    depositsUsd: match.depositsUsd,
    counties: match.countyCount,
    primaryCounty: match.primary.name,
    primaryDepositsUsd: match.primary.depositsUsd,
  };
}

export function filerForInstitution(institution: GeorgiaInstitution): string | null {
  const target = norm(institution.name).replace(/ national association$/, '');
  const match =
    GA_BANK_FILERS.find((filer) => norm(filer.bank) === target) ??
    GA_BANK_FILERS.find((filer) => norm(filer.bank).startsWith(target) && target.length >= 6) ??
    null;
  return match?.cik ?? null;
}

export function FamilyGrid({ rows, caption }: { rows: DeepRow[]; caption: string }) {
  const families = useMemo(() => {
    const map = new Map<string, { label: string; rows: DeepRow[] }>();
    for (const row of rows) {
      if (!map.has(row.family)) map.set(row.family, { label: row.family, rows: [] });
      map.get(row.family)!.rows.push(row);
    }
    return map;
  }, [rows]);
  const [active, setActive] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (active !== 'ALL' && row.family !== active) return false;
      if (!needle) return true;
      return `${row.label} ${row.value} ${row.basis}`.toLowerCase().includes(needle);
    });
  }, [active, query, rows]);
  const computed = rows.filter((row) => row.computed).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-widest text-emerald-300">
          // 14 families × 20 measures — {rows.length} indicators per entity
        </span>
        <span className="text-[9px] text-zinc-500">
          {computed} computed from published inputs · {rows.length - computed} input not published
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search measure, basis or value"
          className="ml-auto bg-black/60 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 w-56"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActive('ALL')}
          className={`px-2 py-0.5 text-[9px] rounded border cursor-pointer ${
            active === 'ALL' ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50' : 'border-zinc-700 text-zinc-400'
          }`}
        >
          ALL
        </button>
        {[...families.entries()].map(([id, group]) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-2 py-0.5 text-[9px] rounded border capitalize cursor-pointer ${
              active === id ? 'border-emerald-400 text-emerald-200 bg-emerald-950/50' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            {group.label} ({group.rows.length})
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1">
        {visible.map((row) => (
          <div key={row.key} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[8.5px] uppercase tracking-wider text-zinc-500 leading-tight" title={row.label}>
                {row.label}
              </span>
              <span
                className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TONE[row.tone] ?? '#4b5563' }}
              />
            </div>
            <div className="text-[11px] font-bold text-zinc-100 break-words">{row.value}</div>
            <div className="mt-0.5 text-[8px] text-zinc-600 leading-tight" title={`${row.basis} — ${row.source}`}>
              {row.basis}
            </div>
            <div className="text-[8px] text-zinc-700">{row.source}</div>
          </div>
        ))}
      </div>
      {visible.length === 0 && <div className="text-[10px] text-zinc-500">No measure matches that search.</div>}
      <div className="text-[8.5px] text-zinc-600 leading-relaxed">
        {caption} {INDICATOR_DISCLAIMER}
      </div>
    </div>
  );
}

export function PatternList({ patterns }: { patterns: TransferPattern[] }) {
  if (!patterns.length) {
    return (
      <div className="text-[10px] text-zinc-500">
        No pattern screen fired on the reported lines. Screens: late filing, near-total disposition,
        exercise-and-sell, gift, indirect holding, no 10b5-1 flag, size outlier, weekend-dated trade,
        withholding lot, cluster selling, single-owner dominance, price dispersion, rapid round trip.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {patterns.map((pattern) => (
        <div key={pattern.id} className="border border-zinc-800 rounded px-2 py-1.5 bg-[#060d10]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="text-[8px] uppercase tracking-widest px-1 py-[1px] rounded"
              style={{
                color: TONE[pattern.severity === 'critical' ? 'risk' : pattern.severity === 'high' ? 'watch' : 'info'],
                border: `1px solid ${TONE[pattern.severity === 'critical' ? 'risk' : pattern.severity === 'high' ? 'watch' : 'info']}55`,
              }}
            >
              {pattern.severity}
            </span>
            <span className="text-[10px] text-zinc-200 font-semibold">{pattern.label}</span>
            <span className="text-[8.5px] text-zinc-500 ml-auto">{pattern.category}</span>
          </div>
          <div className="text-[9.5px] text-zinc-400 mt-0.5">{pattern.detail}</div>
          <div className="text-[8px] text-zinc-600 mt-0.5">threshold: {pattern.basis}</div>
        </div>
      ))}
    </div>
  );
}

export function TransactionLedger({ lines, limit = 40 }: { lines: OsintTransaction[]; limit?: number }) {
  if (!lines.length) {
    return <div className="text-[10px] text-zinc-500">No transaction line to show.</div>;
  }
  return (
    <div className="overflow-auto max-h-[260px] border border-zinc-800 rounded">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-[#0a1418] text-[8px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-2 py-1 font-normal">Traded</th>
            <th className="px-2 py-1 font-normal">Code</th>
            <th className="px-2 py-1 font-normal text-right">Shares</th>
            <th className="px-2 py-1 font-normal text-right">Price</th>
            <th className="px-2 py-1 font-normal text-right">Value</th>
            <th className="px-2 py-1 font-normal text-right">Held after</th>
            <th className="px-2 py-1 font-normal">Owner</th>
            <th className="px-2 py-1 font-normal">Own.</th>
            <th className="px-2 py-1 font-normal">Plan</th>
            <th className="px-2 py-1 font-normal">Filed</th>
            <th className="px-2 py-1 font-normal">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {lines.slice(0, limit).map((line, index) => {
            const value = tradeValue(line);
            return (
              <tr key={`${line.accession}-${index}`} className="border-t border-zinc-900/70 text-[9.5px]">
                <td className="px-2 py-0.5 text-zinc-300 tabular-nums">{line.traded || '—'}</td>
                <td className="px-2 py-0.5 text-emerald-300">{line.code || '—'}</td>
                <td className="px-2 py-0.5 text-right text-zinc-300 tabular-nums">
                  {line.shares >= 0 ? num(line.shares) : '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-zinc-400 tabular-nums">
                  {line.price > 0 ? `$${line.price.toFixed(2)}` : '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-zinc-200 tabular-nums">
                  {Number.isFinite(value) ? usd(value) : '—'}
                </td>
                <td className="px-2 py-0.5 text-right text-zinc-400 tabular-nums">
                  {line.after >= 0 ? num(line.after) : '—'}
                </td>
                <td className="px-2 py-0.5 text-zinc-400 truncate max-w-[160px]">{line.owner}</td>
                <td className="px-2 py-0.5 text-zinc-500">{line.ownership === 'I' ? 'indirect' : 'direct'}</td>
                <td className="px-2 py-0.5 text-zinc-500">{line.tenb5one ? '10b5-1' : 'none'}</td>
                <td className="px-2 py-0.5 text-zinc-500 tabular-nums">{line.filed || '—'}</td>
                <td className="px-2 py-0.5">
                  <a href={line.url} target="_blank" rel="noreferrer" className="text-emerald-400">
                    <ArrowUpRight size={10} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lines.length > limit && (
        <div className="px-2 py-1 text-[8.5px] text-zinc-600 border-t border-zinc-800">
          showing {limit} of {lines.length} reported lines
        </div>
      )}
    </div>
  );
}
