/**
 * INSTITUTION INDICATOR FAMILIES, SECOND SET, FIRST MODULE
 *
 * Credit mix, deposit behaviour and market share. The supervision, insider-role, filing
 * compliance and record-integrity families live in the companion module and are re-exported here.
 */

import { safeRatio, seriesGrowth, stdev } from './osintFinancials.ts';
import {
  count,
  pct,
  sum,
  usd,
  usdThousands,
  type Family,
  type InstitutionContext,
  type RuleResult,
} from './osintIndicatorTypes.ts';
import { INSTITUTION_FAMILIES_B2 } from './osintInstitutionIndicatorsB2.ts';

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: InstitutionContext) => RuleResult,
) => ({ key, label, basis, source, run });

const REPORT = 'FDIC call report';
const SOD = 'FDIC Summary of Deposits';

const fin = (c: InstitutionContext) => c.fin?.latest ?? null;

const creditMix: Family<InstitutionContext> = {
  id: 'credit-mix',
  label: 'Credit mix & lending',
  blurb: 'What the balance sheet is lent out to, and how much of the loan book is impaired or provisioned.',
  rules: [
    rule('loans-assets', 'Loans to assets', 'LNLSNET ÷ ASSET', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(safeRatio(row.lnlsnet, row.asset)) : null;
    }),
    rule('loans-deposits', 'Loans to deposits', 'LNLSNET ÷ DEP', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(safeRatio(row.lnlsnet, row.dep)) : null;
    }),
    rule('securities-assets', 'Securities to assets', 'SCAF ÷ ASSET', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(safeRatio(row.scaf, row.asset)) : null;
    }),
    rule('securities-loans', 'Securities to loans', 'SCAF ÷ LNLSNET', REPORT, (c) => {
      const row = fin(c);
      return row && row.lnlsnet ? `${(row.scaf / row.lnlsnet).toFixed(2)}×` : null;
    }),
    rule('loans-per-branch', 'Loans per Georgia branch', 'LNLSNET ÷ SOD branches', SOD, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands(row.lnlsnet / c.sod.branches) : null;
    }),
    rule('loans-per-employee', 'Loans per employee', 'LNLSNET ÷ NUMEMP', REPORT, (c) => {
      const row = fin(c);
      return row && row.numemp ? usdThousands(row.lnlsnet / row.numemp) : null;
    }),
    rule('noncurrent-loans', 'Noncurrent loans over total loans', 'NCLNLSR as filed', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(row.nclnr, 3) : null;
    }),
    rule('pastdue-loans', 'Past-due loans over assets', '(P3ASSET + P9ASSET) ÷ ASSET', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(safeRatio(row.p3 + row.p9, row.asset), 3) : null;
    }),
    rule('chargeoffs-loans', 'Charge-offs over loans', 'NTLNLSR as filed', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(row.ntlnr, 3) : null;
    }),
    rule('provision-loans', 'Provision over loans', 'ELNATR ÷ LNLSNET', REPORT, (c) => {
      const row = fin(c);
      return row && row.lnlsnet ? pct(safeRatio(row.elnatr, row.lnlsnet), 3) : null;
    }),
    rule('equity-loans', 'Equity over loans', 'EQ ÷ LNLSNET', REPORT, (c) => {
      const row = fin(c);
      return row && row.lnlsnet ? pct(safeRatio(row.eq, row.lnlsnet)) : null;
    }),
    rule('brokered-loans', 'Brokered deposits over loans', 'BRO ÷ LNLSNET', REPORT, (c) => {
      const row = fin(c);
      return row && row.lnlsnet ? pct(safeRatio(row.bro, row.lnlsnet)) : null;
    }),
    rule('loans-per-county', 'Loans per county served', 'LNLSNET ÷ SOD counties', SOD, (c) => {
      const row = fin(c);
      return row && c.sod?.counties ? usdThousands(row.lnlsnet / c.sod.counties) : null;
    }),
    rule('loans-per-million-deposits', 'Loans per million dollars of deposits', 'LNLSNET ÷ (DEP ÷ 1000)', REPORT, (c) => {
      const row = fin(c);
      return row && row.dep ? usdThousands(row.lnlsnet / (row.dep / 1000)) : null;
    }),
    rule('noncurrent-per-branch', 'Noncurrent loans per branch', 'NCLNLS ÷ SOD branches', REPORT, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands(row.ncln / c.sod.branches) : null;
    }),
    rule('pastdue-per-branch', 'Past-due loans per branch', '(P3ASSET + P9ASSET) ÷ SOD branches', REPORT, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands((row.p3 + row.p9) / c.sod.branches) : null;
    }),
    rule('provision-per-branch', 'Provision per branch', 'ELNATR ÷ SOD branches', REPORT, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands(row.elnatr / c.sod.branches) : null;
    }),
    rule('securities-per-branch', 'Securities per branch', 'SCAF ÷ SOD branches', REPORT, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands(row.scaf / c.sod.branches) : null;
    }),
    rule('non-earning-assets', 'Assets outside loans and securities', 'ASSET − LNLSNET − SCAF', REPORT, (c) => {
      const row = fin(c);
      return row ? usdThousands(row.asset - row.lnlsnet - row.scaf) : null;
    }),
    rule('earning-share', 'Lending and securities share of assets', '(LNLSNET + SCAF) ÷ ASSET', REPORT, (c) => {
      const row = fin(c);
      return row ? pct(safeRatio(row.lnlsnet + row.scaf, row.asset)) : null;
    }),
  ],
};

