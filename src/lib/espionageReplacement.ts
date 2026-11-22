/**
 * ESPIONAGE TAB REPLACEMENT
 *
 * The main application component still renders the old espionage panel from a generated
 * dataset. That file is 181 KB, larger than a single repository write here can carry, so
 * the tab is rebuilt from the outside instead: this installer inserts the sourced panel
 * as the first child of #espionage-layer and hides the generated panel behind it.
 *
 * The tab is conditionally rendered by the app and re-created when you switch sections,
 * so a mutation observer re-attaches the sourced panel whenever the old section appears.
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import EspionageOperations from '../components/EspionageOperations.tsx';

const HOST_ID = 'espionage-operations-host';

export function installEspionageOperations(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  let scheduled = false;
  let stopped = false;

  const mount = () => {
    if (stopped) return;
    const section = document.getElementById('espionage-layer');
    if (!section) return;
    if (host && section.contains(host)) {
      section.classList.add('omega-sourced');
      return;
    }
    // The tab was re-rendered; drop the previous root and build a fresh one.
    if (root) {
      const previous = root;
      root = null;
      window.setTimeout(() => {
        try {
          previous.unmount();
        } catch {
          /* the node is already detached */
        }
      }, 0);
    }
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'omega-sourced-host';
    section.insertBefore(host, section.firstChild);
    section.classList.add('omega-sourced');
    root = createRoot(host);
    root.render(createElement(EspionageOperations));
  };

  const schedule = () => {
    if (scheduled || stopped) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      mount();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  return () => {
    stopped = true;
    observer.disconnect();
  };
}
