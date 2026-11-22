/**
 * INSTITUTION INDICATOR FAMILIES (14 × 20 = 280)
 *
 * Each family answers one question about a Georgia charter using published regulator
 * figures: FDIC Reports of Condition and Income (quarterly), the FDIC Summary of Deposits
 * (branch and county deposits), SEC Form 4 filings and the live OSINT feed.
 *
 * The families live in four modules so no single file carries the whole set; this index
 * module holds the first four and re-exports the rest.
 */

import { safeRatio, seriesAt, seriesGrowth, stdev } from './osintFinancials.ts';
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
import { INSTITUTION_FAMILIES_A2 } from './osintInstitutionIndicators2.ts';
import { INSTITUTION_FAMILIES_B } from './osintInstitutionIndicatorsB.ts';

type Rule = {
  key: string;
  label: string;
  basis: string;
  source: string;
  run: (ctx: InstitutionContext) => RuleResult;
};

const rule = (
  key: string,
  label: string,
  basis: string,
  source: string,
  run: (ctx: InstitutionContext) => RuleResult,
): Rule => ({ key, label, basis, source, run });

const FDIC = 'FDIC call report';
const SOD = 'FDIC Summary of Deposits';

const latest = (ctx: InstitutionContext) => ctx.fin?.latest ?? null;
const eqRatio = (ctx: InstitutionContext): number => {
  const fin = latest(ctx);
  return fin ? safeRatio(fin.eq, fin.asset) : NaN;
};
const brokeredRatio = (ctx: InstitutionContext): number => {
  const fin = latest(ctx);
  return fin ? safeRatio(fin.bro, fin.dep) : NaN;
};
const loanDeposit = (ctx: InstitutionContext): number => {
  const fin = latest(ctx);
  return fin ? safeRatio(fin.lnlsnet, fin.dep) : NaN;
};
const fed = (ctx: InstitutionContext) => ctx.fin;