const deposits: Family<InstitutionContext> = {
  id: 'deposit-behaviour',
  label: 'Deposit behaviour & branch footprint',
  blurb: 'How the deposit base moved inside the eight-quarter window and how it distributes across branches and counties.',
  rules: [
    rule('window-change', 'Deposit change across the window', 'first DEP → latest DEP', REPORT, (c) =>
      c.fin && c.fin.dep.length > 1 ? usdThousands(c.fin.dep[c.fin.dep.length - 1] - c.fin.dep[0]) : null),
    rule('quarters-reported', 'Quarters in the series', 'count of filed quarters', REPORT, (c) =>
      c.fin ? count(c.fin.quarters.length) : null),
    rule('quarters-declining', 'Quarters with falling deposits', 'count of DEP declines', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 2) return null;
      let falls = 0;
      for (let i = 1; i < c.fin.dep.length; i += 1) if (c.fin.dep[i] < c.fin.dep[i - 1]) falls += 1;
      return count(falls);
    }),
    rule('largest-drop', 'Largest quarterly deposit drop', 'min quarterly DEP change', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 2) return null;
      let worst = 0;
      for (let i = 1; i < c.fin.dep.length; i += 1) {
        if (c.fin.dep[i - 1]) {
          const change = ((c.fin.dep[i] - c.fin.dep[i - 1]) / c.fin.dep[i - 1]) * 100;
          if (change < worst) worst = change;
        }
      }
      return pct(worst);
    }),
    rule('largest-gain', 'Largest quarterly deposit gain', 'max quarterly DEP change', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 2) return null;
      let best = 0;
      for (let i = 1; i < c.fin.dep.length; i += 1) {
        if (c.fin.dep[i - 1]) {
          const change = ((c.fin.dep[i] - c.fin.dep[i - 1]) / c.fin.dep[i - 1]) * 100;
          if (change > best) best = change;
        }
      }
      return pct(best);
    }),
    rule('volatility', 'Deposit volatility', 'standard deviation of quarterly DEP growth', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 4) return null;
      const changes: number[] = [];
      for (let i = 1; i < c.fin.dep.length; i += 1) {
        const prior = c.fin.dep[i - 1];
        if (prior) changes.push(((c.fin.dep[i] - prior) / prior) * 100);
      }
      return `${stdev(changes).toFixed(2)} pts`;
    }),
    rule('stability', 'Deposit stability index', '1 − coefficient of variation of DEP', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 4) return null;
      const mean = sum(c.fin.dep) / c.fin.dep.length;
      if (!mean) return null;
      const cv = (stdev(c.fin.dep) / mean) * 100;
      return `${(100 - cv).toFixed(1)} / 100`;
    }),
    rule('deposits-per-county', 'Deposits per county served', 'DEP ÷ SOD counties', SOD, (c) => {
      const row = fin(c);
      return row && c.sod?.counties ? usdThousands(row.dep / c.sod.counties) : null;
    }),
    rule('deposits-per-branch', 'Deposits per branch', 'DEP ÷ SOD branches', SOD, (c) => {
      const row = fin(c);
      return row && c.sod?.branches ? usdThousands(row.dep / c.sod.branches) : null;
    }),
    rule('branch-vs-state', 'Deposits per branch versus the Georgia average', 'institution ÷ statewide deposits per branch', SOD, (c) => {
      const row = fin(c);
      if (!row || !c.sod?.branches || !c.statewide.depositsUsd || !c.statewide.branches) return null;
      const mine = (row.dep * 1000) / c.sod.branches;
      const state = c.statewide.depositsUsd / c.statewide.branches;
      return `${(mine / state).toFixed(2)}×`;
    }),
    rule('primary-county-deposits', 'Deposits held in the primary county', 'SOD primary county deposits', SOD, (c) =>
      c.sod ? usd(c.sod.primaryDepositsUsd) : null),
    rule('other-county-deposits', 'Deposits held outside the primary county', 'SOD total − primary county', SOD, (c) =>
      c.sod ? usd(c.sod.depositsUsd - c.sod.primaryDepositsUsd) : null),
    rule('concentration', 'Deposit concentration in one county', 'primary ÷ total SOD deposits', SOD, (c) => {
      if (!c.sod) return null;
      const ratio = safeRatio(c.sod.primaryDepositsUsd, c.sod.depositsUsd);
      return { value: pct(ratio), tone: ratio > 75 ? 'watch' : 'info' };
    }),
    rule('branches', 'Branches in Georgia', 'SOD branch count', SOD, (c) => (c.sod ? count(c.sod.branches) : null)),
    rule('counties', 'Counties served', 'distinct SOD counties', SOD, (c) => (c.sod ? count(c.sod.counties) : null)),
    rule('counties-per-branch', 'Counties per branch', 'counties ÷ branches', SOD, (c) =>
      c.sod && c.sod.branches ? (c.sod.counties / c.sod.branches).toFixed(2) : null),
    rule('branch-share', 'Share of Georgia branches', 'branches ÷ statewide branches', SOD, (c) =>
      c.sod && c.statewide.branches ? pct(safeRatio(c.sod.branches, c.statewide.branches), 3) : null),
    rule('latest-vs-average', 'Latest deposit change against the window average', 'latest quarterly growth − mean quarterly growth', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 3) return null;
      const changes: number[] = [];
      for (let i = 1; i < c.fin.dep.length; i += 1) {
        const prior = c.fin.dep[i - 1];
        if (prior) changes.push(((c.fin.dep[i] - prior) / prior) * 100);
      }
      if (!changes.length) return null;
      const latest = changes[changes.length - 1];
      const average = changes.reduce((total, value) => total + value, 0) / changes.length;
      return `${(latest - average).toFixed(2)} pts`;
    }),
    rule('deposit-growth-vs-assets', 'Deposit growth minus asset growth', 'DEP growth − ASSET growth, latest quarter', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 2) return null;
      const gap = seriesGrowth(c.fin.dep, 1) - seriesGrowth(c.fin.asset, 1);
      return { value: `${gap.toFixed(2)} pts`, tone: gap < -3 ? 'watch' : 'info' };
    }),
    rule('deposit-change-per-branch', 'Deposit change per branch', 'window DEP change ÷ branches', REPORT, (c) => {
      if (!c.fin || c.fin.dep.length < 2 || !c.sod?.branches) return null;
      const change = c.fin.dep[c.fin.dep.length - 1] - c.fin.dep[0];
      return usdThousands(change / c.sod.branches);
    }),
  ],
};

