import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { FINANCIAL_INSTITUTIONS } from '../data/georgiaFinancialInstitutions.ts';
import { GA_BANK_FILERS } from '../data/gaBankFilers.ts';
import { aggregatePeople, transferPatterns, type PersonAggregate } from '../lib/osintPeople.ts';
import {
  loadFinancials,
  quarterLabel,
  type GaFinancial,
  type GaFinancialPayload,
} from '../lib/osintFinancials.ts';
import {
  count,
  evaluate,
  pct,
  sum,
  tradeValue,
  usd,
  usdThousands,
  type InstitutionContext,
  type PersonContext,
  type SodProfile,
} from '../lib/osintIndicatorTypes.ts';
import { INSTITUTION_FAMILIES } from '../lib/osintInstitutionIndicators.ts';
import { INDIVIDUAL_FAMILIES } from '../lib/osintIndividualIndicators.ts';
import {
  loadInsiders,
  type GeorgiaInstitution,
  type OsintFilingRow,
  type OsintInsiderPayload,
  type OsintItem,
} from '../lib/osintClient.ts';
import { FamilyGrid, PatternList, TransactionLedger } from './OsintDossierParts.tsx';

export { FamilyGrid, PatternList, TransactionLedger } from './OsintDossierParts.tsx';

/**
 * ULTRA DEEP DIVE PANELS
 *
 * The administrative view of one institution or one person: the FDIC quarterly financial
 * series, every reported Form 4 transaction line, the transfer-pattern screens, and the
 * fourteen indicator families of twenty measures each. Every value is computed in the
 * browser from payloads the server fetched from the publishers.
 */

const num = (value: number): string => (Number.isFinite(value) ? value.toLocaleString('en-US') : '—');

