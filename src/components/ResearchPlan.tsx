import { Info, FlaskConical, BookOpen, Target, ShieldCheck } from 'lucide-react';
import { POST_DOCTORATE_RESEARCH_PLAN } from '../data/georgiaEspionageLayer.ts';
import {
  COUNTY_BANK_SOURCE,
  COUNTY_BANKS_BY_FIPS,
} from '../data/georgiaCountyBanks.ts';
import { COUNTY_SOURCE, GEORGIA_COUNTY_PROFILES } from '../data/georgiaCountyForensic.ts';

/**
 * POST-DOCTORATE WEB RESEARCH PLAN
 *
 * Renders the research plan that already ships in this repository's data layer and is
 * served by GET /api/espionage/research-plan. The plan itself is a study design: phases,
 * objectives, citations, deliverables. The counts shown around it are computed from the
 * data actually present here, so nothing on this panel is a made-up figure.
 */

const scopedCounties = GEORGIA_COUNTY_PROFILES.length;
const countiesWithBanks = Object.keys(COUNTY_BANKS_BY_FIPS).length;
const districts = ['N.D. Ga. (Atlanta)', 'M.D. Ga. (Macon)', 'S.D. Ga. (Savannah/Augusta)'];

export default function ResearchPlan() {
  return (
    <section className="w-full bg-[#04090b] border-t border-emerald-900/40 font-mono text-zinc-200">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical size={15} className="text-emerald-400" />
            <h2 className="text-sm font-bold tracking-widest text-emerald-200 uppercase">
              // Post-Doctorate Research Plan
            </h2>
            <span className="px-2 py-0.5 border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 text-[10px] rounded">
              {POST_DOCTORATE_RESEARCH_PLAN.length} PHASES
            </span>
            <span className="px-2 py-0.5 border border-zinc-700 bg-zinc-900/70 text-zinc-400 text-[10px] rounded">
              STUDY DESIGN · DEFENSIVE
            </span>
          </div>
          <div className="text-[10px] text-zinc-500">
            served by <strong className="text-zinc-300">GET /api/espionage/research-plan</strong>
          </div>
        </div>

        <div className="flex items-start gap-2 border border-amber-500/50 bg-amber-950/25 rounded px-3 py-2">
          <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            <strong className="text-amber-300">Scope of this plan.</strong> This is a study
            design for defensive cyber-threat research inside Georgia: what would be examined,
            against which statutes and standards, and what each phase would produce. It is not a
            claim that the studies have been completed, and it carries no agency case numbers,
            loss figures or incident attributions. Counts below are computed from the data in
            this repository.
          </p>
        </div>

        {/* Scope figures, all computed */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { label: 'Counties in scope', value: String(scopedCounties) },
            { label: 'Counties with FDIC branches', value: String(countiesWithBanks) },
            { label: 'Federal districts', value: String(districts.length) },
          ].map((stat) => (
            <div key={stat.label} className="border border-zinc-800 bg-[#070f12] rounded px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                {stat.label}
              </div>
              <div className="text-sm font-bold text-emerald-300">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Revision note: what this build actually carries. Every figure below is computed
            from the data in the repository, so the plan is reviewed against the real state
            rather than restated. */}
        <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">
            Plan revision · what this build carries
          </div>
          <ul className="text-[10.5px] text-zinc-300 leading-relaxed list-disc pl-4 space-y-1">
            <li>
              {scopedCounties} county boundaries drawn from U.S. Census geometry, each named on
              the map and openable for its own record.
            </li>
            <li>
              {COUNTY_BANK_SOURCE.countyBankRows} county-institution rows across{' '}
              {COUNTY_BANK_SOURCE.countiesWithBanks} counties, listed both in the county
              drill-down and in the map detail panel.
            </li>
            <li>
              No generated incident records: the dashboard carries none any more. Incidents are
              only ever shown as sourced OSINT headlines with their publisher, timestamp and link.
            </li>
            <li>
              Counters now report what is actually held: no fixed offsets and no minimum floors,
              with the stored total taken from the server&apos;s own count.
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {POST_DOCTORATE_RESEARCH_PLAN.map((phase) => (
            <div key={phase.phase} className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 border border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-[9px] rounded font-bold">
                  {phase.phase}
                </span>
              </div>
              <h3 className="text-[12px] font-bold text-white leading-snug">{phase.title}</h3>

              <div>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-zinc-500">
                  <Target size={10} className="text-cyan-400" /> Objective
                </div>
                <p className="text-[10.5px] text-zinc-300 leading-relaxed">{phase.objective}</p>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-zinc-500">
                  <BookOpen size={10} className="text-indigo-300" /> Sources & standards
                </div>
                <ul className="text-[10px] text-zinc-400 leading-relaxed list-disc pl-4">
                  {phase.authoritativeCitations.map((citation) => (
                    <li key={citation}>{citation}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">Deliverable</div>
                <p className="text-[10.5px] text-zinc-300 leading-relaxed">
                  {phase.operationalDeliverable}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-zinc-500">
                  <ShieldCheck size={10} className="text-emerald-400" /> Defensive application
                </div>
                <p className="text-[10.5px] text-emerald-200/80 leading-relaxed">
                  {phase.defensiveSecurityApplication}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Method + data sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-2">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">
              How the study would be run
            </div>
            <ol className="text-[10.5px] text-zinc-300 leading-relaxed list-decimal pl-4 space-y-1">
              <li>
                Fix the jurisdiction: all {scopedCounties} Georgia counties, grouped by the{' '}
                {districts.length} federal districts ({districts.join(', ')}).
              </li>
              <li>
                Fix the exclusion set before any observation: banks and financial institutions,
                schools and universities, military installations, and law-enforcement or court
                systems are declared out of scope and dropped at ingest.
              </li>
              <li>
                Describe incidents only with the fields the record actually carries — county,
                facility type, category, timestamp — and treat any value without a source as
                unknown rather than estimated.
              </li>
              <li>
                Report reproducibility: every figure regenerated from the cited public datasets
                (Census county list, FDIC Summary of Deposits, Census boundaries), with the
                survey year named.
              </li>
              <li>
                Publish negative results: counties with zero branches, or with no incident
                records, are reported as zero and not padded.
              </li>
            </ol>
          </div>

          <div className="border border-zinc-800 rounded bg-[#070f12] p-3 space-y-2">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">
              Data sources this plan draws on
            </div>
            <ul className="text-[10.5px] text-zinc-300 leading-relaxed space-y-1.5">
              <li>
                <span className="text-zinc-500">Counties & FIPS:</span> {COUNTY_SOURCE.countyList}
              </li>
              <li>
                <span className="text-zinc-500">Banks & deposits:</span>{' '}
                {COUNTY_BANK_SOURCE.institutionData} — {COUNTY_BANK_SOURCE.countyBankRows}{' '}
                county-institution rows across {COUNTY_BANK_SOURCE.countiesWithBanks} counties.
              </li>
              <li>
                <span className="text-zinc-500">Boundaries:</span> U.S. Census county boundary
                geometry (state FIPS 13), {scopedCounties} polygons.
              </li>
              <li>
                <span className="text-zinc-500">Incident corpus:</span> the live OSINT stream —
                real headlines with their publisher, timestamp and URL. No generated record is
                used anywhere on this dashboard.
              </li>
              <li>
                <span className="text-zinc-500">Standards referenced:</span> 18 U.S.C. § 1832,
                Fed. R. Evid. 901/902, O.C.G.A. § 50-18-72, NIST SP 800-207, NIST SP 800-53
                Rev. 5, FBI CJIS Security Policy v6.0.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
