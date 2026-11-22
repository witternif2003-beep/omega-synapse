/**
 * PUBLISHED-RECORD CRIME SCREENS
 *
 * One incident per stream record whose own text matches a crime pattern. The dollar figure is
 * the largest amount the publisher states verbatim; when the text states none the incident
 * carries no amount instead of an estimate.
 */

import type { OsintItem } from './osintClient.ts';
import type { CrimeFamily, CrimeIncident, CrimeSeverity } from './crimeEngine.ts';
import { usd } from './crimeEngine.ts';

interface RecordSpec {
  patternId: string;
  family: CrimeFamily;
  severity: CrimeSeverity;
  label: string;
  terms: RegExp;
  matchedTerms: string[];
  note: string;
}

const RECORD_SPECS: RecordSpec[] = [
  {
    patternId: 'REC-FRAUD-01',
    family: 'FRAUD',
    severity: 'high',
    label: 'Fraud, embezzlement or misappropriation alleged',
    terms: /\bfraud|embezzl|misappropriat|ponzi|kickback|bribe|forger|identity theft|shell compan/i,
    matchedTerms: ['fraud', 'embezzlement', 'misappropriation', 'ponzi', 'kickback', 'bribery', 'forgery', 'identity theft'],
    note: 'the publisher’s own text names a fraud theory',
  },
  {
    patternId: 'REC-AML-02',
    family: 'AML',
    severity: 'high',
    label: 'Money laundering, structuring or sanctions exposure',
    terms: /money laundering|launder|\bstructuring\b|\bbsa\b|\baml\b|sanction|\bofac\b|terror financ|beneficial ownership/i,
    matchedTerms: ['money laundering', 'structuring', 'BSA', 'AML', 'sanctions', 'OFAC', 'beneficial ownership'],
    note: 'the publisher’s own text names an AML or sanctions matter',
  },
  {
    patternId: 'REC-ENFORCE-03',
    family: 'ENFORCEMENT',
    severity: 'medium',
    label: 'Formal enforcement or supervisory action',
    terms: /consent order|cease and desist|enforcement action|civil money penalty|penalty|prohibition|removal and prohibition|supervisory action|formal agreement/i,
    matchedTerms: ['consent order', 'cease and desist', 'civil money penalty', 'prohibition', 'formal agreement'],
    note: 'a formal action is named by the publisher',
  },
  {
    patternId: 'REC-CYBER-04',
    family: 'CYBER',
    severity: 'high',
    label: 'Cyber-financial intrusion reported',
    terms: /ransomware|\bbreach\b|\bhack|cyber|malware|phishing|intrusion|exfiltrat|credential stuffing|ddos/i,
    matchedTerms: ['ransomware', 'breach', 'hack', 'cyber', 'malware', 'phishing', 'exfiltration'],
    note: 'the publisher reports an intrusion or breach',
  },
  {
    patternId: 'REC-INSIDER-05',
    family: 'MARKET',
    severity: 'medium',
    label: 'Insider dealing or disclosure conduct',
    terms: /insider trading|insider dealing|10b-?5|material nonpublic|restatement|material weakness|accounting irregularit|disclosure violation/i,
    matchedTerms: ['insider trading', '10b-5', 'material nonpublic information', 'restatement', 'material weakness'],
    note: 'the publisher’s text names a market-conduct theory',
  },
  {
    patternId: 'REC-INSOLV-06',
    family: 'ENFORCEMENT',
    severity: 'high',
    label: 'Failure, receivership or insolvency event',
    terms: /receivership|failed bank|bank failure|insolven|chapter 11|bankrupt|conservatorship/i,
    matchedTerms: ['receivership', 'failed bank', 'insolvency', 'chapter 11', 'bankruptcy'],
    note: 'a failure or insolvency event is named',
  },
];

/** Dollar figures stated verbatim in a publisher's text. */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  const pattern = /\$\s?([\d][\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|k)?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = (match[2] ?? '').toLowerCase();
    const scale = unit.startsWith('b') ? 1e9 : unit.startsWith('m') ? 1e6 : unit.startsWith('t') || unit === 'k' ? 1e3 : 1;
    out.push(value * scale);
  }
  return out;
}

/**
 * One incident per published record whose own text matches a crime pattern. The amount is
 * the largest dollar figure the publisher states; if none is stated, the incident carries
 * no amount rather than an estimate.
 */
export function detectRecordCrimes(items: OsintItem[], now = new Date().toISOString()): CrimeIncident[] {
  const out: CrimeIncident[] = [];
  for (const item of items) {
    const text = `${item.title} ${item.summary}`.trim();
    const spec = RECORD_SPECS.find((entry) => entry.terms.test(text));
    if (!spec) continue;
    const amounts = amountsInText(text).sort((a, b) => b - a);
    const amount = amounts[0] ?? null;
    const hits = spec.matchedTerms.filter((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
    out.push({
      id: `REC:${item.id}`,
      detectedAt: now,
      family: spec.family,
      patternId: spec.patternId,
      title: item.title,
      subject: item.institutions[0] ?? item.people[0] ?? item.publisher,
      subjectKind: item.institutions.length ? 'institution' : 'record',
      institution: item.institutions.length ? item.institutions.join(' / ') : 'statewide — no single bank named',
      amountUsd: amount,
      amountBasis: amount
        ? 'largest dollar figure stated verbatim in the publisher’s text'
        : 'the published record states no dollar figure',
      sourceAt: item.published,
      severity: spec.severity,
      confidence: 'keyword match',
      methodology: {
        formula: 'publisher text matches a pattern term; amount = max(amounts stated in the text)',
        steps: [
          { label: 'Read the record', detail: `${item.publisher} · ${item.published.slice(0, 10)}` },
          { label: 'Match terms', detail: hits.length ? hits.join(', ') : spec.matchedTerms.slice(0, 3).join(', ') },
          { label: 'Read amounts', detail: amounts.length ? amounts.map((value) => usd(value)).join(', ') : 'no $ figure in the text' },
        ],
        threshold: `the record’s own text must contain one of: ${spec.matchedTerms.slice(0, 4).join(', ')}`,
        reverse: 'The classification is a reading of the publisher’s words, and the amount is copied from the text. Open the source link to check both in one click.',
      },
      details: [
        { label: 'Publisher', value: item.publisher },
        { label: 'Published', value: item.published },
        { label: 'Why it matched', value: spec.note },
        { label: 'Institutions named', value: item.institutions.join(', ') || 'none' },
        { label: 'Individuals named', value: item.people.join(', ') || 'none' },
      ],
      evidence: [{ label: 'Source record', value: item.title, url: item.url }],
      patterns: [spec.patternId],
      sources: [item.publisher, item.url],
    });
  }
  return out;
}
