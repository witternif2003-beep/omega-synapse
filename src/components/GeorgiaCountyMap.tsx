import { useMemo, useState } from 'react';
import { Crosshair, Info, Layers, MapPin } from 'lucide-react';
import {
  GEORGIA_COUNTY_PATHS,
  GEORGIA_MAP_VIEWBOX,
  projectLatLng,
} from '../data/georgiaCountyGeometry.ts';
import { COUNTY_SOURCE, GEORGIA_COUNTY_PROFILES } from '../data/georgiaCountyForensic.ts';
import { COUNTY_BANKS_BY_FIPS, GEORGIA_BANK_NAMES } from '../data/georgiaCountyBanks.ts';
import { GEORGIA_ESPIONAGE_ANOMALIES } from '../data/georgiaEspionageLayer.ts';
import {
  assessCounties,
  formatUsd,
  RISK_BAND_COLORS,
  RISK_BAND_LABELS,
} from '../lib/forensicRisk.ts';

/**
 * GEORGIA COUNTY INCIDENT MAP
 *
 * Geometry is real: 159 county boundaries from U.S. Census county boundary data,
 * projected once into an SVG viewBox. Because it is vector, the drawing has no pixel
 * grid to lose - it stays sharp at any display size or zoom, which is the honest
 * version of "very high resolution".
 *
 * Incident marks are the demo records already present in this dashboard
 * (src/data/georgiaEspionageLayer.ts), placed at the coordinates stored with each
 * record. They are illustrative, not observations of real activity. County shading in
 * risk mode is the same illustrative score as the county table; bank lists are real
 * FDIC Summary of Deposits data.
 */

const SNAPSHOT_ID = 'fiscal-2025-sod';

/** Lowest value on the incident scale: still visibly a county, never background. */
const ZERO_INCIDENT_FILL = '#12332a';

type MapMode = 'INCIDENTS' | 'SCORE';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#f43f5e',
  HIGH: '#f59e0b',
  MEDIUM: '#22d3ee',
  INFO: '#94a3b8',
};

function countyKey(raw: string): string {
  return (raw || '').split('/')[0].trim();
}

function incidentColor(count: number, max: number): string {
  if (count <= 0) return ZERO_INCIDENT_FILL;
  const t = Math.min(1, count / Math.max(1, max));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [22, 74, 58]],
    [0.45, [245, 158, 11]],
    [1, [244, 63, 94]],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (t - lo[0]) / span;
  const rgb = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * k));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

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

interface IncidentMark {
  id: string;
  facility: string;
  county: string;
  type: string;
  level: string;
  x: number;
  y: number;
}

