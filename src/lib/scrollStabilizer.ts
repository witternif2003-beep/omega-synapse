/**
 * SCROLL STABILIZER
 *
 * The live OSINT feed inserts new cards at the top of the page as events arrive. Every
 * insertion changes the height of the content above whatever you are reading, so the page
 * you are looking at slides up or down under your cursor. The browser's own scroll
 * anchoring does not catch it here.
 *
 * This keeps the thing you are looking at exactly where it is: it remembers the viewport
 * position of the <section> under the top third of the screen and, when a layout change
 * above has moved that section, scrolls by the same amount to put it back. User scrolling
 * wins: as soon as the scroll position changes on its own, the stabilizer re-anchors to
 * whatever you moved to instead of fighting you.
 *
 * It only measures when something in the document actually changed. Reading layout every
 * frame is expensive on a 160,000px page and was costing frames on phones, where the
 * browser then leaves whole regions unpainted. A MutationObserver marks the page dirty and
 * the next frame does the measuring.
 *
 * Deliberately dependency-free and passive - it never blocks input, never touches the
 * React tree, and can be switched off with the returned function.
 */

const ANCHOR_PROBE_RATIO = 0.3;
const MIN_ANCHOR_HEIGHT = 120;
const TOLERANCE_PX = 1;

function pickAnchorElement(): Element | null {
  const x = Math.floor(window.innerWidth / 2);
  const y = Math.round(
    Math.min(
      Math.max(120, window.innerHeight * ANCHOR_PROBE_RATIO),
      window.innerHeight - 1,
    ),
  );
  let el = document.elementFromPoint(x, y);
  while (el && el !== document.body) {
    const rect = el.getBoundingClientRect();
    if (el.tagName === 'SECTION' && rect.height > MIN_ANCHOR_HEIGHT) return el;
    el = el.parentElement;
  }
  return null;
}

export function installScrollStabilizer(): () => void {
  let anchorEl: Element | null = null;
  let anchorTop = 0;
  let lastScrollY = window.scrollY;
  let frameId = 0;
  let dirty = true;

  const markDirty = () => {
    dirty = true;
  };

  const anchorToCurrentPosition = () => {
    anchorEl = pickAnchorElement();
    anchorTop = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
  };

  const frame = () => {
    const y = window.scrollY;

    // The user (or the browser) scrolled: follow them, do not correct.
    if (Math.abs(y - lastScrollY) > TOLERANCE_PX) {
      lastScrollY = y;
      if (y <= 0) {
        anchorEl = null;
      } else {
        anchorToCurrentPosition();
      }
      dirty = false;
      frameId = requestAnimationFrame(frame);
      return;
    }

    if (y <= 0) {
      // At the very top the feed can insert freely; nothing above us to preserve.
      anchorEl = null;
      dirty = false;
      frameId = requestAnimationFrame(frame);
      return;
    }

    if (!dirty) {
      // Nothing in the document changed, so nothing above us moved either.
      frameId = requestAnimationFrame(frame);
      return;
    }

    if (!anchorEl || !anchorEl.isConnected) {
      anchorToCurrentPosition();
      dirty = false;
      frameId = requestAnimationFrame(frame);
      return;
    }

    const top = anchorEl.getBoundingClientRect().top;
    const delta = top - anchorTop;

    if (Math.abs(delta) >= TOLERANCE_PX) {
      const target = Math.max(0, y + delta);
      window.scrollTo(0, target);
      lastScrollY = window.scrollY;
      anchorTop = anchorEl.getBoundingClientRect().top;
    }

    dirty = false;
    frameId = requestAnimationFrame(frame);
  };

  frameId = requestAnimationFrame(frame);

  const observer = new MutationObserver(markDirty);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('resize', markDirty, { passive: true });

  return () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    anchorEl = null;
    observer.disconnect();
    window.removeEventListener('resize', markDirty);
  };
}
