/**
 * ANOMALY CLASSIFICATION AND PRIORITY
 *
 * The stream carries a headline, a publisher, a timestamp and a URL. This module does
 * two things with that record and nothing more:
 *
 *  - classifies it into a tax / finance family from words that actually appear in the
 *    headline or summary, and
 *  - ranks it by a priority score built from the reported severity, the size of the FDIC
 *    institution the headline names, and how recent the event is.
 *
 * The category is a reading of the source text, not a regulator's filing. The priority
 * is a sorting rule, not a risk rating, and no number here is a reported loss.
 */

import type { FinancialInstitution } from '../data/georgiaFinancialInstitutions.ts';

export type AnomalyClassKey =
  | 'TAX'
  | 'PAYROLL'
  | 'WIRE_ACH'
  | 'CARD'
  | 'AML_SANCTIONS'
  | 'SECURITIES'
  | 'CRYPTO'
  | 'FRAUD'
  | 'INSOLVENCY'
  | 'REGULATORY'
  | 'CYBER_FINANCE'
  | 'MARKET';

export interface AnomalyClass {
  key: AnomalyClassKey;
  label: string;
  patterns: RegExp;
}

/** Ordered: the first family whose words appear in the text wins. */
export const ANOMALY_CLASSES: AnomalyClass[] = [
  {
    key: 'TAX',
    label: 'Tax & revenue',
    patterns: /\btax(es|ed|ation)?\b|\birs\b|\blevy|levies|lien\b|liens\b|withhold|evasion|deficiency|assessment|1099|w-?2|payroll tax|sales tax|excise/i,
  },
  {
    key: 'PAYROLL',
    label: 'Payroll & benefits',
    patterns: /payroll|wage|salary|salaries|benefit plan|pension|401\(k\)|retirement plan|unemployment insurance/i,
  },
  {
    key: 'WIRE_ACH',
    label: 'Wire, ACH & payments',
    patterns: /\bwire|fedwire|swift|\bach\b|nacha|payment|remittance|settlement|clearing|transfer|zelle|check fraud/i,
  },
  {
    key: 'CARD',
    label: 'Cards & ATM',
    patterns: /\bcard\b|card-not-present|atm\b|debit|credit card|interchange|chargeback|pin\b/i,
  },
  {
    key: 'AML_SANCTIONS',
    label: 'AML, KYC & sanctions',
    patterns: /money laundering|launder|\baml\b|\bbsa\b|sanction|\bofac\b|\bkyc\b|structuring|suspicious activity|\bsar\b|beneficial ownership|terror financ/i,
  },
  {
    key: 'SECURITIES',
    label: 'Securities & disclosure',
    patterns: /sec\b|securities|insider|10-?k|10-?q|8-?k|disclosure|restatement|material weakness|audit|filing|stock|shareholder|bond|prospectus/i,
  },
  {
    key: 'CRYPTO',
    label: 'Digital assets',
    patterns: /crypto|bitcoin|ethereum|stablecoin|blockchain|digital asset|token|wallet|defi/i,
  },
  {
    key: 'FRAUD',
    label: 'Fraud & embezzlement',
    patterns: /fraud|embezzl|forger|scam|ponzi|scheme|kickback|bribe|corrupt|identity theft|misappropriat/i,
  },
  {
    key: 'INSOLVENCY',
    label: 'Insolvency & failure',
    patterns: /bankrupt|insolven|receivership|failure|failed bank|liquidat|default|delinquen|foreclos/i,
  },
  {
    key: 'REGULATORY',
    label: 'Regulatory action',
    patterns: /regulator|fdic|occ\b|federal reserve|\bcfpb\b|consent order|enforcement|cease and desist|penalt|fine|supervis|examination/i,
  },
  {
    key: 'CYBER_FINANCE',
    label: 'Cyber-financial intrusion',
    patterns: /ransomware|breach|hack|cyber|malware|phishing|intrusion|exfiltrat|credential|zero-day|ddos/i,
  },
  {
    key: 'MARKET',
    label: 'Markets & rates',
    patterns: /market|interest rate|yield|treasury|inflation|liquidity|credit spread|trading|volatil/i,
  },
];

export function classifyAnomaly(text: string): AnomalyClass {
  const haystack = text || '';
  return (
    ANOMALY_CLASSES.find((family) => family.patterns.test(haystack)) ??
    ANOMALY_CLASSES[ANOMALY_CLASSES.length - 1]
  );
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 22,
  info: 14,
};

/**
 * Priority score, 0-100:
 *   severity 0-40, institution size 0-34, recency 0-24, attributed 0-2.
 * Recency halves every six hours so a fresh critical event outranks an old one.
 */
export function priorityScore(
  severity: string,
  ts: string,
  institution: FinancialInstitution | null,
  now = Date.now(),
): number {
  const weight = SEVERITY_WEIGHT[severity] ?? 22;
  const size = institution
    ? Math.min(34, Math.log10(Math.max(1, institution.depositsUsd)) / 9.6 * 34)
    : 0;
  const ageHours = Math.max(0, (now - Date.parse(ts)) / 3_600_000);
  const recency = Number.isFinite(ageHours) ? 24 * Math.pow(0.5, ageHours / 6) : 0;
  return Math.round(Math.min(100, weight + size + recency + (institution ? 2 : 0)));
}

export type PriorityBand = 'P1' | 'P2' | 'P3' | 'P4';

export function priorityBand(score: number): PriorityBand {
  if (score >= 80) return 'P1';
  if (score >= 65) return 'P2';
  if (score >= 48) return 'P3';
  return 'P4';
}

export const PRIORITY_COLOR: Record<PriorityBand, string> = {
  P1: '#f44336',
  P2: '#ff9800',
  P3: '#ffd54f',
  P4: '#4ade80',
};