const norm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function sodProfile(institution: GeorgiaInstitution): SodProfile | null {
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

function filerForInstitution(institution: GeorgiaInstitution): string | null {
  const target = norm(institution.name).replace(/ national association$/, '');
  const match =
    GA_BANK_FILERS.find((filer) => norm(filer.bank) === target) ??
    GA_BANK_FILERS.find((filer) => norm(filer.bank).startsWith(target) && target.length >= 6) ??
    null;
  return match?.cik ?? null;
}

let financialsCache: Promise<GaFinancialPayload> | null = null;

function useFinancials(): GaFinancialPayload | null {
  const [payload, setPayload] = useState<GaFinancialPayload | null>(null);
  useEffect(() => {
    if (!financialsCache) financialsCache = loadFinancials();
    financialsCache.then(setPayload).catch(() => setPayload(null));
  }, []);
  return payload;
}

function TrendTable({ fin }: { fin: GaFinancial }) {
  const rows: Array<{ label: string; values: number[]; format: (value: number) => string }> = [
    { label: 'Assets', values: fin.asset, format: (value) => usdThousands(value, 2) },
    { label: 'Deposits', values: fin.dep, format: (value) => usdThousands(value, 2) },
    { label: 'Equity', values: fin.eq, format: (value) => usdThousands(value, 2) },
    { label: 'Net income', values: fin.netinc, format: (value) => usdThousands(value, 2) },
    { label: 'ROA', values: fin.roa, format: (value) => `${value.toFixed(2)}%` },
    { label: 'Noncurrent', values: fin.nclnr, format: (value) => `${value.toFixed(2)}%` },
  ];
  return (
    <div className="overflow-auto border border-zinc-800 rounded">
      <table className="w-full text-left">
        <thead className="bg-[#0a1418] text-[8px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-2 py-1 font-normal">Measure</th>
            {fin.quarters.map((quarter) => (
              <th key={quarter} className="px-2 py-1 font-normal text-right">
                {quarterLabel(quarter)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-zinc-900/70 text-[9.5px]">
              <td className="px-2 py-0.5 text-zinc-400">{row.label}</td>
              {row.values.map((value, index) => (
                <td key={`${row.label}-${index}`} className="px-2 py-0.5 text-right text-zinc-200 tabular-nums">
                  {Number.isFinite(value) ? row.format(value) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-2 py-1 text-[8px] text-zinc-600 border-t border-zinc-800">
        FDIC Reports of Condition and Income, one column per filed quarter. Dollar figures in thousands as filed.
      </div>
    </div>
  );
}

export function InstitutionDossier({
  institution,
  institutions,
  items,
  onClose,
}: {
  institution: GeorgiaInstitution;
  institutions: GeorgiaInstitution[];
  items: OsintItem[];
  onClose: () => void;
}) {
  const financials = useFinancials();
  const [insider, setInsider] = useState<OsintInsiderPayload | null>(null);
  const [insiderState, setInsiderState] = useState<'idle' | 'loading' | 'done'>('idle');

  const cik = useMemo(() => filerForInstitution(institution), [institution]);
  useEffect(() => {
    if (!cik) {
      setInsiderState('done');
      return;
    }
    setInsiderState('loading');
    loadInsiders(cik)
      .then((payload) => {
        setInsider(payload);
        setInsiderState('done');
      })
      .catch(() => setInsiderState('done'));
  }, [cik]);

  const fin = financials?.institutions?.[institution.cert] ?? null;
  const peer = financials?.peer ?? null;
  const sod = useMemo(() => sodProfile(institution), [institution]);
  const sorted = useMemo(
    () => [...institutions].sort((a, b) => b.assetsThousands - a.assetsThousands),
    [institutions],
  );
  const sodSorted = useMemo(
    () =>
      [...institutions].sort((a, b) => {
        const left = sodProfile(a)?.depositsUsd ?? 0;
        const right = sodProfile(b)?.depositsUsd ?? 0;
        return right - left;
      }),
    [institutions],
  );

  const context: InstitutionContext = useMemo(() => {
    const named = items.filter((item) => item.institutions.some((name) => norm(name) === norm(institution.name)));
    return {
      inst: institution,
      sod,
      fin,
      peer,
      items: named,
      filings: insider?.filings ?? [],
      transactions: insider?.transactions ?? [],
      statewide: {
        depositsUsd: FINANCIAL_INSTITUTIONS.reduce((total, entry) => total + entry.depositsUsd, 0),
        branches: FINANCIAL_INSTITUTIONS.reduce((total, entry) => total + entry.branches, 0),
        institutions: institutions.length,
      },
      ranks: {
        assets: sorted.findIndex((entry) => entry.cert === institution.cert) + 1,
        deposits: sodSorted.findIndex((entry) => entry.cert === institution.cert) + 1,
      },
    };
  }, [fin, insider, institution, institutions, items, peer, sod, sodSorted, sorted]);

  const rows = useMemo(() => evaluate(INSTITUTION_FAMILIES, context), [context]);
  const patterns = useMemo(() => transferPatterns(insider?.transactions ?? []), [insider]);

  return (
    <div className="border border-emerald-700/40 rounded bg-[#050b0e]">
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-emerald-400">// Institution deep dive</div>
          <div className="text-sm font-bold text-white">{institution.name}</div>
          <div className="text-[10px] text-zinc-400">
            {institution.city || 'city not filed'} · FDIC cert {institution.cert || '—'} ·{' '}
            {institution.holdingCompany || 'no holding company filed'}
          </div>
          <div className="text-[9px] text-zinc-600">
            {fin
              ? `call report ${quarterLabel(fin.quarters[fin.quarters.length - 1] ?? '')} · retrieved ${financials?.retrieved ?? ''}`
              : financials?.error
                ? `FDIC quarterly financials unavailable right now (${financials.error}); the figures below read “input not published” rather than a guess`
                : financials
                  ? 'no FDIC quarterly record for this certificate'
                  : 'reading FDIC quarterly financials…'}
            {cik ? ` · SEC filer CIK ${cik}` : ' · no SEC filer matched this charter'}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white border border-zinc-700 rounded px-2 py-1 cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-1.5">
          {[
            ['Assets', fin ? usdThousands(fin.latest.asset) : '—'],
            ['Deposits', fin ? usdThousands(fin.latest.dep) : '—'],
            ['Equity', fin ? usdThousands(fin.latest.eq) : '—'],
            ['Equity ratio', fin ? pct((fin.latest.eq / fin.latest.asset) * 100) : '—'],
            ['ROA', fin ? `${fin.latest.roa.toFixed(2)}%` : '—'],
            ['Noncurrent', fin ? `${fin.latest.nclnr.toFixed(2)}%` : '—'],
            ['Charge-offs', fin ? `${fin.latest.ntlnr.toFixed(2)}%` : '—'],
            ['GA branches', sod ? num(sod.branches) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1">
              <div className="text-[8px] uppercase tracking-wider text-zinc-500">{label}</div>
              <div className="text-[12px] font-bold text-zinc-100 tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {fin ? <TrendTable fin={fin} /> : null}

        <div>
          <div className="text-[9px] uppercase tracking-widest text-emerald-300 mb-1">
            // Reported insider transfers at this bank
          </div>
          {insiderState === 'loading' && <div className="text-[10px] text-zinc-500">Reading Form 4 filings from EDGAR…</div>}
          {insiderState === 'done' && !insider?.ok && (
            <div className="text-[10px] text-zinc-500">
              No SEC Form 4 filings are published for this charter or its holding company.
            </div>
          )}
          {insider?.ok && (
            <div className="space-y-2">
              <div className="text-[9px] text-zinc-500">
                {insider.issuer.name} · {insider.filings.length} Form 4 filings ·{' '}
                {(insider.transactions ?? []).length} reported lines · cache{' '}
                {Math.round((insider.cacheSeconds ?? 0) / 86400)} days
              </div>
              <PatternList patterns={patterns} />
              <TransactionLedger lines={insider.transactions ?? []} />
            </div>
          )}
        </div>

        <FamilyGrid
          rows={rows}
          caption={`Fourteen institution families for ${institution.name}, computed from its FDIC call report, the FDIC Summary of Deposits, its Form 4 filings and the live feed.`}
        />
      </div>
    </div>
  );
}

export function PersonDossier({
  personKey,
  payload,
  institutions,
  items,
  onClose,
}: {
  personKey: string;
  payload: OsintInsiderPayload;
  institutions: GeorgiaInstitution[];
  items: OsintItem[];
  onClose: () => void;
}) {
  const financials = useFinancials();
  const people = useMemo(() => aggregatePeople(payload), [payload]);
  const person: PersonAggregate | null = useMemo(
    () => people.find((entry) => entry.key === personKey) ?? people[0] ?? null,
    [people, personKey],
  );

  const institution = useMemo(() => {
    if (!person) return null;
    const target = norm(person.bank);
    return (
      institutions.find((entry) => norm(entry.name) === target) ??
      institutions.find((entry) => norm(entry.name).startsWith(target) && target.length >= 6) ??
      null
    );
  }, [institutions, person]);

  const fin = institution ? financials?.institutions?.[institution.cert] ?? null : null;
  const context: PersonContext | null = useMemo(() => {
    if (!person) return null;
    return {
      person,
      issuerFilings: payload.filings,
      issuerTransactions: payload.transactions ?? [],
      fin,
      peer: financials?.peer ?? null,
      inst: institution,
      items: items.filter((item) =>
        item.institutions.some((name) => norm(name) === norm(person.bank)) ||
        item.people.some((name) => norm(name) === norm(person.name)),
      ),
    };
  }, [fin, financials, institution, items, payload, person]);

  const rows = useMemo(() => (context ? evaluate(INDIVIDUAL_FAMILIES, context) : []), [context]);
  const patterns = useMemo(
    () => (person ? transferPatterns(payload.transactions ?? [], person.name) : []),
    [payload, person],
  );
  const saleValue = useMemo(
    () =>
      sum(
        (person?.transactions ?? [])
          .filter((line) => line.code === 'S')
          .map((line) => tradeValue(line))
          .filter((value) => Number.isFinite(value)),
      ),
    [person],
  );
  const buyValue = useMemo(
    () =>
      sum(
        (person?.transactions ?? [])
          .filter((line) => line.code === 'P')
          .map((line) => tradeValue(line))
          .filter((value) => Number.isFinite(value)),
      ),
    [person],
  );

  if (!person) {
    return <div className="text-[10px] text-zinc-500">No person selected.</div>;
  }

  return (
    <div className="border border-emerald-700/40 rounded bg-[#050b0e]">
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-emerald-400">// Individual deep dive</div>
          <div className="text-sm font-bold text-white">{person.name}</div>
          <div className="text-[10px] text-zinc-400">
            {person.role} · {person.issuerName} · {person.bank}
          </div>
          <div className="text-[9px] text-zinc-600">
            {person.roleClass} · contractor status not published · CIK {person.cik}
            {institution ? ` · FDIC cert ${institution.cert}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white border border-zinc-700 rounded px-2 py-1 cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-1.5">
          {[
            ['Reported lines', num(person.transactions.length)],
            ['Sale value', saleValue ? usd(saleValue) : '—'],
            ['Purchase value', buyValue ? usd(buyValue) : '—'],
            ['Net', saleValue || buyValue ? usd(Math.abs(saleValue - buyValue)) : '—'],
            ['Filings', num(person.filings.length)],
            ['Screens fired', num(patterns.length)],
            ['Bank NPL', fin ? `${fin.latest.nclnr.toFixed(2)}%` : '—'],
            ['Bank equity', fin ? pct((fin.latest.eq / fin.latest.asset) * 100) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="border border-zinc-800 bg-[#060d10] rounded px-2 py-1">
              <div className="text-[8px] uppercase tracking-wider text-zinc-500">{label}</div>
              <div className="text-[12px] font-bold text-zinc-100 tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest text-emerald-300 mb-1">
            // Transfer pattern screens for this person
          </div>
          <PatternList patterns={patterns} />
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest text-emerald-300 mb-1">
            // Every reported transaction line
          </div>
          <TransactionLedger lines={person.transactions} limit={60} />
        </div>

        <FamilyGrid
          rows={rows}
          caption={`Fourteen individual families for ${person.name}, computed from their Form 4 documents plus the FDIC figures for ${institution?.name ?? person.bank}.`}
        />
      </div>
    </div>
  );
}

/** Kept for the coverage table: number of institutions the deep dive can rank. */
export const DEEP_DIVE_SCOPE = (rows: GeorgiaInstitution[]): string =>
  `${rows.length} charters · ${count(rows.filter((row) => row.cert).length)} with an FDIC certificate`;
export type { OsintFilingRow };