const market: Family<InstitutionContext> = {
  id: 'market-share',
  label: 'Market share & peer rank',
  blurb: 'Where the charter sits inside the Georgia market, measured by deposits, branches and counties.',
  rules: [
    rule('deposit-share', 'Share of Georgia branch deposits', 'SOD deposits ÷ statewide SOD', SOD, (c) =>
      c.sod && c.statewide.depositsUsd ? pct(safeRatio(c.sod.depositsUsd, c.statewide.depositsUsd), 4) : null),
    rule('branch-share', 'Share of Georgia branches', 'branches ÷ statewide branches', SOD, (c) =>
      c.sod && c.statewide.branches ? pct(safeRatio(c.sod.branches, c.statewide.branches), 4) : null),
    rule('assets-rank', 'Asset rank', 'rank by FDIC ASSET', REPORT, (c) =>
      c.ranks.assets ? `#${c.ranks.assets} of ${c.statewide.institutions}` : null),
    rule('deposit-rank', 'Deposit rank', 'rank by SOD deposits', SOD, (c) =>
      c.ranks.deposits ? `#${c.ranks.deposits} of ${c.statewide.institutions}` : null),
    rule('deposits-vs-average', 'Deposits against the statewide average charter', 'SOD deposits ÷ statewide average', SOD, (c) => {
      if (!c.sod || !c.statewide.institutions) return null;
      const average = c.statewide.depositsUsd / c.statewide.institutions;
      return `${(c.sod.depositsUsd / average).toFixed(2)}×`;
    }),
    rule('branches-vs-average', 'Branches against the statewide average', 'branches ÷ statewide average', SOD, (c) => {
      if (!c.sod || !c.statewide.institutions) return null;
      const average = c.statewide.branches / c.statewide.institutions;
      return `${(c.sod.branches / average).toFixed(2)}×`;
    }),
    rule('counties-of-state', 'Share of Georgia’s 159 counties', 'counties ÷ 159', SOD, (c) =>
      c.sod ? pct(safeRatio(c.sod.counties, 159)) : null),
    rule('county-density', 'Counties per charter compared with the state', 'institution counties ÷ statewide average', SOD, (c) => {
      if (!c.sod || !c.statewide.institutions) return null;
      return `${(c.sod.counties / (159 / c.statewide.institutions)).toFixed(2)}×`;
    }),
    rule('assets-per-branch-vs-state', 'Assets per branch versus the state average', 'institution ÷ statewide assets per branch', REPORT, (c) => {
      const row = fin(c);
      if (!row || !c.sod?.branches || !c.statewide.branches) return null;
      const institution = (row.asset * 1000) / c.sod.branches;
      const statewide = (row.asset * 1000 * c.statewide.institutions) / c.statewide.branches;
      return `${(institution / statewide).toFixed(2)}×`;
    }),
    rule('charter-count', 'Active Georgia charters in the universe', 'count of FDIC institutions', 'FDIC institutions API', (c) =>
      count(c.statewide.institutions)),
    rule('branches-in-state', 'Branches across the Georgia universe', 'sum of SOD branches', SOD, (c) =>
      count(c.statewide.branches)),
    rule('deposits-in-state', 'Deposits across the Georgia universe', 'sum of SOD deposits', SOD, (c) =>
      usd(c.statewide.depositsUsd)),
    rule('assets-in-state-proxy', 'Charter assets against the state deposit base', 'ASSET ÷ statewide SOD deposits', REPORT, (c) => {
      const row = fin(c);
      return row && c.statewide.depositsUsd ? pct(safeRatio(row.asset * 1000, c.statewide.depositsUsd), 3) : null;
    }),
    rule('rank-percentile', 'Asset rank percentile', '(1 − rank ÷ charter count) × 100', REPORT, (c) =>
      c.ranks.assets ? `${((1 - c.ranks.assets / c.statewide.institutions) * 100).toFixed(1)}th` : null),
    rule('deposit-percentile', 'Deposit rank percentile', '(1 − rank ÷ charter count) × 100', SOD, (c) =>
      c.ranks.deposits ? `${((1 - c.ranks.deposits / c.statewide.institutions) * 100).toFixed(1)}th` : null),
    rule('head-office', 'Head office', 'FDIC city', 'FDIC institutions API', (c) => c.inst.city || null),
    rule('holding-company', 'Holding company', 'FDIC NAMEHCR', 'FDIC institutions API', (c) => c.inst.holdingCompany || null),
    rule('certificate', 'FDIC certificate', 'CERT', 'FDIC institutions API', (c) => c.inst.cert || null),
    rule('sod-name', 'Name in the Summary of Deposits', 'SOD institution name', SOD, (c) => c.sod?.name ?? null),
    rule('share-per-branch', 'Deposit share per branch', 'deposit share ÷ branches', SOD, (c) =>
      c.sod && c.sod.branches && c.statewide.depositsUsd
        ? pct(safeRatio(c.sod.depositsUsd / c.sod.branches, c.statewide.depositsUsd), 5)
        : null),
  ],
};

export const INSTITUTION_FAMILIES_B: Family<InstitutionContext>[] = [
  creditMix,
  deposits,
  market,
  ...INSTITUTION_FAMILIES_B2,
];