const capital: Family<InstitutionContext> = {
  id: 'capital',
  label: 'Capital & solvency',
  blurb: 'Equity, leverage and the direction of both across the eight-quarter window.',
  rules: [
    rule('equity-ratio', 'Equity to assets', 'EQ ÷ ASSET × 100', FDIC, (c) => (fed(c) ? pct(eqRatio(c)) : null)),
    rule('equity-vs-peer', 'Equity ratio versus Georgia median', 'institution equity ratio − peer median', FDIC, (c) =>
      fed(c) && c.peer ? `${(eqRatio(c) - c.peer.equityRatio).toFixed(2)} pts` : null),
    rule('equity-over-8', 'Headroom over the 8% leverage benchmark', 'equity ratio − 8%', FDIC, (c) =>
      fed(c) ? `${(eqRatio(c) - 8).toFixed(2)} pts` : null),
    rule('equity-gap-8', 'Dollars of equity above an 8% ratio', 'ASSET × 8% − EQ', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.eq - fin.asset * 0.08) : null;
    }),
    rule('equity-growth-qoq', 'Equity growth, latest quarter', 'EQ change over one quarter', FDIC, (c) =>
      c.fin && c.fin.eq.length > 1 ? pct(seriesGrowth(c.fin.eq, 1)) : null),
    rule('equity-growth-yoy', 'Equity growth, year over year', 'EQ change over four quarters', FDIC, (c) =>
      c.fin && c.fin.eq.length > 4 ? pct(seriesGrowth(c.fin.eq, 4)) : null),
    rule('asset-growth-qoq', 'Asset growth, latest quarter', 'ASSET change over one quarter', FDIC, (c) =>
      c.fin && c.fin.asset.length > 1 ? pct(seriesGrowth(c.fin.asset, 1)) : null),
    rule('asset-growth-yoy', 'Asset growth, year over year', 'ASSET change over four quarters', FDIC, (c) =>
      c.fin && c.fin.asset.length > 4 ? pct(seriesGrowth(c.fin.asset, 4)) : null),
    rule('growth-gap', 'Asset growth minus equity growth', 'asset growth − equity growth (one quarter)', FDIC, (c) => {
      if (!c.fin || c.fin.asset.length < 2) return null;
      const gap = seriesGrowth(c.fin.asset, 1) - seriesGrowth(c.fin.eq, 1);
      return { value: `${gap.toFixed(2)} pts`, tone: gap > 2 ? 'watch' : 'info' };
    }),
    rule('leverage', 'Leverage multiple', 'ASSET ÷ EQ', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.eq ? `${(fin.asset / fin.eq).toFixed(2)}×` : null;
    }),
    rule('roe', 'Return on equity', 'ROE as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? `${fin.roe.toFixed(2)}%` : null;
    }),
    rule('roe-vs-peer', 'Return on equity versus Georgia median', 'ROE − peer median ROE', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${(fin.roe - c.peer.roe).toFixed(2)} pts` : null;
    }),
    rule('income-qoq', 'Net income change, latest quarter', 'NETINC change over one quarter', FDIC, (c) =>
      c.fin && c.fin.netinc.length > 1 ? pct(seriesGrowth(c.fin.netinc, 1)) : null),
    rule('income-4q', 'Net income, last four quarters', 'sum of the last four NETINC values', FDIC, (c) =>
      c.fin && c.fin.netinc.length >= 4 ? usdThousands(sum(c.fin.netinc.slice(-4))) : null),
    rule('retained-4q', 'Four-quarter income over equity', 'sum(NETINC, 4) ÷ EQ', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.fin && c.fin.netinc.length >= 4
        ? pct(safeRatio(sum(c.fin.netinc.slice(-4)), fin.eq))
        : null;
    }),
    rule('equity-per-employee', 'Equity per employee', 'EQ ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.eq / fin.numemp) : null;
    }),
    rule('assets-per-employee', 'Assets per employee', 'ASSET ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.asset / fin.numemp) : null;
    }),
    rule('equity-since-window', 'Equity change over the window', 'first EQ in the series → latest', FDIC, (c) =>
      c.fin && c.fin.eq.length > 1 ? usdThousands(c.fin.eq[c.fin.eq.length - 1] - c.fin.eq[0]) : null),
    rule('negative-equity-quarters', 'Quarters with negative equity', 'count of EQ < 0 in the series', FDIC, (c) =>
      c.fin ? count(c.fin.eq.filter((value) => value < 0).length) : null),
    rule('equity-volatility', 'Equity growth volatility', 'standard deviation of quarterly EQ growth', FDIC, (c) => {
      if (!c.fin || c.fin.eq.length < 4) return null;
      const changes: number[] = [];
      for (let i = 1; i < c.fin.eq.length; i += 1) {
        const prior = c.fin.eq[i - 1];
        if (prior) changes.push(((c.fin.eq[i] - prior) / prior) * 100);
      }
      return `${stdev(changes).toFixed(2)} pts`;
    }),
  ],
};

const quality: Family<InstitutionContext> = {
  id: 'quality',
  label: 'Asset quality',
  blurb: 'Past-due, noncurrent and charged-off assets, and how much capital or provision stands behind them.',
  rules: [
    rule('noncurrent-ratio', 'Noncurrent loans and leases ratio', 'NCLNLSR as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.nclnr) : null;
    }),
    rule('noncurrent-vs-peer', 'Noncurrent ratio versus Georgia median', 'NCLNLSR − peer median', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${(fin.nclnr - c.peer.nclnr).toFixed(3)} pts` : null;
    }),
    rule('noncurrent-dollars', 'Noncurrent loans and leases', 'NCLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.ncln) : null;
    }),
    rule('noncurrent-qoq', 'Noncurrent loans change, latest quarter', 'NCLNLSR change over one quarter', FDIC, (c) =>
      c.fin && c.fin.nclnr.length > 1 ? `${(seriesAt(c.fin.nclnr, 0) - seriesAt(c.fin.nclnr, 1)).toFixed(3)} pts` : null),
    rule('noncurrent-trend', 'Noncurrent loans change over four quarters', 'NCLNLSR latest − four quarters back', FDIC, (c) =>
      c.fin && c.fin.nclnr.length > 4 ? `${(seriesAt(c.fin.nclnr, 0) - seriesAt(c.fin.nclnr, 4)).toFixed(3)} pts` : null),
    rule('past-due-30', 'Loans 30–89 days past due', 'P3ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.p3) : null;
    }),
    rule('past-due-90', 'Loans 90+ days past due', 'P9ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.p9) : null;
    }),
    rule('past-due-share', 'Past-due share of assets', '(P3ASSET + P9ASSET) ÷ ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(safeRatio(fin.p3 + fin.p9, fin.asset)) : null;
    }),
    rule('nonperforming', 'Nonperforming assets ratio', 'NPERFV as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.nperfv) : null;
    }),
    rule('nonperforming-vs-peer', 'Nonperforming ratio versus Georgia median', 'NPERFV − peer median', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${(fin.nperfv - c.peer.nonperform).toFixed(3)} pts` : null;
    }),
    rule('charge-off-rate', 'Net charge-off rate', 'NTLNLSR as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.ntlnr) : null;
    }),
    rule('charge-off-vs-peer', 'Charge-off rate versus Georgia median', 'NTLNLSR − peer median', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${(fin.ntlnr - c.peer.ntlnr).toFixed(3)} pts` : null;
    }),
    rule('charge-off-dollars', 'Net charge-offs', 'NTLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.ntln) : null;
    }),
    rule('provision', 'Provision for credit losses', 'ELNATR', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.elnatr) : null;
    }),
    rule('provision-over-chargeoffs', 'Provision cover of net charge-offs', 'ELNATR ÷ NTLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.ntln ? `${(fin.elnatr / fin.ntln).toFixed(2)}×` : null;
    }),
    rule('provision-over-noncurrent', 'Provision cover of noncurrent loans', 'ELNATR ÷ NCLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.ncln ? `${(fin.elnatr / fin.ncln).toFixed(2)}×` : null;
    }),
    rule('equity-cover-noncurrent', 'Equity cover of noncurrent loans', 'EQ ÷ NCLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.ncln ? `${(fin.eq / fin.ncln).toFixed(2)}×` : null;
    }),
    rule('ninety-of-noncurrent', 'Share of noncurrent loans already 90+ days', 'P9ASSET ÷ NCLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.ncln ? pct(safeRatio(fin.p9, fin.ncln)) : null;
    }),
    rule('loans', 'Loans and leases, net', 'LNLSNET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.lnlsnet) : null;
    }),
    rule('noncurrent-of-loans', 'Noncurrent loans over total loans', 'NCLNLSR restated on the loan base', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.nclnr) : null;
    }),
  ],
};

