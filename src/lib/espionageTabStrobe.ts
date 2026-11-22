/**
 * ESPIONAGE TAB - "JUST UPDATED" STROBE
 *
 * The espionage view is a tab in the top command navigation. When this build loads, that
 * tab strobes for 20 seconds to say the layer has just been refreshed, then settles into a
 * steady amber outline so it stays marked without pulsing in your face forever.
 *
 * The nav lives in the main application component, which is too large to rewrite through
 * the repository API, so the class is attached here instead: find the tab by its label,
 * mark it, and put the mark back if React re-renders the button and drops the class.
 */

const TAB_LABEL = /ESPIONAGE & CJIS/i;
const STROBE_MS = 20_000;
const LIVE_CLASS = 'espionage-tab-live';
const MARKED_CLASS = 'espionage-tab-marked';

function findEspionageTab(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('#page button'));
  return buttons.find((button) => TAB_LABEL.test(button.textContent || '')) ?? null;
}

export function installEspionageTabStrobe(): () => void {
  let settled = false;
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const paint = () => {
    const tab = findEspionageTab();
    if (!tab) return;
    const wanted = settled ? MARKED_CLASS : LIVE_CLASS;
    const other = settled ? LIVE_CLASS : MARKED_CLASS;
    if (tab.classList.contains(other)) tab.classList.remove(other);
    if (!tab.classList.contains(wanted)) tab.classList.add(wanted);
    tab.setAttribute(
      'title',
      settled
        ? 'Espionage layer updated in this build'
        : 'Espionage layer just updated',
    );
  };

  paint();

  // React rewrites className on re-render, which would clear the mark.
  observer = new MutationObserver(paint);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  timer = setTimeout(() => {
    settled = true;
    paint();
  }, STROBE_MS);

  return () => {
    if (timer) clearTimeout(timer);
    if (observer) observer.disconnect();
  };
}
