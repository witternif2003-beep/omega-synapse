import type {CSSProperties} from 'react';

/**
 * BUILD STAMP
 *
 * A small tag in the corner of the page naming the build it came from: the commit it was
 * deployed from and when. When a phone shows an older page, this is the fastest way to tell
 * a stale copy from a fresh one without opening dev tools.
 *
 * The value is injected at build time (see vite.config.ts) from the commit Vercel is
 * building, so it always describes the code that is actually running.
 */

const style: CSSProperties = {
  position: 'fixed',
  left: 8,
  bottom: 8,
  zIndex: 40,
  font: '10px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  letterSpacing: '0.06em',
  color: '#93a6b4',
  background: 'rgba(10, 18, 25, 0.86)',
  border: '1px solid #22313d',
  borderRadius: 4,
  padding: '2px 6px',
  pointerEvents: 'none',
  userSelect: 'none',
};

export default function BuildStamp() {
  return (
    <div style={style} title="Build deployed to this page">
      BUILD {__BUILD_ID__}
    </div>
  );
}