const funding: Family<InstitutionContext> = {
  id: 'funding',
  label: 'Funding & liquidity',
  blurb: 'How the balance sheet is funded and how stable that funding looks quarter to quarter.',
  rules: [
    rule('deposits', 'Total deposits', 'DEP', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.dep) : null;
    }),
    rule('deposit-growth-qoq', 'Deposit growth, latest quarter', 'DEP change over one quarter', FDIC, (c) =>
      c.fin && c.fin.dep.length > 1 ? pct(seriesGrowth(c.fin.dep, 1)) : null),
    rule('deposit-growth-yoy', 'Deposit growth, year over year', 'DEP change over four quarters', FDIC, (c) =>
      c.fin && c.fin.dep.length > 4 ? pct(seriesGrowth(c.fin.dep, 4)) : null),
    rule('deposit-volatility', 'Deposit growth volatility', 'standard deviation of quarterly DEP growth', FDIC, (c) => {
      if (!c.fin || c.fin.dep.length < 4) return null;
      const changes: number[] = [];
      for (let i = 1; i < c.fin.dep.length; i += 1) {
        const prior = c.fin.dep[i - 1];
        if (prior) changes.push(((c.fin.dep[i] - prior) / prior) * 100);
      }
      const volatility = stdev(changes);
      return { value: `${volatility.toFixed(2)} pts`, tone: volatility > 5 ? 'watch' : 'info' };
    }),
    rule('loan-deposit', 'Loans to deposits', 'LNLSNET ÷ DEP', FDIC, (c) => (fed(c) ? pct(loanDeposit(c)) : null)),
    rule('loan-deposit-vs-peer', 'Loans to deposits versus Georgia median', 'ratio − peer median', FDIC, (c) =>
      fed(c) && c.peer ? `${(loanDeposit(c) - c.peer.loanDeposit).toFixed(2)} pts` : null),
    rule('brokered', 'Brokered deposits', 'BRO', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.bro) : null;
    }),
    rule('brokered-ratio', 'Brokered deposits over deposits', 'BRO ÷ DEP', FDIC, (c) =>
      fed(c) ? pct(brokeredRatio(c)) : null),
    rule('brokered-vs-peer', 'Brokered ratio versus Georgia median', 'ratio − peer median', FDIC, (c) =>
      fed(c) && c.peer ? `${(brokeredRatio(c) - c.peer.brokeredRatio).toFixed(2)} pts` : null),
    rule('brokered-per-branch', 'Brokered deposits per Georgia branch', 'BRO ÷ SOD branches', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.sod?.branches ? usdThousands(fin.bro / c.sod.branches) : null;
    }),
    rule('securities', 'Securities held', 'SCAF', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.scaf) : null;
    }),
    rule('securities-ratio', 'Securities over assets', 'SCAFR as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.scaffr) : null;
    }),
    rule('securities-per-employee', 'Securities per employee', 'SCAF ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.scaf / fin.numemp) : null;
    }),
    rule('nondeposit-funding', 'Non-deposit funding proxy', 'ASSET − DEP − EQ', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.asset - fin.dep - fin.eq) : null;
    }),
    rule('nondeposit-share', 'Non-deposit funding share of assets', '(ASSET − DEP) ÷ ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(safeRatio(fin.asset - fin.dep, fin.asset)) : null;
    }),
    rule('sod-deposits-per-branch', 'Georgia deposits per branch', 'SOD deposits ÷ SOD branches', SOD, (c) =>
      c.sod && c.sod.branches ? usd(c.sod.depositsUsd / c.sod.branches) : null),
    rule('deposits-per-employee', 'Deposits per employee', 'DEP ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.dep / fin.numemp) : null;
    }),
    rule('ga-share-of-deposits', 'Georgia branches as a share of total deposits', 'SOD GA deposits ÷ DEP', SOD, (c) => {
      const fin = latest(c);
      return fin && c.sod ? pct(safeRatio(c.sod.depositsUsd / 1000, fin.dep)) : null;
    }),
    rule('deposit-window-change', 'Deposit change over the window', 'first DEP in the series → latest', FDIC, (c) =>
      c.fin && c.fin.dep.length > 1 ? usdThousands(c.fin.dep[c.fin.dep.length - 1] - c.fin.dep[0]) : null),
    rule('deposits-to-assets', 'Deposits over assets', 'DEP ÷ ASSET', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(safeRatio(fin.dep, fin.asset)) : null;
    }),
  ],
};

