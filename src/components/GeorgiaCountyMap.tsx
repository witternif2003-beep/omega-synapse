import { useEffect, useMemo, useState } from 'react';
import { Info, Layers, MapPin } from 'lucide-react';
import {
  GEORGIA_COUNTY_PATHS,
  GEORGIA_MAP_VIEWBOX,
} from '../data/georgiaCountyGeometry.ts';
import { COUNTY_SOURCE, GEORGIA_COUNTY_PROFILES } from '../data/georgiaCountyForensic.ts';
import { COUNTY_BANKS_BY_FIPS, GEORGIA_BANK_NAMES } from '../data/georgiaCountyBanks.ts';
import { formatUsd } from '../lib/forensicRisk.ts';
import {
  activeAnomalyBeacons,
  subscribeAnomalyBeacons,
  type AnomalyBeacon,
} from '../lib/anomalyBeacon.ts';

const BEACON_COLOR: Record<string, string> = {
  critical: '#ff1744',
  high: '#ff9100',
  medium: '#ffd740',
  info: '#40c4ff',
};

/**
 * GEORGIA COUNTY BANK MAP
 *
 * Sourced data only. Geometry is real: 159 county boundaries from U.S. Census county
 * boundary data, projected once into an SVG viewBox. Because it is vector, the drawing
 * has no pixel grid to lose - it stays sharp at any display size or zoom, which is the
 * honest version of "very high resolution".
 *
 * Everything else on this panel is a published figure: county names and FIPS codes from
 * the Census county list, branch counts and deposits from the FDIC Summary of Deposits
 * Georgia response, and HHI computed from those deposits. The generated incident dots
 * and the pseudo-signal risk band that this panel used to draw have been removed.
 */

const BASE_FILL = '#12332a';
const ACTIVE_FILL = '#14523f';

/**
 * COUNTY NAMES
 *
 * Each label sits at the area-weighted centroid of that county's own boundary path, so a
 * name lands inside the county it belongs to rather than at the middle of its bounding box
 * (which falls outside the shape for irregular counties). Small, crowded counties are only
 * labelled when there is room, and the selected county is always labelled.
 */
interface CountyLabel {
  fips: string;
  name: string;
  x: number;
  y: number;
  area: number;
}

function centroidOfRing(points: Array<[number, number]>): { x: number; y: number; area: number } {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  const area = twiceArea / 2;
  if (Math.abs(area) < 1e-6) {
    const n = points.length || 1;
    const sum = points.reduce<[number, number]>(
      (acc, [x, y]) => [acc[0] + x, acc[1] + y],
      [0, 0],
    );
    return { x: sum[0] / n, y: sum[1] / n, area: 0 };
  }

  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea), area: Math.abs(area) };
}

function labelForPath(fips: string, name: string, d: string): CountyLabel | null {
  const rings = d
    .split('M')
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z/gi, '')
        .split('L')
        .map((pair) => pair.split(',').map(Number) as [number, number])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    );

  let best: { x: number; y: number; area: number } | null = null;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const candidate = centroidOfRing(ring);
    if (!best || candidate.area > best.area) best = candidate;
  }

  if (!best) return null;
  return { fips, name, x: best.x, y: best.y, area: best.area };
}

