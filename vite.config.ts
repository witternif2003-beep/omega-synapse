import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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

function fixStaleCounters(): Plugin {
  return {
    name: 'omega-fix-stale-counters',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/App.tsx')) return null;

      let next = code;
      const missing: string[] = [];

      for (const [find, replace] of STALE_COUNTER_PATCHES) {
        if (!next.includes(find)) {
          missing.push(find);
          continue;
        }
        next = next.split(find).join(replace);
      }

      if (missing.length > 0) {
        this.error(
          `[omega-fix-stale-counters] event counter source changed, patch no longer applies: ${missing.join(' | ')}`,
        );
      }

      return next === code ? null : {code: next, map: null};
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [fixStaleCounters(), react(), tailwindcss()],
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