export default function GeorgiaCountyMap() {
  const [mode, setMode] = useState<MapMode>('INCIDENTS');
  const [selectedFips, setSelectedFips] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const assessments = useMemo(
    () => assessCounties(GEORGIA_COUNTY_PROFILES, SNAPSHOT_ID),
    [],
  );
  const assessmentByFips = useMemo(
    () => new Map(assessments.map((assessment) => [assessment.fips, assessment])),
    [assessments],
  );

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

  const marks: IncidentMark[] = useMemo(
    () =>
      GEORGIA_ESPIONAGE_ANOMALIES.map((record) => {
        const { x, y } = projectLatLng(
          record.coordinates?.lat ?? 0,
          record.coordinates?.lng ?? 0,
        );
        return {
          id: record.anomaly_id,
          facility: record.facility,
          county: countyKey(record.county),
          type: String(record.type),
          level: String(record.threat_level),
          x,
          y,
        };
      }),
    [],
  );

  const incidentsByCounty = useMemo(() => {
    const counts = new Map<string, IncidentMark[]>();
    marks.forEach((mark) => {
      const list = counts.get(mark.county) ?? [];
      list.push(mark);
      counts.set(mark.county, list);
    });
    return counts;
  }, [marks]);

  const maxIncidents = useMemo(
    () => Math.max(1, ...Array.from(incidentsByCounty.values(), (list) => list.length)),
    [incidentsByCounty],
  );

  const topIncidentCounties = useMemo(
    () =>
      Array.from(incidentsByCounty.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 6),
    [incidentsByCounty],
  );

  const selectedShape = selectedFips
    ? shapes.find((shape) => shape.fips === selectedFips) ?? null
    : null;
  const selectedAssessment = selectedFips ? assessmentByFips.get(selectedFips) ?? null : null;
  const selectedProfile = selectedFips
    ? GEORGIA_COUNTY_PROFILES.find((county) => county.fips === selectedFips) ?? null
    : null;
  const selectedIncidents = selectedShape
    ? incidentsByCounty.get(selectedShape.name) ?? []
    : [];
  const selectedBanks = selectedFips ? COUNTY_BANKS_BY_FIPS[selectedFips] ?? [] : [];

  const countyFill = (name: string, fips: string): string => {
    if (mode === 'INCIDENTS') {
      return incidentColor(incidentsByCounty.get(name)?.length ?? 0, maxIncidents);
    }
    const assessment = assessmentByFips.get(fips);
    return assessment ? RISK_BAND_COLORS[assessment.band] : ZERO_INCIDENT_FILL;
  };

  return (
    <section className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={15} className="text-emerald-400" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Georgia County Incident Map
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {shapes.length} / {COUNTY_SOURCE.countiesInState} COUNTIES
            </span>
            <span className="px-2 py-0.5 border border-cyan-500/50 bg-cyan-950/60 text-cyan-300 text-[10px] rounded">
              {marks.length} INCIDENT MARKS
            </span>
            <span className="px-2 py-0.5 border border-zinc-700 bg-zinc-900/70 text-zinc-400 text-[10px] rounded">
              VECTOR · RESOLUTION INDEPENDENT
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
            <button
              onClick={() => setMode('INCIDENTS')}
              className={`px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
                mode === 'INCIDENTS'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
            >
              Incident density
            </button>
            <button
              onClick={() => setMode('SCORE')}
              className={`px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
                mode === 'SCORE'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
            >
              Risk score
            </button>
          </div>
        </div>

        {/* Disclosure */}
        <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-950/25 rounded px-3 py-2">
          <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            <strong className="text-amber-300">What this shows.</strong> County boundaries are
            the real 159 Georgia county polygons from U.S. Census boundary data, drawn as vector
            paths so they stay sharp at any size. County shading and the incident marks come from
            this dashboard&apos;s own demo records, placed at the coordinates stored with each
            record — illustrative, not observations of real activity. Bank lists and deposit
            figures are real FDIC Summary of Deposits {COUNTY_SOURCE.surveyYear} data.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Map */}
          <div className="xl:col-span-2 border border-zinc-800 rounded bg-[#050b0d] overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span className="uppercase tracking-widest">
                {mode === 'INCIDENTS' ? 'Incidents per county' : 'Illustrative risk band'}
              </span>
              <span className="flex items-center gap-1.5">
                <Layers size={11} className="text-emerald-400" /> tap a county for detail
              </span>
            </div>
            <div className="w-full bg-[#03080a]">
              <svg
                viewBox={`0 0 ${GEORGIA_MAP_VIEWBOX.width} ${GEORGIA_MAP_VIEWBOX.height}`}
                className="w-full h-auto max-h-[70vh]"
                role="img"
                aria-label={`Georgia county map: ${shapes.length} counties and ${marks.length} incident marks`}
              >
                {shapes.map((shape) => {
                  const assessment = assessmentByFips.get(shape.fips);
                  const isActive = shape.fips === selectedFips;
                  const incidents = incidentsByCounty.get(shape.name)?.length ?? 0;
                  return (
                    <path
                      key={shape.fips}
                      d={shape.path}
                      fill={countyFill(shape.name, shape.fips)}
                      fillOpacity={0.92}
                      stroke={isActive ? '#eafff5' : 'rgba(3, 8, 10, 0.95)'}
                      strokeWidth={isActive ? 2.4 : 0.9}
                      className="cursor-pointer"
                      onClick={() => setSelectedFips(isActive ? null : shape.fips)}
                    >
                      <title>
                        {shape.name} County · {incidents} incident
                        {incidents === 1 ? '' : 's'}
                        {assessment ? ` · score ${(assessment.score * 100).toFixed(1)}%` : ''}
                      </title>
                    </path>
                  );
                })}

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

                {marks.map((mark) => (
                  <circle
                    key={mark.id}
                    cx={mark.x}
                    cy={mark.y}
                    r={3.4}
                    fill={SEVERITY_COLORS[mark.level] ?? '#94a3b8'}
                    stroke="#03080a"
                    strokeWidth={0.6}
                    fillOpacity={0.95}
                  >
                    <title>
                      {mark.id} · {mark.type} · {mark.county} County · {mark.level}
                    </title>
                  </circle>
                ))}
              </svg>
            </div>
            <div className="px-3 py-2 border-t border-zinc-800 flex flex-wrap items-center gap-3 text-[9px] text-zinc-500">
              <span className="uppercase tracking-widest">marks</span>
              {Object.entries(SEVERITY_COLORS).map(([level, color]) => (
                <span key={level} className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {level}
                </span>
              ))}
              <span className="ml-auto">
                {shapes.length} county polygons · {marks.length} marks
              </span>
            </div>
          </div>

          {/* Detail panel */}
          <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-3 text-[11px]">
            {selectedShape && selectedProfile && selectedAssessment ? (
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
                  <div className="text-zinc-500">Illustrative score</div>
                  <div
                    className="text-right font-bold"
                    style={{ color: RISK_BAND_COLORS[selectedAssessment.band] }}
                  >
                    {(selectedAssessment.score * 100).toFixed(1)}% ·{' '}
                    {RISK_BAND_LABELS[selectedAssessment.band]}
                  </div>
                  <div className="text-zinc-500">Incident marks</div>
                  <div className="text-right text-zinc-200">{selectedIncidents.length}</div>
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
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-1.5 mb-1">
                    <Crosshair size={10} className="text-rose-400" /> Incidents in county
                  </div>
                  {selectedIncidents.length === 0 ? (
                    <div className="text-[10px] text-zinc-600">
                      No incident marks carry this county.
                    </div>
                  ) : (
                    <div className="max-h-32 overflow-auto space-y-1 pr-1">
                      {selectedIncidents.map((incident) => (
                        <div
                          key={incident.id}
                          className="border border-zinc-800 rounded px-1.5 py-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: SEVERITY_COLORS[incident.level] ?? '#94a3b8',
                              }}
                            />
                            <span className="text-[9px] text-zinc-500">{incident.id}</span>
                            <span className="ml-auto text-[9px] text-zinc-400">
                              {incident.level}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-300 leading-snug">
                            {incident.facility}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                    <div className="max-h-48 overflow-auto">
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
                  Top counties by incident marks
                </div>
                {topIncidentCounties.map(([name, list]) => {
                  const shape = shapes.find((candidate) => candidate.name === name);
                  return (
                    <button
                      key={name}
                      onClick={() => shape && setSelectedFips(shape.fips)}
                      className="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded border border-transparent hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                    >
                      <span className="text-zinc-300">{name}</span>
                      <span className="tabular-nums text-zinc-400">
                        {list.length} mark{list.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  );
                })}
                <div className="text-[9px] text-zinc-600 pt-1 leading-relaxed">
                  Click any county on the map for its score, its incident marks and the list of
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