export default function GeorgiaCountyMap() {
  const [selectedFips, setSelectedFips] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [beacons, setBeacons] = useState<AnomalyBeacon[]>([]);

  // Beacons are raised by the sourced anomaly feed and expire two minutes after they
  // start, so the map never carries a mark that no current event supports.
  useEffect(() => {
    const unsubscribe = subscribeAnomalyBeacons(setBeacons);
    const ticker = window.setInterval(() => setBeacons(activeAnomalyBeacons()), 5000);
    return () => {
      unsubscribe();
      window.clearInterval(ticker);
    };
  }, []);

  const shapes = useMemo(
    () =>
      GEORGIA_COUNTY_PROFILES.filter((county) => GEORGIA_COUNTY_PATHS[county.fips]).map(
        (county) => ({
          fips: county.fips,
          name: county.name,
          path: GEORGIA_COUNTY_PATHS[county.fips],
        }),
      ),
    [],
  );

  const labelPoints = useMemo(() => {
    const labels = shapes
      .map((shape) => labelForPath(shape.fips, shape.name, shape.path))
      .filter((label): label is CountyLabel => label !== null);
    const areas = labels.map((label) => label.area).sort((a, b) => a - b);
    const threshold = areas.length ? areas[Math.floor(areas.length * 0.45)] : 0;
    return { labels, threshold };
  }, [shapes]);

  const topCounties = useMemo(
    () =>
      [...GEORGIA_COUNTY_PROFILES]
        .filter((county) => county.branches > 0)
        .sort((a, b) => b.depositsUsd - a.depositsUsd)
        .slice(0, 8),
    [],
  );

  const selectedShape = selectedFips
    ? shapes.find((shape) => shape.fips === selectedFips) ?? null
    : null;
  const selectedProfile = selectedFips
    ? GEORGIA_COUNTY_PROFILES.find((county) => county.fips === selectedFips) ?? null
    : null;
  const selectedBanks = selectedFips ? COUNTY_BANKS_BY_FIPS[selectedFips] ?? [] : [];

  const countyFill = (fips: string): string =>
    fips === selectedFips ? ACTIVE_FILL : BASE_FILL;

  return (
    <section className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={15} className="text-emerald-400" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Georgia County Bank Map
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {shapes.length} / {COUNTY_SOURCE.countiesInState} COUNTIES
            </span>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              FDIC SOD {COUNTY_SOURCE.surveyYear}
            </span>
            <span className="px-2 py-0.5 border border-zinc-700 bg-zinc-900/70 text-zinc-400 text-[10px] rounded">
              VECTOR · RESOLUTION INDEPENDENT
            </span>
            <span
              className={`px-2 py-0.5 border text-[10px] rounded ${
                beacons.length
                  ? 'border-rose-500/70 bg-rose-950/50 text-rose-200 animate-pulse'
                  : 'border-zinc-700 bg-zinc-900/70 text-zinc-500'
              }`}
            >
              STROBE {beacons.length} ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowLabels((current) => !current)}
              aria-pressed={showLabels}
              className={`px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
                showLabels
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
            >
              County names
            </button>
          </div>
        </div>

        {/* Disclosure */}
        <div className="flex items-start gap-2 border border-emerald-500/40 bg-emerald-950/20 rounded px-3 py-2">
          <Info size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-emerald-100/90">
            <strong className="text-emerald-300">Sourced data only.</strong> County boundaries are
            the real {shapes.length} Georgia county polygons from U.S. Census boundary data.
            Institution lists, branch counts and deposits are the FDIC Summary of Deposits{' '}
            {COUNTY_SOURCE.surveyYear} Georgia response; HHI is computed from those deposits. The
            generated incident dots and the placeholder risk band this panel used to draw have been
            removed — no shaded score, no simulated incident is shown.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Map */}
          <div className="xl:col-span-2 border border-zinc-800 rounded bg-[#050b0d] overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span className="uppercase tracking-widest">Counties with FDIC-reported branches</span>
              <span className="flex items-center gap-1.5">
                <Layers size={11} className="text-emerald-400" /> tap a county for detail
              </span>
            </div>
            <div className="w-full bg-[#03080a]">
              <svg
                viewBox={`0 0 ${GEORGIA_MAP_VIEWBOX.width} ${GEORGIA_MAP_VIEWBOX.height}`}
                className="w-full h-auto max-h-[70vh]"
                role="img"
                aria-label={`Georgia county map: ${shapes.length} counties`}
              >
                {shapes.map((shape) => {
                  const isActive = shape.fips === selectedFips;
                  return (
                    <path
                      key={shape.fips}
                      d={shape.path}
                      fill={countyFill(shape.fips)}
                      fillOpacity={0.92}
                      stroke={isActive ? '#eafff5' : 'rgba(3, 8, 10, 0.95)'}
                      strokeWidth={isActive ? 2.4 : 0.9}
                      className="cursor-pointer"
                      onClick={() => setSelectedFips(isActive ? null : shape.fips)}
                    >
                      <title>{shape.name} County</title>
                    </path>
                  );
                })}

                {/* Two-minute anomaly beacons: a new event strobes on the county where the
                    institution's branches are reported, then clears itself. */}
                <g pointerEvents="none">
                  {beacons.map((beacon) => {
                    const color = BEACON_COLOR[beacon.severity] ?? '#ff1744';
                    const secondsLeft = Math.max(0, Math.round((beacon.expiresAt - Date.now()) / 1000));
                    return (
                      <g key={beacon.id}>
                        <circle
                          className="omega-beacon-ring"
                          cx={beacon.x}
                          cy={beacon.y}
                          r={24}
                          fill="none"
                          stroke={color}
                          strokeWidth={3}
                        />
                        <circle
                          className="omega-beacon-ring"
                          cx={beacon.x}
                          cy={beacon.y}
                          r={24}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.2}
                          style={{ animationDelay: '-0.5s' }}
                        />
                        <circle
                          className="omega-beacon-core"
                          cx={beacon.x}
                          cy={beacon.y}
                          r={5.5}
                          fill={color}
                          stroke="#03080a"
                          strokeWidth={1.2}
                        />
                        <text
                          x={beacon.x + 10}
                          y={beacon.y - 10}
                          fontSize={9}
                          fill={color}
                          stroke="#03080a"
                          strokeWidth={2.4}
                          paintOrder="stroke"
                          fontWeight={700}
                        >
                          {beacon.county} · {secondsLeft}s
                        </text>
                      </g>
                    );
                  })}
                </g>

                {showLabels && (
                  <g pointerEvents="none">
                    {labelPoints.labels
                      .filter(
                        (label) =>
                          label.area >= labelPoints.threshold || label.fips === selectedFips,
                      )
                      .map((label) => (
                        <text
                          key={label.fips}
                          x={label.x}
                          y={label.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={label.fips === selectedFips ? 15 : 11}
                          fontWeight={label.fips === selectedFips ? 700 : 500}
                          fill={label.fips === selectedFips ? '#ffffff' : '#eafff5'}
                          stroke="#03080a"
                          strokeWidth={2.6}
                          paintOrder="stroke"
                        >
                          {label.name}
                        </text>
                      ))}
                  </g>
                )}
              </svg>
            </div>
            <div className="px-3 py-2 border-t border-zinc-800 flex flex-wrap items-center gap-3 text-[9px] text-zinc-500">
              <span className="uppercase tracking-widest">Geometry</span>
              <span>U.S. Census county boundaries · state FIPS 13</span>
              <span className="ml-auto">
                {shapes.length} county polygons · beacons last 120s
              </span>
            </div>
          </div>

          {/* Detail panel */}
          <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-3 text-[11px]">
            {selectedShape && selectedProfile ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      County detail
                    </div>
                    <div className="text-sm font-bold text-white">
                      {selectedShape.name} County
                    </div>
                    <div className="text-[10px] text-zinc-500">FIPS {selectedShape.fips}</div>
                  </div>
                  <button
                    onClick={() => setSelectedFips(null)}
                    className="text-[10px] text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5 hover:text-white cursor-pointer"
                  >
                    clear
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-800 pt-2">
                  <div className="text-zinc-500">Institutions</div>
                  <div className="text-right text-zinc-200">{selectedProfile.institutions}</div>
                  <div className="text-zinc-500">Branches</div>
                  <div className="text-right text-zinc-200">{selectedProfile.branches}</div>
                  <div className="text-zinc-500">Deposits</div>
                  <div className="text-right text-zinc-200">
                    {formatUsd(selectedProfile.depositsUsd)}
                  </div>
                  <div className="text-zinc-500">HHI</div>
                  <div className="text-right text-zinc-200">{selectedProfile.hhi}</div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-1">
                    Banks in county · FDIC SOD {COUNTY_SOURCE.surveyYear}
                  </div>
                  {selectedBanks.length === 0 ? (
                    <div className="text-[10px] text-zinc-600">
                      No FDIC-insured branch reports in this county.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-[10px]">
                        <tbody>
                          {selectedBanks.map((bank) => (
                            <tr
                              key={GEORGIA_BANK_NAMES[bank[0]]}
                              className="border-t border-zinc-900/80 align-top"
                            >
                              <td className="py-1 pr-1 text-zinc-300 leading-snug">
                                {GEORGIA_BANK_NAMES[bank[0]]}
                              </td>
                              <td className="py-1 text-right text-zinc-500 whitespace-nowrap">
                                {bank[1]} br
                              </td>
                              <td className="py-1 text-right text-zinc-400 whitespace-nowrap">
                                {formatUsd(bank[2])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                  Top counties by FDIC branch deposits
                </div>
                {topCounties.map((county) => (
                  <button
                    key={county.fips}
                    onClick={() => setSelectedFips(county.fips)}
                    className="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded border border-transparent hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                  >
                    <span className="text-zinc-300">{county.name}</span>
                    <span className="tabular-nums text-zinc-400">
                      {formatUsd(county.depositsUsd)}
                    </span>
                  </button>
                ))}
                <div className="text-[9px] text-zinc-600 pt-1 leading-relaxed">
                  Click any county on the map for its branch count, deposits, HHI and the list of
                  banks operating there.
                </div>
                <div className="text-[9px] text-zinc-600 border-t border-zinc-900 pt-2 leading-relaxed">
                  Geometry: U.S. Census county boundaries (state FIPS 13). Banks:{' '}
                  {COUNTY_SOURCE.institutionData}.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
