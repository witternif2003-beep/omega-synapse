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
    telemetry?: {
      lsm?: string;
      jitter?: string;
      cipher?: string;
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
  };
  onInspect?: () => void;
  onDeploy?: () => void;
}

export const EspionageCard: React.FC<EspionageCardProps> = ({ anomalyData, onInspect, onDeploy }) => {
  const [copied, setCopied] = useState(false);

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
    <div className="w-full bg-[#0a0f0d] font-mono text-gray-300 p-4 border border-gray-800 rounded-lg shadow-2xl space-y-3">
      
      {/* Top Filter Pills (Matching screenshot) */}
      <div className="flex flex-wrap gap-2 mb-2 text-[10px] tracking-wider uppercase">
        <span className="px-2 py-1 border border-gray-700 bg-gray-900 rounded text-zinc-400 font-bold">
          TELEMETRY DOMAIN:
        </span>
        <span className="px-2 py-1 border border-gray-600 bg-gray-800 rounded text-zinc-200">
          ALL INTEL (69)
        </span>
        <span className="px-2 py-1 border border-blue-900 bg-blue-900/20 text-blue-400 rounded flex items-center gap-1">
          <Zap size={10} /> IT LAYER (56)
        </span>
        <span className="px-2 py-1 border border-yellow-900 bg-yellow-900/20 text-yellow-500 rounded flex items-center gap-1">
          🏛️ FINANCE LAYER (10)
        </span>
        <span className="px-2 py-1 border border-green-900 bg-green-900/20 text-green-400 rounded flex items-center gap-1">
          <Globe size={10} /> DUAL IT+FIN (1)
        </span>
        <span className="px-2 py-1 border border-purple-900 bg-purple-900/20 text-purple-400 rounded flex items-center gap-1">
          <ShieldAlert size={10} /> COUNTER-ESPIONAGE (4)
        </span>
      </div>

      {/* Main Card Container */}
      <div className="border border-green-500/30 bg-[#0d1410] rounded-md overflow-hidden relative shadow-[0_0_20px_rgba(34,197,94,0.07)]">
        
        {/* Top Accent Line */}
        <div className="h-1 w-full bg-gradient-to-r from-green-500 via-green-400 to-transparent"></div>

        <div className="p-4 space-y-3.5">
          
          {/* Header Row */}
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold tracking-widest">{data.status || 'CRITICAL'}</span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-400">{data.jurisdiction || 'DOJ N.D. Ga.'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 border border-purple-500/50 bg-purple-900/30 text-purple-300 rounded text-[10px]">
                {data.tag || 'ESPIONAGE / FRE 902'}
              </span>
              <span className="text-gray-500 text-[10px]">{data.timestamp || '2026-11-07 14:50:26'}</span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-sm font-bold text-white leading-snug">
            {data.title}
          </h2>

          {/* Description */}
          <p className="text-xs text-gray-400 leading-relaxed">
            {data.description}
          </p>

          {/* Telemetry Bar */}
          {data.telemetry && (
            <div className="bg-[#111a15] border border-green-900/50 p-2 rounded flex flex-wrap items-center gap-3 text-[10px] text-green-400">
              <Zap size={14} className="text-green-500 shrink-0" />
              <span>
                LSM Guard: <strong>{data.telemetry.lsm || '4.8 µs'}</strong> · Jitter: <strong>{data.telemetry.jitter || '13.2 ps'}</strong> · {data.telemetry.cipher || '4096-bit RSA / 256-bit ECC'}
              </span>
            </div>
          )}

          {/* Data Tags */}
          {data.tags && (
            <div className="flex flex-col gap-1 text-[10px]">
              {data.tags.it && (
                <span className="text-blue-400 border border-blue-900/50 bg-blue-900/10 px-2 py-1 rounded w-fit flex items-center gap-1">
                  <Cpu size={10} /> IT: {data.tags.it}
                </span>
              )}
              {data.tags.exp && (
                <span className="text-yellow-500 border border-yellow-900/50 bg-yellow-900/10 px-2 py-1 rounded w-fit flex items-center gap-1">
                  EXP: {data.tags.exp}
                </span>
              )}
              {data.tags.docket && (
                <span className="text-purple-400 border border-purple-900/50 bg-purple-900/10 px-2 py-1 rounded w-fit flex items-center gap-1">
                  DOCKET: {data.tags.docket}
                </span>
              )}
            </div>
          )}

          {/* Decrypted Plaintext Evidence Box */}
          {data.evidence && (
            <div className="border border-green-500 bg-[#0a130d] rounded p-3 relative shadow-[0_0_15px_rgba(34,197,94,0.1)]">
              <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-2">
                <div className="flex items-center gap-2 text-[10px] text-green-500 font-bold">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>// DECRYPTED PLAINTEXT EVIDENCE (FRE 902 PARITY)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">AES-256-GCM</span>
                  <button
                    onClick={handleCopy}
                    className="p-1 hover:text-white transition-colors bg-white/5 hover:bg-white/15 rounded text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span className="text-[9px]">{copied ? 'COPIED' : 'COPY'}</span>
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-green-300 leading-relaxed font-mono whitespace-pre-wrap select-text">
                <span className="text-green-500/70">[DECRYPTED PLAINTEXT // FBI EVIDENCE EXHIBIT {data.evidence.exhibit || 'GX-1'}]:</span><br/>
                "{data.evidence.text}"
              </div>

              <div className="flex flex-wrap justify-between items-center mt-4 text-[9px] text-gray-500 border-t border-green-900/30 pt-2 gap-2">
                <span className="truncate max-w-xs">SHA-256: {data.evidence.sha256}</span>
                <span className="text-green-500 font-bold">{data.evidence.admissibility}</span>
              </div>
            </div>
          )}

          {/* Bottom Tags & Actions */}
          <div className="flex flex-wrap justify-between items-end mt-4 gap-2">
            <div className="flex flex-wrap gap-2 text-[10px]">
              {(data.entities || ['Coca-Cola', 'Georgia State Proprietary Tech']).map((ent, idx) => (
                <span key={idx} className="border border-gray-700 text-gray-300 px-2 py-1 rounded">
                  {ent}
                </span>
              ))}
            </div>
            
            <div className="flex items-center gap-4 text-[10px]">
              {onInspect && (
                <button
                  onClick={onInspect}
                  className="text-green-500 hover:text-green-400 flex items-center gap-1 underline decoration-green-900 cursor-pointer"
                >
                  inspect workaround ↗
                </button>
              )}
              <span className="border border-green-500/30 bg-green-900/20 text-green-400 px-2 py-1 rounded flex items-center gap-1">
                <CheckCircle2 size={10} /> {data.workaroundStatus || 'Deployed'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default EspionageCard;
