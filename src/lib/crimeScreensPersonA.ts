import type { PersonView } from './financialIndicators.ts';
import type { OsintTransaction } from './osintClient.ts';
import type { CrimeIncident, LineLike } from './crimeEngine.ts';
import { base, daysBetween, grossBasis, lineValue, num, toLines, usd } from './crimeEngine.ts';

/**
 * INDIVIDUAL INSIDER SCREENS, PART A
 *
 * Screens 1–6: late Form 4, sale without a 10b5-1 plan, same-day exercise and sale, gift
 * transfers, indirect control through an entity or family member, and a sale that removed
 * half or more of the reported holding. Each one prints its formula, its inputs, its
 * threshold and how to reverse it, so the dollar figure can be recomputed from the filing.
 */
export function detectPersonScreensA(person: PersonView, transactions: OsintTransaction[], now: string): CrimeIncident[] {
  const lines = toLines(person, transactions);
  const out: CrimeIncident[] = [];
  const push = (incident: CrimeIncident | null) => {
    if (incident) out.push(incident);
  };

  /* 1 — late Form 4 -------------------------------------------------------- */
  const late = lines
    .map((line) => ({ line, lag: daysBetween(line.traded, line.filed) }))
    .filter((row) => Number.isFinite(row.lag) && row.lag > 2)
    .sort((a, b) => b.lag - a.lag)[0];
  if (late) {
    const value = lineValue(late.line);
    push({
      ...base(person, now),
      id: `${person.key}:INS-LATE`,
      family: 'INSIDER_DISCLOSURE',
      patternId: 'INS-LATE-02',
      title: `Form 4 filed ${late.lag} days after the transaction`,
      amountUsd: value,
      amountBasis: grossBasis(late.line),
      sourceAt: late.line.filed,
      severity: late.lag > 10 ? 'high' : 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'filing lag = filed − traded (calendar days)',
        steps: [
          { label: 'Read traded date', detail: `transactionDate ${late.line.traded || 'not reported'}` },
          { label: 'Read filed date', detail: `filingDate ${late.line.filed || 'not reported'}` },
          { label: 'Subtract', detail: `${late.lag} calendar days` },
          { label: 'Value the line', detail: grossBasis(late.line) },
        ],
        threshold: 'more than 2 calendar days after the transaction date (Form 4 two-business-day deadline)',
        reverse: 'Two dates in the filing, one subtraction. The dollar figure is shares × reported price on the same line.',
      },
      details: [
        { label: 'Transaction code', value: late.line.code || 'not reported' },
        { label: 'Shares', value: num(late.line.shares) },
        { label: 'Reported price', value: late.line.price > 0 ? `$${late.line.price.toFixed(4)}` : 'not reported' },
        { label: 'Holding after', value: num(late.line.after) },
        { label: 'Ownership', value: late.line.ownership === 'I' ? 'indirect' : 'direct' },
      ],
      evidence: [{ label: 'Form 4 document', value: late.line.filed, url: late.line.url }],
      patterns: ['INS-LATE-02'],
    });
  }

  /* 2 — sale with no 10b5-1 plan ------------------------------------------- */
  const bareSale = lines
    .filter((line) => line.code === 'S' && line.shares > 0 && line.tenb5one !== true)
    .sort((a, b) => (lineValue(b) ?? 0) - (lineValue(a) ?? 0))[0];
  if (bareSale) {
    const value = lineValue(bareSale);
    const total = lines.filter((line) => line.code === 'S' && line.tenb5one !== true).length;
    push({
      ...base(person, now),
      id: `${person.key}:INS-NO-PLAN`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-PLAN-03',
      title: `Sale of ${num(bareSale.shares)} shares with no 10b5-1 plan reported`,
      amountUsd: value,
      amountBasis: grossBasis(bareSale),
      sourceAt: bareSale.traded || bareSale.filed,
      severity: 'high',
      confidence: 'derived screen',
      methodology: {
        formula: 'sum over code S lines where the 10b5-1 checkbox is absent',
        steps: [
          { label: 'Select sales', detail: 'transactionCode = S' },
          { label: 'Read plan flag', detail: 'aff10b5One = false or absent in the filing' },
          { label: 'Count', detail: `${total} sale line(s) without a plan flag` },
          { label: 'Value', detail: grossBasis(bareSale) },
        ],
        threshold: 'any sale line whose 10b5-1 checkbox is not set',
        reverse: 'The flag is reported by the filer in the Form 4 XML. Removing the flag removes the incident; the dollar figure is shares × price on the same line.',
      },
      details: [
        { label: 'Trade date', value: bareSale.traded || 'not reported' },
        { label: 'Holding after', value: num(bareSale.after) },
        { label: 'Unplanned sale lines', value: `${total}` },
      ],
      evidence: [{ label: 'Form 4 document', value: bareSale.traded, url: bareSale.url }],
      patterns: ['INS-PLAN-03'],
    });
  }

  /* 3 — exercise and sell on the same day ---------------------------------- */
  const byDay = new Map<string, LineLike[]>();
  for (const line of lines) if (line.traded) byDay.set(line.traded, [...(byDay.get(line.traded) ?? []), line]);
  for (const [day, dayLines] of byDay) {
    const exercises = dayLines.filter((line) => line.code === 'M');
    const sales = dayLines.filter((line) => line.code === 'S');
    if (!exercises.length || !sales.length) continue;
    const proceeds = sales.reduce((sum, line) => sum + (lineValue(line) ?? 0), 0);
    const exercised = exercises.reduce((sum, line) => sum + line.shares, 0);
    const sold = sales.reduce((sum, line) => sum + line.shares, 0);
    push({
      ...base(person, now),
      id: `${person.key}:INS-EX-DUMP:${day}`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-EXERCISE-SELL-04',
      title: `Option exercise and sale on the same day (${day})`,
      amountUsd: proceeds > 0 ? proceeds : null,
      amountBasis: 'sum of reported sale proceeds on the exercise date',
      sourceAt: day,
      severity: 'high',
      confidence: 'derived screen',
      methodology: {
        formula: 'sales(day) where exercise(day) exists; proceeds = Σ shares × price',
        steps: [
          { label: 'Group by trade date', detail: day },
          { label: 'Find exercise legs', detail: `${exercises.length} line(s), code M, ${num(exercised)} shares` },
          { label: 'Find sale legs', detail: `${sales.length} line(s), code S, ${num(sold)} shares` },
          { label: 'Add proceeds', detail: sales.map((line) => usd(lineValue(line))).join(' + ') || 'no priced sale' },
        ],
        threshold: 'at least one code M and one code S line sharing the same transaction date',
        reverse: 'Two codes on one date. The amount is the sale legs only; exercise cost is not netted unless a price is reported on the M line.',
      },
      details: [
        { label: 'Exercised shares', value: num(exercised) },
        { label: 'Sold shares', value: num(sold) },
        { label: 'Holding after', value: num(sales[sales.length - 1]?.after ?? 0) },
      ],
      evidence: sales.slice(0, 3).map((line) => ({ label: `Sale ${line.code}`, value: `${num(line.shares)} sh @ $${line.price.toFixed(2)}`, url: line.url })),
      patterns: ['INS-EXERCISE-SELL-04', 'INS-TIMING-CLUSTER-10'],
    });
  }

  /* 4 — gift transfers ----------------------------------------------------- */
  const gifts = lines.filter((line) => line.code === 'G');
  if (gifts.length) {
    const shares = gifts.reduce((sum, line) => sum + line.shares, 0);
    const value = gifts.reduce((sum, line) => sum + (lineValue(line) ?? 0), 0);
    push({
      ...base(person, now),
      id: `${person.key}:INS-GIFT`,
      family: 'INSIDER_DISCLOSURE',
      patternId: 'INS-GIFT-05',
      title: `${gifts.length} gift transfer(s) of ${num(shares)} shares`,
      amountUsd: value > 0 ? value : null,
      amountBasis: value > 0 ? 'Σ shares × reported price across gift lines' : 'gifts are reported at no price; share count only',
      sourceAt: gifts[0]?.traded || gifts[0]?.filed,
      severity: 'medium',
      confidence: 'derived screen',
      methodology: {
        formula: 'filter transactionCode = G; amount = Σ shares × price where a price is reported',
        steps: [
          { label: 'Select gifts', detail: `transactionCode = G, ${gifts.length} line(s)` },
          { label: 'Add shares', detail: `${num(shares)} shares transferred` },
          { label: 'Price check', detail: value > 0 ? 'price reported on at least one gift line' : 'no price reported, so no dollar value is claimed' },
        ],
        threshold: 'any code G line; a gift above 5% of holdings is escalated in severity',
        reverse: 'Gifts are a published code, not an estimate. Where the filer reports no price the incident shows the share count and refuses a dollar figure.',
      },
      details: gifts.slice(0, 6).map((line, index) => ({
        label: `Gift ${index + 1}`,
        value: `${line.traded || line.filed} · ${num(line.shares)} sh · ${line.ownership === 'I' ? 'indirect' : 'direct'} · after ${num(line.after)}`,
      })),
      evidence: gifts.slice(0, 4).map((line) => ({ label: 'Form 4 document', value: line.traded || line.filed, url: line.url })),
      patterns: ['INS-GIFT-05', 'INS-INDIRECT-06'],
    });
  }

  /* 5 — indirect control through an entity or family member ---------------- */
  const indirect = lines
    .filter((line) => line.ownership === 'I' && /foundation|trust|spouse|child|family|llc|l\.p\.|partnership|estate|charitable/i.test(line.nature ?? ''))
    .sort((a, b) => (lineValue(b) ?? 0) - (lineValue(a) ?? 0))[0];
  if (indirect) {
    push({
      ...base(person, now),
      id: `${person.key}:INS-INDIRECT`,
      family: 'GOVERNANCE',
      patternId: 'INS-INDIRECT-06',
      title: `Indirect holding reported through "${indirect.nature}"`,
      amountUsd: lineValue(indirect) ?? (indirect.after > 0 && indirect.price > 0 ? indirect.after * indirect.price : null),
      amountBasis: lineValue(indirect) ? grossBasis(indirect) : 'holding after × reported price',
      sourceAt: indirect.traded || indirect.filed,
      severity: 'medium',
      confidence: 'published figure',
      methodology: {
        formula: 'ownership = I AND natureOfOwnership matches an entity or family relationship',
        steps: [
          { label: 'Read ownership', detail: 'directOrIndirectOwnership = I' },
          { label: 'Read nature', detail: `natureOfOwnership = "${indirect.nature}"` },
          { label: 'Value the interest', detail: lineValue(indirect) ? grossBasis(indirect) : `${num(indirect.after)} shares held after × $${indirect.price.toFixed(4)}` },
        ],
        threshold: 'indirect ownership naming a foundation, trust, spouse, child, family vehicle, LLC, partnership or estate',
        reverse: 'The nature string is the filer’s own words. No control conclusion is drawn beyond the fact that the interest is held indirectly.',
      },
      details: [
        { label: 'Nature of ownership', value: indirect.nature ?? 'not reported' },
        { label: 'Shares on the line', value: num(indirect.shares) },
        { label: 'Holding after', value: num(indirect.after) },
      ],
      evidence: [{ label: 'Form 4 document', value: indirect.traded || indirect.filed, url: indirect.url }],
      patterns: ['INS-INDIRECT-06'],
    });
  }

  /* 6 — liquidation of half or more of the holding ------------------------- */
  const liquidation = lines
    .filter((line) => line.code === 'S' && line.shares > 0 && line.shares + line.after > 0)
    .map((line) => ({ line, share: line.shares / (line.shares + line.after) }))
    .filter((row) => row.share >= 0.5)
    .sort((a, b) => (lineValue(b.line) ?? 0) - (lineValue(a.line) ?? 0))[0];
  if (liquidation) {
    push({
      ...base(person, now),
      id: `${person.key}:INS-LIQUIDATE`,
      family: 'INSIDER_TRADING',
      patternId: 'INS-LIQUIDATE-07',
      title: `Sale removed ${(liquidation.share * 100).toFixed(1)}% of the reported holding`,
      amountUsd: lineValue(liquidation.line),
      amountBasis: grossBasis(liquidation.line),
      sourceAt: liquidation.line.traded || liquidation.line.filed,
      severity: liquidation.share >= 0.9 ? 'critical' : 'high',
      confidence: 'derived screen',
      methodology: {
        formula: 'share sold = shares ÷ (shares + holding after)',
        steps: [
          { label: 'Read shares sold', detail: num(liquidation.line.shares) },
          { label: 'Read holding after', detail: num(liquidation.line.after) },
          { label: 'Divide', detail: `${num(liquidation.line.shares)} ÷ ${num(liquidation.line.shares + liquidation.line.after)} = ${(liquidation.share * 100).toFixed(2)}%` },
        ],
        threshold: 'half or more of the reported post-sale holding base in a single line',
        reverse: 'Shares and holding-after are both published on the line; the percentage is one division and the amount is shares × price.',
      },
      details: [
        { label: 'Shares sold', value: num(liquidation.line.shares) },
        { label: 'Holding after', value: num(liquidation.line.after) },
        { label: 'Share of base', value: `${(liquidation.share * 100).toFixed(2)}%` },
        { label: 'Trade date', value: liquidation.line.traded || 'not reported' },
      ],
      evidence: [{ label: 'Form 4 document', value: liquidation.line.traded, url: liquidation.line.url }],
      patterns: ['INS-LIQUIDATE-07'],
    });
  }

  return out;
}
