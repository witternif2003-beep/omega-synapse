/**
 * ESPIONAGE LIST PAGER
 *
 * The espionage tab renders every target card at once - 170 of them - which made the section
 * about 91,000px tall on a phone and effectively unbrowsable. This pages that grid twenty
 * cards at a time and draws prev/next controls.
 *
 * The grid lives in the main application component, which is too large to rewrite through the
 * repository API, so the paging is applied to the rendered cards instead: only the cards on
 * the current page are displayed, and the rest are taken out of layout. Inline styles are
 * used because React re-renders the cards on every feed tick and will not reset a style it
 * never set.
 *
 * The controls are a fixed bar rather than nodes inside the React tree, so React can never
 * reconcile them away. The bar only appears while the espionage section is on screen, and the
 * card count is re-read after every render so the filters at the top of the section (which
 * add and remove cards) keep the pager honest.
 */

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_MS = 90;

function panel(cssText: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = cssText;
  return el;
}

export function installEspionagePager(pageSize: number = DEFAULT_PAGE_SIZE): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let page = 0;
  let bar: HTMLDivElement | null = null;
  let label: HTMLSpanElement | null = null;
  let prev: HTMLButtonElement | null = null;
  let next: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const section = () => document.getElementById('espionage-layer');

  const findGrid = (): HTMLElement | null => {
    const host = section();
    const glass = host?.querySelector(':scope > .glass');
    if (!glass) return null;
    const grids = Array.from(glass.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('grid'),
    );
    if (grids.length === 0) return null;
    // The card grid is the grid with the most children; the summary strip has four.
    return grids.reduce((best, current) =>
      current.children.length > best.children.length ? current : best,
    );
  };

  const cardsNow = (): HTMLElement[] => {
    const grid = findGrid();
    if (!grid) return [];
    return Array.from(grid.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
  };

  const pageCount = (total: number) => Math.max(1, Math.ceil(total / pageSize));

  const apply = () => {
    const cards = cardsNow();
    const total = cards.length;
    const pages = pageCount(total);

    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;

    const start = page * pageSize;
    const end = Math.min(total, start + pageSize);

    cards.forEach((card, index) => {
      card.style.display = index >= start && index < end ? '' : 'none';
    });

    // A page that exists but holds no cards (a filter left three results, say) still reads
    // sensibly: the bar reports what is actually displayed.
    if (label) {
      label.textContent =
        total === 0
          ? 'NO TARGETS'
          : `${page + 1} / ${pages} · ${start + 1}-${end} of ${total}`;
    }
    if (prev) {
      const off = page <= 0;
      prev.disabled = off;
      prev.style.opacity = off ? '0.4' : '1';
      prev.style.cursor = off ? 'default' : 'pointer';
    }
    if (next) {
      const off = page >= pages - 1;
      next.disabled = off;
      next.style.opacity = off ? '0.4' : '1';
      next.style.cursor = off ? 'default' : 'pointer';
    }
  };

  const syncVisibility = () => {
    if (!bar) return;
    const host = section();
    if (!host) {
      bar.style.display = 'none';
      return;
    }
    const rect = host.getBoundingClientRect();
    const onScreen = rect.bottom > 120 && rect.top < window.innerHeight - 60;
    bar.style.display = onScreen ? 'flex' : 'none';
  };

  const turn = (delta: number) => {
    const total = cardsNow().length;
    const pages = pageCount(total);
    const nextPage = Math.min(pages - 1, Math.max(0, page + delta));
    if (nextPage === page) return;
    page = nextPage;
    apply();
    // Land the reader at the top of the list rather than wherever the old page ended.
    const grid = findGrid();
    const anchor = grid?.closest('.glass')?.parentElement ?? section();
    if (anchor) {
      const top = anchor.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo(0, Math.max(0, top));
    }
  };

  const scheduleApply = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      apply();
      syncVisibility();
    }, DEBOUNCE_MS);
  };

  const buildBar = () => {
    if (bar) return;

    bar = panel(
      'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:60;' +
        'display:none;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;' +
        'background:rgba(14,24,34,0.96);border:1px solid #22313d;' +
        'box-shadow:0 12px 30px -20px #000;' +
        'font:11px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#dbe6ee',
    );
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Espionage target pagination');

    const button = (text: string, aria: string): HTMLButtonElement => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = text;
      el.setAttribute('aria-label', aria);
      el.style.cssText =
        'padding:4px 10px;border-radius:5px;border:1px solid #2d4150;' +
        'background:rgba(18,30,41,0.92);color:#dbe6ee;font:inherit;letter-spacing:.04em;cursor:pointer';
      return el;
    };

    prev = button('\u2039 PREV', 'Previous page of targets');
    next = button('NEXT \u203a', 'Next page of targets');
    label = document.createElement('span');
    label.style.cssText = 'letter-spacing:.06em;padding:0 4px;white-space:nowrap;color:#a9b8c4';

    prev.addEventListener('click', () => turn(-1));
    next.addEventListener('click', () => turn(1));

    bar.append(prev, label, next);
    document.body.appendChild(bar);
  };

  buildBar();
  apply();
  syncVisibility();

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('scroll', syncVisibility, { passive: true });
  window.addEventListener('resize', syncVisibility, { passive: true });

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('scroll', syncVisibility);
    window.removeEventListener('resize', syncVisibility);
    if (bar) bar.remove();
    bar = null;
    label = null;
    prev = null;
    next = null;
  };
}
