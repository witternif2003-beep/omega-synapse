/**
 * BUILD FRESHNESS
 *
 * A phone keeps a page alive far longer than a desktop tab does: iOS restores Safari tabs
 * from a suspended snapshot or a back/forward cache, and an in-app browser can hold a bundle
 * for days. The page then keeps running the JavaScript it loaded, so a deployment that went
 * live an hour ago is invisible on that screen - the old build tag, the old layout, no matter
 * how many times the site is reopened.
 *
 * Every build writes its id to /version.json (see vite.config.ts). This module compares that
 * value against the id compiled into the running bundle, and when they differ it says so and
 * offers a reload. It also re-checks whenever the page comes back to the foreground, so a
 * resumed tab notices within a moment rather than never.
 */

const CHECK_INTERVAL_MS = 45000;
const FIRST_CHECK_DELAY_MS = 4000;

/** A URL the CDN edge has not served before, so the request cannot be answered from cache. */
function freshUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('build', String(Date.now()));
  return url.toString();
}

export function installBuildFreshness(currentBuild: string): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let announced = false;
  let pill: HTMLButtonElement | null = null;
  let inFlight = false;

  const announce = (liveBuild: string) => {
    if (announced || pill) return;
    announced = true;

    pill = document.createElement('button');
    pill.type = 'button';
    pill.textContent = 'NEW BUILD READY · TAP TO RELOAD';
    pill.title = `This page is running ${currentBuild}. The live deployment is ${liveBuild}.`;
    pill.style.cssText =
      'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);' +
      'transform:translateX(-50%);z-index:70;display:block;cursor:pointer;' +
      'padding:7px 12px;border-radius:999px;white-space:nowrap;' +
      'background:rgba(12,26,34,0.97);border:1px solid #4f8aa2;color:#cfe6f0;' +
      'font:11px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;' +
      'letter-spacing:.06em;box-shadow:0 10px 26px -16px #000';

    // Reload through a URL the edge has never seen. A plain location.reload() asks for the
    // same document, and when a CDN edge still holds the previous HTML it answers with the
    // same bundle - the page comes back looking identical, which is how a "reload" appears to
    // do nothing. A fresh query parameter is a different cache key, so the HTML is fetched
    // from the deployment that is actually live.
    pill.addEventListener('click', () => {
      try {
        window.location.replace(freshUrl());
      } catch {
        window.location.href = window.location.href;
      }
    });
    document.body.appendChild(pill);
  };

  const check = async () => {
    if (inFlight || announced) return;
    inFlight = true;
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { build?: unknown };
      if (typeof data.build === 'string' && data.build.length > 0 && data.build !== currentBuild) {
        announce(data.build);
      }
    } catch {
      // Offline or the file is missing on an older deployment: nothing to do.
    } finally {
      inFlight = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };

  // iOS restores tabs from a back/forward cache without contacting the server at all, which
  // is the other way a phone keeps serving you a page from an hour ago. A restored page is
  // reloaded once through a cache-busting URL so it matches what is deployed.
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    try {
      window.location.replace(freshUrl());
    } catch {
      window.location.reload();
    }
  };

  const firstTimer = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
  const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onVisible);

  return () => {
    window.clearTimeout(firstTimer);
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('focus', onVisible);
    if (pill) pill.remove();
    pill = null;
  };
}
