/**
 * DETECTION QUEUE
 *
 * Holds the incidents the engine produces and treats them as a queue: an incident keeps the
 * moment this browser first saw it, so the panel can say "queued 3s ago" and flash a NEW
 * badge for the first two minutes. When the feed refreshes, incidents that were already in
 * the queue keep their original clock and only genuinely new ones move to the front.
 *
 * Nothing here persists to a server: the queue is a live view of published records, rebuilt
 * from the publishers on every refresh.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SEVERITY_RANK, type CrimeFamily, type CrimeIncident } from './crimeEngine.ts';

export const NEW_WINDOW_MS = 120_000;

export interface CrimeQueueEntry extends CrimeIncident {
  /** First moment this browser saw the incident. */
  seenAt: number;
  isNew: boolean;
  queueNo: number;
}

export interface PatternStat {
  patternId: string;
  count: number;
  entities: number;
  amountUsd: number | null;
  recurring: boolean;
  families: CrimeFamily[];
}

export interface CrimeQueueState {
  entries: CrimeQueueEntry[];
  all: CrimeQueueEntry[];
  newCount: number;
  total: number;
  withAmount: number;
  amountUsd: number;
  families: Array<{ key: CrimeFamily; count: number; amountUsd: number }>;
  patterns: PatternStat[];
  lastSeen: number | null;
  clock: number;
}

const sortKey = (incident: CrimeIncident): number => {
  const severity = SEVERITY_RANK[incident.severity] ?? 0;
  const size = incident.amountUsd ? Math.log10(Math.max(1, incident.amountUsd)) : 0;
  return severity * 100 + size * 10;
};

/**
 * @param incidents incidents produced by this refresh (already the union of every source)
 * @param clockMs   how often the NEW badge and the "seen 4s ago" clock should advance
 */
export function useCrimeQueue(incidents: CrimeIncident[], clockMs = 15_000): CrimeQueueState {
  const seen = useRef(new Map<string, number>());
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), clockMs);
    return () => window.clearInterval(timer);
  }, [clockMs]);

  const all = useMemo<CrimeQueueEntry[]>(() => {
    const now = Date.now();
    for (const incident of incidents) if (!seen.current.has(incident.id)) seen.current.set(incident.id, now);
    const sorted = [...incidents].sort((a, b) => sortKey(b) - sortKey(a) || (b.amountUsd ?? 0) - (a.amountUsd ?? 0));
    return sorted.map((incident, index) => {
      const seenAt = seen.current.get(incident.id) ?? now;
      return {
        ...incident,
        seenAt,
        isNew: now - seenAt < NEW_WINDOW_MS,
        queueNo: index + 1,
      };
    });
  }, [incidents, clock]);

  const stats = useMemo(() => {
    const familyMap = new Map<CrimeFamily, { count: number; amountUsd: number }>();
    const patternMap = new Map<string, { count: number; entities: Set<string>; amountUsd: number; families: Set<CrimeFamily> }>();
    let amountUsd = 0;
    let withAmount = 0;
    for (const entry of all) {
      const family = familyMap.get(entry.family) ?? { count: 0, amountUsd: 0 };
      family.count += 1;
      family.amountUsd += entry.amountUsd ?? 0;
      familyMap.set(entry.family, family);

      for (const patternId of entry.patterns.length ? entry.patterns : [entry.patternId]) {
        const record = patternMap.get(patternId) ?? { count: 0, entities: new Set<string>(), amountUsd: 0, families: new Set<CrimeFamily>() };
        record.count += 1;
        record.entities.add(entry.subject);
        record.amountUsd += entry.amountUsd ?? 0;
        record.families.add(entry.family);
        patternMap.set(patternId, record);
      }
      if (entry.amountUsd !== null) {
        amountUsd += entry.amountUsd;
        withAmount += 1;
      }
    }
    return {
      families: [...familyMap.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.count - a.count),
      patterns: [...patternMap.entries()]
        .map(([patternId, value]) => ({
          patternId,
          count: value.count,
          entities: value.entities.size,
          amountUsd: value.amountUsd || null,
          recurring: value.entities.size >= 3,
          families: [...value.families],
        }))
        .sort((a, b) => b.entities - a.entities || b.count - a.count),
      amountUsd,
      withAmount,
    };
  }, [all]);

  return {
    entries: all,
    all,
    newCount: all.filter((entry) => entry.isNew).length,
    total: all.length,
    withAmount: stats.withAmount,
    amountUsd: stats.amountUsd,
    families: stats.families,
    patterns: stats.patterns,
    lastSeen: all.length ? Math.max(...all.map((entry) => entry.seenAt)) : null,
    clock,
  };
}

/** Milliseconds between an incident being first seen and now, in the panel's own words. */
export function sinceLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
