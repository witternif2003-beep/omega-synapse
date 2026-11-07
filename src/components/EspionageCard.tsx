import React, { useState } from 'react';
import { Zap, Globe, ShieldAlert, Cpu, Lock, FileText, CheckCircle2, Copy, Check } from 'lucide-react';

export interface EspionageCardProps {
  anomalyData?: {
    id?: string;
    status?: string;
    jurisdiction?: string;
    tag?: string;
    timestamp?: string;
    title?: string;
    description?: string;
    identity?: string;
    municipal_asset_id?: string;
    anomaly_type?: string;
    coordinates?: { lat: number; lng: number };
    telemetry?: {
      lsm?: string;
      jitter?: string;
      cipher?: string;
      execution_time_ns?: string;
      execution_time_ms?: string;
      heap_used_mb?: string;
      rss_mb?: string;
    };
    tags?: {
      it?: string;
      exp?: string;
      docket?: string;
    };
    evidence?: {
      exhibit?: string;
      text?: string;
      sha256?: string;
      admissibility?: string;
    };
    entities?: string[];
    workaroundStatus?: string;
    redaction_status?: string;
  };
  onInspect?: () => void;
  onDeploy?: () => void;
}

export const EspionageCard: React.FC<EspionageCardProps> = ({ anomalyData, onInspect, onDeploy }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'fre902' | 'omega'>('omega');

  // Fallback data matching screenshot if no props are passed
  const data = anomalyData || {
    id: '902',
    status: 'CRITICAL',
    jurisdiction: 'DOJ N.D. GA...',
    tag: 'ESPIONAGE / FRE 902',
    timestamp: '2026-11-07 14:50:26',
    title: 'The Coca-Cola Company: Economic Espionage Act Precedent (U.S. v. Joya Williams, 1:06-CR-313-JEC) & Dual-Custody HSM Kernel Defense',
    description: 'Verified federal corporate espionage prosecution under 18 U.S.C. § 1832 (Theft of Trade Secrets) following unauthorized exfiltration of 14 confidential formulation documents and an unreleased product sample ("Project Star") from Coca-Cola headquarters on North Avenue in Atlanta.',
    telemetry: {
      lsm: '4.8 µs',
      jitter: '13.2 ps',
      cipher: '4096-bit RSA / 256-bit ECC'
    },
    tags: {
      it: 'Linux Security Module (LSM) eBPF Hook Active',
      exp: '$1.5M Exfiltration Bounty Thwarted ($18.4B Trade Secret)',
      docket: '1:06-CR-313-JEC (N.D. Ga.)'
    },
    evidence: {
      exhibit: 'GX-1',
      text: "I have information that should be of very high value to your company. I can provide you with detailed information on Coca-Cola's upcoming marketing and formulation plans, as well as an official 20-oz unreleased sample labeled 'Project Star' taken from the North Avenue executive offices in Atlanta. This information is extremely confidential and known only to top management. Price: $1.5 million USD in cashier's checks or cash transfer. Contact code: 'DIRK'.",
      sha256: '7d4a21e49b81cf0508a8e3d64095bb1201cbef187a5369ba0104fc29bb467ae1',
      admissibility: 'ADMISSIBLE UNDER FED. R. EVID. 901(b)(4) & FRE 902(11)'
    },
    entities: ['Coca-Cola', 'Georgia State Proprietary Tech'],
    workaroundStatus: 'Deployed'
  };

  const handleCopy = () => {
    if (data.evidence?.text) {
      navigator.clipboard.writeText(data.evidence.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full bg-[#070d10] font-mono text-slate-200 p-4 border border-zinc-700/80 rounded-lg shadow-2xl space-y-3.5">
      
      {/* Top Filter Buttons (High Contrast & Coordinating Accents) */}
      <div className="flex flex-wrap gap-2 mb-2 text-xs tracking-wider uppercase font-bold">
        <span className="px-2.5 py-1 border border-zinc-600 bg-zinc-800 text-zinc-100 rounded">
          TELEMETRY DOMAIN:
        </span>
        <span className="px-2.5 py-1 border border-emerald-500/60 bg-emerald-950/80 text-emerald-200 rounded shadow-[0_0_8px_rgba(16,185,129,0.3)]">
          ALL INTEL (170)
        </span>
        <span className="px-2.5 py-1 border border-cyan-500/60 bg-cyan-950/80 text-cyan-200 rounded flex items-center gap-1 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
          <Zap size={11} className="text-cyan-400" /> IT & ADMIN (88)
        </span>
        <span className="px-2.5 py-1 border border-amber-500/60 bg-amber-950/80 text-amber-200 rounded flex items-center gap-1 shadow-[0_0_8px_rgba(245,158,11,0.3)]">
          🏛️ FINANCE LAYER (10)
        </span>
        <span className="px-2.5 py-1 border border-teal-500/60 bg-teal-950/80 text-teal-200 rounded flex items-center gap-1 shadow-[0_0_8px_rgba(20,184,166,0.3)]">
          <Globe size={11} className="text-teal-400" /> DUAL IT+FIN (1)
        </span>
        <span className="px-2.5 py-1 border border-purple-500/60 bg-purple-950/80 text-purple-200 rounded flex items-center gap-1 shadow-[0_0_8px_rgba(168,85,247,0.3)]">
          <ShieldAlert size={11} className="text-purple-400" /> COUNTER-ESPIONAGE (71)
        </span>
      </div>

      {/* Main Card Container */}
      <div className="border border-emerald-500/50 bg-[#09130d] rounded-lg overflow-hidden relative shadow-[0_0_25px_rgba(34,197,94,0.12)]">
        
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-500"></div>

        <div className="p-4 space-y-4">
          
          {/* Header Row */}
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-rose-400 font-extrabold tracking-widest text-sm drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                {data.status || 'CRITICAL'}
              </span>
              <span className="text-zinc-500 font-bold">·</span>
              <span className="text-zinc-200 font-semibold">{data.jurisdiction || 'DOJ N.D. Ga.'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 border border-purple-500/70 bg-purple-950/80 text-purple-200 rounded text-[11px] font-bold shadow-[0_0_8px_rgba(168,85,247,0.3)]">
                {data.tag || 'ESPIONAGE / FRE 902'}
              </span>
              <span className="text-zinc-300 text-xs font-semibold">{data.timestamp || '2026-11-07 14:50:26'}</span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-base font-bold text-white leading-snug tracking-wide">
            {data.title}
          </h2>

          {/* Description */}
          <p className="text-xs text-slate-200 leading-relaxed font-medium">
            {data.description}
          </p>

          {/* Telemetry Bar */}
          {data.telemetry && (
            <div className="bg-[#0b1b12] border border-emerald-500/60 p-2.5 rounded-md flex flex-wrap items-center gap-3 text-xs text-emerald-300 font-semibold shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]">
              <Zap size={15} className="text-emerald-400 shrink-0" />
              <span>
                LSM Guard: <strong className="text-white">{data.telemetry.lsm || '4.8 µs'}</strong> · Jitter: <strong className="text-white">{data.telemetry.jitter || '13.2 ps'}</strong> · Cipher: <strong className="text-cyan-300">{data.telemetry.cipher || '4096-bit RSA / 256-bit ECC'}</strong>
              </span>
            </div>
          )}

          {/* Data Tags */}
          {data.tags && (
            <div className="flex flex-col gap-1.5 text-xs font-semibold">
              {data.tags.it && (
                <span className="text-cyan-200 border border-cyan-500/60 bg-cyan-950/70 px-2.5 py-1 rounded w-fit flex items-center gap-1.5 shadow-[0_0_8px_rgba(6,182,212,0.2)]">
                  <Cpu size={12} className="text-cyan-400" /> IT: {data.tags.it}
                </span>
              )}
              {data.tags.exp && (
                <span className="text-amber-200 border border-amber-500/60 bg-amber-950/70 px-2.5 py-1 rounded w-fit flex items-center gap-1.5 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                  EXP: {data.tags.exp}
                </span>
              )}
              {data.tags.docket && (
                <span className="text-purple-200 border border-purple-500/60 bg-purple-950/70 px-2.5 py-1 rounded w-fit flex items-center gap-1.5 shadow-[0_0_8px_rgba(168,85,247,0.2)]">
                  DOCKET: {data.tags.docket}
                </span>
              )}
            </div>
          )}

          {/* Decrypted Plaintext Evidence Box */}
          <div className="border border-emerald-500/70 bg-[#02050b] rounded-lg p-3.5 relative shadow-[0_0_20px_rgba(34,197,94,0.18)] space-y-2">
            <div className="flex flex-wrap justify-between items-center mb-2 border-b border-emerald-900/60 pb-2 gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-extrabold">
                <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                <div className="flex items-center gap-1.5 bg-black/70 border border-emerald-800/80 rounded-md p-1">
                  <button
                    onClick={() => setViewMode('omega')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      viewMode === 'omega' ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/80 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    // OMEGA EXHIBIT (UNREDACTED)
                  </button>
                  <button
                    onClick={() => setViewMode('fre902')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      viewMode === 'fre902' ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/80 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    // FRE 902 DOCKET EXHIBIT
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-cyan-300 font-mono font-semibold">4096-RSA / AES-256-GCM</span>
                <button
                  onClick={() => {
                    const omegaText = `[DECRYPTED PLAINTEXT // OMEGA EXHIBIT]:\n"Subject Identity: ${data.identity || 'John Doe, Contractor ID: 9921'}. Asset Involved: ${data.municipal_asset_id || 'GA-STATE-VEH-404'}. Anomaly Class: ${data.anomaly_type || 'ESPIONAGE'}. Coordinates: Lat ${data.coordinates?.lat ?? 33.7490}, Lng ${data.coordinates?.lng ?? -84.3880}."`;
                    const textToCopy = viewMode === 'omega' ? omegaText : (data.evidence?.text || omegaText);
                    navigator.clipboard.writeText(textToCopy);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-2 py-1 hover:text-white transition-all bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/60 rounded text-xs flex items-center gap-1 cursor-pointer font-extrabold text-emerald-200"
                >
                  {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                  <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>
            
            {viewMode === 'omega' ? (
              <div className="text-xs text-emerald-300 leading-relaxed font-mono whitespace-pre-wrap select-text font-normal p-2.5 bg-black/60 rounded border border-emerald-900/40">
                <span className="text-emerald-400 font-bold block mb-1">[DECRYPTED PLAINTEXT // OMEGA EXHIBIT]:</span>
                "Subject Identity: {data.identity || 'John Doe, Contractor ID: 9921'}. Asset Involved: {data.municipal_asset_id || 'GA-STATE-VEH-404'}.<br/>
                Anomaly Class: {data.anomaly_type || 'ESPIONAGE'}. Coordinates: Lat {data.coordinates?.lat ?? 33.7490}, Lng {data.coordinates?.lng ?? -84.3880}."
              </div>
            ) : (
              <div className="text-xs text-emerald-300 leading-relaxed font-mono whitespace-pre-wrap select-text font-normal p-2.5 bg-black/60 rounded border border-emerald-900/40">
                <span className="text-emerald-400 font-bold block mb-1">[DECRYPTED PLAINTEXT // FBI EVIDENCE EXHIBIT {data.evidence?.exhibit || 'GX-1'}]:</span>
                "{data.evidence?.text || "Unauthorized exfiltration of 14 confidential formulation documents and an unreleased product sample ('Project Star') from corporate headquarters in Atlanta."}"
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center mt-3 text-xs text-zinc-300 border-t border-emerald-900/40 pt-2 gap-2">
              <span className="truncate max-w-xs font-mono">
                STATUS: <strong className="text-emerald-300 font-extrabold">{data.redaction_status || 'UNREDACTED_CLEARED_OMEGA'}</strong>
              </span>
              <span className="text-cyan-300 font-extrabold font-mono">
                {viewMode === 'omega' ? 'DIRECT TELEMETRY ESCALATION // LEVEL 10+' : (data.evidence?.admissibility || 'FED. R. EVID. 902(11) CERTIFIED')}
              </span>
            </div>
          </div>

          {/* Bottom Tags & Actions */}
          <div className="flex flex-wrap justify-between items-end mt-4 gap-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {(data.entities || ['Coca-Cola', 'Georgia State Proprietary Tech']).map((ent, idx) => (
                <span key={idx} className="border border-zinc-600 bg-zinc-800/80 text-zinc-200 px-2.5 py-1 rounded font-semibold">
                  {ent}
                </span>
              ))}
            </div>
            
            <div className="flex items-center gap-3 text-xs font-bold">
              {onInspect && (
                <button
                  onClick={onInspect}
                  className="text-cyan-300 hover:text-cyan-200 flex items-center gap-1 underline decoration-cyan-800 cursor-pointer"
                >
                  inspect workaround ↗
                </button>
              )}
              <span className="border border-emerald-500/50 bg-emerald-950/70 text-emerald-300 px-2.5 py-1 rounded flex items-center gap-1.5 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                <CheckCircle2 size={12} className="text-emerald-400" /> {data.workaroundStatus || 'Deployed'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default EspionageCard;
