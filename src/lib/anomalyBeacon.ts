/**
 * ANOMALY BEACONS
 *
 * A beacon is a short-lived map marker raised when the sourced anomaly stream reports a
 * new event. It lives for exactly two minutes (120 000 ms) and then disappears on its
 * own. This module is the shared store: the espionage panel publishes, the county map
 * subscribes. Nothing here invents an event - a beacon exists only because an event
 * arrived from the stream.
 */

export const BEACON_TTL_MS = 120_000;

export type BeaconSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface AnomalyBeacon {
  id: string;
  /** Georgia county the institution's branches sit in, as reported by FDIC SOD. */
  county: string;
  /** Map viewBox coordinates, from the institution's deposit-weighted marker. */
  x: number;
  y: number;
  label: string;
  severity: BeaconSeverity;
  startedAt: number;
  expiresAt: number;
}

type Listener = (beacons: AnomalyBeacon[]) => void;

let beacons: AnomalyBeacon[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  const now = Date.now();
  const live = beacons.filter((beacon) => beacon.expiresAt > now);
  if (live.length !== beacons.length) beacons = live;
  for (const listener of listeners) listener(beacons);
}

export function publishAnomalyBeacon(
  beacon: Omit<AnomalyBeacon, 'startedAt' | 'expiresAt'>,
): void {
  const now = Date.now();
  const existing = beacons.find((item) => item.id === beacon.id);
  if (existing) {
    existing.expiresAt = now + BEACON_TTL_MS;
    emit();
    return;
  }
  beacons = [
    ...beacons.filter((item) => item.expiresAt > now),
    { ...beacon, startedAt: now, expiresAt: now + BEACON_TTL_MS },
  ].slice(-12);
  emit();
}

export function subscribeAnomalyBeacons(listener: Listener): () => void {
  listeners.add(listener);
  listener(beacons);
  return () => {
    listeners.delete(listener);
  };
}

export function activeAnomalyBeacons(): AnomalyBeacon[] {
  const now = Date.now();
  return beacons.filter((beacon) => beacon.expiresAt > now);
}
