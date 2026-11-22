import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {mkdirSync, writeFileSync} from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * STALE COUNTER FIX
 *
 * The header and the STORED tile read `events.length + 368`, and the severity tiles floor
 * their live counts at 4 / 42 / 30, so they can never report the real number of events on
 * the board. Those numbers are in src/App.tsx, which is too large to replace through the
 * repository file API in one request, so the correction is applied to its source as it is
 * compiled instead. Every pattern must be present or the build fails: a silent no-op would
 * leave the wrong numbers live again.
 */
const STALE_COUNTER_PATCHES: Array<[find: string, replace: string]> = [
  [
    "Math.max(4, events.filter((e) => e.severity === 'high').length)",
    "events.filter((e) => e.severity === 'high').length",
  ],
  [
    "Math.max(42, events.filter((e) => e.severity === 'medium').length)",
    "events.filter((e) => e.severity === 'medium').length",
  ],
  [
    "Math.max(30, events.filter((e) => e.severity === 'info').length)",
    "events.filter((e) => e.severity === 'info').length",
  ],
  ['{events.length + 368} events', '{events.length} events'],
  ['{health?.events ?? events.length + 368}', '{health?.events ?? events.length}'],
];

/**
 * CLOCK FIX
 *
 * The header clock starts as the literal '00:00:00Z' and is only ever advanced by a
 * one-second setInterval. iOS suspends that timer when a tab is backgrounded or restored
 * from a previous session, while the event stream reconnects and keeps the counters moving -
 * so the page shows a live event count next to a clock stuck at 00:00:00Z.
 *
 * The clock is now seeded from the real time on first render and re-synced on visibility,
 * focus and pageshow as well as every second, so it cannot get stuck behind a suspended
 * timer. Same mechanism as the counter fix: source patch at build time, and the build fails
 * loudly if the code it patches ever changes.
 */
const CLOCK_PATCHES: Array<[find: string, replace: string]> = [
  [
    "const [clock, setClock] = useState('00:00:00Z');",
    "const [clock, setClock] = useState(() => new Date().toISOString().slice(11, 19) + 'Z');",
  ],
  [
    [
      '    const timer = setInterval(() => {',
      '      const now = new Date();',
      "      setClock(now.toISOString().slice(11, 19) + 'Z');",
      '    }, 1000);',
    ].join('\n'),
    [
      '    const syncClock = () => setClock(new Date().toISOString().slice(11, 19) + \'Z\');',
      '    syncClock();',
      '    const timer = setInterval(syncClock, 1000);',
      "    document.addEventListener('visibilitychange', syncClock);",
      "    window.addEventListener('focus', syncClock);",
      "    window.addEventListener('pageshow', syncClock);",
    ].join('\n'),
  ],
  [
    [
      '    return () => {',
      '      clearInterval(timer);',
      '      clearInterval(telTimer);',
      '    };',
    ].join('\n'),
    [
      '    return () => {',
      '      clearInterval(timer);',
      '      clearInterval(telTimer);',
      "      document.removeEventListener('visibilitychange', syncClock);",
      "      window.removeEventListener('focus', syncClock);",
      "      window.removeEventListener('pageshow', syncClock);",
      '    };',
    ].join('\n'),
  ],
];

/**
 * CLAIM COPY FIX
 *
 * Each tracked organisation prints "{n} claims · {m} sourced". When m is smaller than n the
 * card reads like a discrepancy with no explanation, and one claim prints as "1 claims".
 * It now says how many are still awaiting a source, and pluralises correctly, so a partially
 * sourced dossier states its own status instead of looking like an error.
 */
const CLAIM_COPY_PATCHES: Array<[find: string, replace: string]> = [
  [
    '{p.claims.length} claims · {verifiedClaims} sourced',
    "{p.claims.length === 1 ? '1 claim' : p.claims.length + ' claims'} · {verifiedClaims} sourced" +
      "{verifiedClaims < p.claims.length ? ' · ' + (p.claims.length - verifiedClaims) + ' awaiting source' : ' · all sourced'}",
  ],
];

function patchAppSource(name: string, patches: Array<[find: string, replace: string]>): Plugin {
  return {
    name,
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/App.tsx')) return null;

      let next = code;
      const missing: string[] = [];

      for (const [find, replace] of patches) {
        if (!next.includes(find)) {
          missing.push(find.split('\n')[0]);
          continue;
        }
        next = next.split(find).join(replace);
      }

      if (missing.length > 0) {
        this.error(`[${name}] App.tsx source changed, patch no longer applies: ${missing.join(' | ')}`);
      }

      return next === code ? null : {code: next, map: null};
    },
  };
}

/**
 * BUILD ID
 *
 * The commit this build came from plus the moment it was built, shown in a corner tag on
 * the running page (src/components/BuildStamp.tsx) and written to /version.json so a page
 * that is still running an older build can notice (src/lib/buildFreshness.ts).
 */
function computeBuildId(): string {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `${sha} · ${stamp}Z`;
}

const BUILD_ID = computeBuildId();

/**
 * VERSION FILE
 *
 * dist/version.json carries the build id of the deployment that is actually live. The page
 * polls it (cache-busted) and offers a reload when the two disagree, which is what makes a
 * half-open phone tab with an old bundle recoverable without clearing site data.
 */
function emitVersionFile(): Plugin {
  return {
    name: 'omega-emit-version-file',
    apply: 'build',
    closeBundle() {
      const file = path.resolve(process.cwd(), 'dist/version.json');
      mkdirSync(path.dirname(file), {recursive: true});
      writeFileSync(
        file,
        JSON.stringify({build: BUILD_ID, emittedAt: new Date().toISOString()}, null, 2) + '\n',
      );
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      patchAppSource('omega-fix-stale-counters', STALE_COUNTER_PATCHES),
      patchAppSource('omega-fix-clock', CLOCK_PATCHES),
      patchAppSource('omega-fix-claim-copy', CLAIM_COPY_PATCHES),
      emitVersionFile(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