const earnings: Family<InstitutionContext> = {
  id: 'earnings',
  label: 'Earnings & provisioning',
  blurb: 'Profitability, its volatility, and how much of it is consumed by credit costs.',
  rules: [
    rule('roa', 'Return on assets', 'ROA as filed', FDIC, (c) => {
      const fin = latest(c);
      return fin ? pct(fin.roa) : null;
    }),
    rule('roa-vs-peer', 'Return on assets versus Georgia median', 'ROA − peer median', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${(fin.roa - c.peer.roa).toFixed(2)} pts` : null;
    }),
    rule('roa-change', 'Return on assets change, year over year', 'ROA latest − four quarters back', FDIC, (c) =>
      c.fin && c.fin.roa.length > 4 ? `${(seriesAt(c.fin.roa, 0) - seriesAt(c.fin.roa, 4)).toFixed(2)} pts` : null),
    rule('roa-volatility', 'Return on assets volatility', 'standard deviation of quarterly ROA', FDIC, (c) =>
      c.fin && c.fin.roa.length > 2 ? `${stdev(c.fin.roa).toFixed(2)} pts` : null),
    rule('loss-quarters', 'Quarters with a net loss', 'count of NETINC < 0', FDIC, (c) =>
      c.fin ? count(c.fin.netinc.filter((value) => value < 0).length) : null),
    rule('income-latest', 'Net income, latest quarter', 'NETINC', FDIC, (c) => {
      const fin = latest(c);
      return fin ? usdThousands(fin.netinc) : null;
    }),
    rule('income-yoy', 'Net income change, year over year', 'NETINC latest vs four quarters back', FDIC, (c) =>
      c.fin && c.fin.netinc.length > 4 ? pct(seriesGrowth(c.fin.netinc, 4)) : null),
    rule('income-annual', 'Net income, trailing four quarters', 'sum of the last four NETINC values', FDIC, (c) =>
      c.fin && c.fin.netinc.length >= 4 ? usdThousands(sum(c.fin.netinc.slice(-4))) : null),
    rule('income-per-employee', 'Net income per employee', 'NETINC ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.netinc / fin.numemp) : null;
    }),
    rule('provision-drag', 'Provision as a share of net income', 'ELNATR ÷ NETINC', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.netinc ? pct(safeRatio(fin.elnatr, fin.netinc)) : null;
    }),
    rule('income-over-chargeoffs', 'Net income over net charge-offs', 'NETINC ÷ NTLNLS', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.ntln ? `${(fin.netinc / fin.ntln).toFixed(2)}×` : null;
    }),
    rule('assets-per-employee', 'Assets per employee', 'ASSET ÷ NUMEMP', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.numemp ? usdThousands(fin.asset / fin.numemp) : null;
    }),
    rule('income-per-million', 'Net income per million dollars of assets', 'NETINC ÷ (ASSET ÷ 1000)', FDIC, (c) => {
      const fin = latest(c);
      return fin && fin.asset ? usd((fin.netinc / (fin.asset / 1000)) * 1000) : null;
    }),
    rule('income-trend', 'Direction of net income across the window', 'first half vs second half of NETINC', FDIC, (c) => {
      if (!c.fin || c.fin.netinc.length < 4) return null;
      const series = c.fin.netinc;
      const firstHalf = sum(series.slice(0, Math.floor(series.length / 2)));
      const secondHalf = sum(series.slice(Math.floor(series.length / 2)));
      const direction = secondHalf - firstHalf;
      return { value: `${direction >= 0 ? 'rising' : 'falling'} (${usdThousands(Math.abs(direction))})`, tone: direction < 0 ? 'watch' : 'info' };
    }),
    rule('income-best', 'Largest quarterly net income', 'maximum NETINC in the series', FDIC, (c) =>
      c.fin && c.fin.netinc.length ? usdThousands(Math.max(...c.fin.netinc)) : null),
    rule('income-worst', 'Smallest quarterly net income', 'minimum NETINC in the series', FDIC, (c) =>
      c.fin && c.fin.netinc.length ? usdThousands(Math.min(...c.fin.netinc)) : null),
    rule('declining-quarters', 'Quarters with falling income', 'count of NETINC declines', FDIC, (c) => {
      if (!c.fin || c.fin.netinc.length < 3) return null;
      let declines = 0;
      for (let i = 1; i < c.fin.netinc.length; i += 1) if (c.fin.netinc[i] < c.fin.netinc[i - 1]) declines += 1;
      return count(declines);
    }),
    rule('roa-gap-bps', 'Return on assets gap to the state median, in basis points', '(ROA − peer median) × 100', FDIC, (c) => {
      const fin = latest(c);
      return fin && c.peer ? `${Math.round((fin.roa - c.peer.roa) * 100)} bps` : null;
    }),
    rule('income-volatility', 'Net income volatility', 'standard deviation of NETINC ÷ mean NETINC', FDIC, (c) => {
      if (!c.fin || c.fin.netinc.length < 4) return null;
      const mean = sum(c.fin.netinc) / c.fin.netinc.length;
      return mean ? pct((stdev(c.fin.netinc) / Math.abs(mean)) * 100) : null;
    }),
    rule('income-window', 'Net income booked over the window', 'sum of NETINC across the series', FDIC, (c) =>
      c.fin ? usdThousands(sum(c.fin.netinc)) : null),
  ],
};

export const INSTITUTION_FAMILIES: Family<InstitutionContext>[] = [
  capital,
  quality,
  funding,
  earnings,
  ...INSTITUTION_FAMILIES_A2,
  ...INSTITUTION_FAMILIES_B,
];
