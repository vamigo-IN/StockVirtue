'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  clearOptionalCookies,
  type Consent,
  CONSENT_EVENT,
  isCurrentConsent,
  readConsent,
} from '@/lib/consent';
import { isAdPath, type OptionalServices } from '@/lib/consent-services';

type Fn = (...args: unknown[]) => void;
type Win = Window & {
  dataLayer?: unknown[];
  gtag?: Fn;
  adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
};

/** Scripts already added to this page: each loads once. */
const added = new Set<string>();
type Purposes = { analytics: boolean; advertising: boolean };
/**
 * What this page has loaded (every purpose any load allowed), to tell what
 * a new choice changed. It only grows: a choice that takes a purpose away
 * reloads the page.
 */
let current: Purposes | null = null;
/**
 * What an outdated stored choice allowed (W7 addendum §5.13): nothing of it
 * loaded on this page, but earlier pages may have set its cookies, so a
 * new answer that refuses one of its purposes clears that purpose's
 * cookies too. Null once the visitor answers.
 */
let stale: Purposes | null = null;
/**
 * The choice this page last acted on (the stored one when it opened, then
 * each new answer). The ads follow it when the visitor moves onto a news
 * page, exactly as if that page had opened with it.
 */
let applied: Purposes | null = null;
/** Mounted ConsentScripts: 0 after a soft navigation left the public pages. */
let mounted = 0;

function addScript(key: string, attrs: { src?: string; text?: string }) {
  if (added.has(key)) return;
  added.add(key);
  const s = document.createElement('script');
  if (attrs.src) {
    s.src = attrs.src;
    s.async = true;
  }
  if (attrs.text) s.text = attrs.text;
  if (attrs.src?.includes('googlesyndication')) s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

/** Google's consent mode, so Google tags honour the choice too. */
function consentMode(c: { analytics: boolean; advertising: boolean }) {
  const w = window as Win;
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    w.gtag = function gtag() {
      // gtag.js reads arguments objects, not arrays.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  const grant = (on: boolean) => (on ? 'granted' : 'denied');
  w.gtag('consent', added.has('consent-default') ? 'update' : 'default', {
    analytics_storage: grant(c.analytics),
    ad_storage: grant(c.advertising),
    ad_user_data: grant(c.advertising),
    ad_personalization: grant(c.advertising),
  });
  added.add('consent-default');
}

/**
 * Pages under /news that still take no ads: the news 404
 * (news/not-found.tsx marks itself data-news-404), and anything marked
 * data-no-ads. AdSense allows no ads on error pages.
 */
const NO_ADS = '[data-news-404], [data-no-ads]';

/** Whether the page open now may run AdSense: a news page that isn't a 404. */
function adsAllowedHere(): boolean {
  return isAdPath(location.pathname) && !document.querySelector(NO_ADS);
}

/**
 * AdSense (Auto ads), on the news pages only (isAdPath). The consent rules
 * are unchanged: with advertising consent, personalised ads; without it,
 * non-personalised ads or none, as the settings say. A loaded ad script
 * can't be taken back, so from then on every way out of the news section is
 * a full page load (guardNewsExit), and the next page opens without it.
 */
function loadAds(services: OptionalServices, advertising: boolean) {
  const { adsenseClient } = services.ids;
  if (!adsenseClient || added.has('adsense') || !adsAllowedHere()) return;
  if (!advertising && services.adsWithoutConsent !== 'non_personalised') return;
  const w = window as Win;
  w.adsbygoogle = w.adsbygoogle || [];
  // Without consent to advertising cookies, only non-personalised ads.
  w.adsbygoogle.requestNonPersonalizedAds = advertising ? 0 : 1;
  addScript('adsense', {
    src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`,
  });
  guardNewsExit();
}

/**
 * A click on a link out of the news section, once AdSense runs here: Auto
 * ads (anchor ads included) would carry on over a page Next swaps in, so
 * the next page loads in full instead. Capture phase on window, so it runs
 * before React: preventDefault makes Next's Link skip its soft navigation
 * (it returns on e.defaultPrevented; next/dist/client/app-dir/link.js), and
 * the full load starts once the click's handlers have run (the drawer still
 * closes), unless one of them cancelled the click for its own reasons.
 * Clicks the browser handles itself are left alone: modifier keys and other
 * buttons (new tab or window), a target other than _self, downloads, other
 * sites and schemes, links that stay in the news section, and hash-only
 * links on this page.
 */
function leaveByLink(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest('a, area') : null;
  const href = a?.getAttribute('href') ?? a?.getAttribute('xlink:href');
  if (!a || href == null) return;
  const target = a.getAttribute('target');
  if ((target && target !== '_self') || a.hasAttribute('download')) return;
  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin || isAdPath(url.pathname)) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  let cancelled = false;
  const prevent = e.preventDefault.bind(e);
  e.preventDefault = () => {
    cancelled = true;
    prevent();
  };
  prevent();
  setTimeout(() => {
    if (!cancelled) location.assign(url.href);
  }, 0);
}

/**
 * Back or forward onto an entry outside the news section, once AdSense runs
 * here: reload that entry in full before Next renders it. Capture phase on
 * window runs before the app router's own popstate listener.
 */
function leaveByHistory(e: PopStateEvent) {
  if (isAdPath(location.pathname)) return;
  e.stopImmediatePropagation();
  location.reload();
}

let guarded = false;
/** Installs the two exits above, once, for the rest of this page's life. */
function guardNewsExit() {
  if (guarded) return;
  guarded = true;
  window.addEventListener('click', leaveByLink, true);
  window.addEventListener('popstate', leaveByHistory, true);
}

function load(services: OptionalServices, c: Consent | null) {
  const choice = {
    analytics: !!c?.analytics,
    advertising: !!c?.advertising,
  };
  applied = choice;
  const { ids } = services;
  consentMode(choice);
  if (choice.analytics) {
    if (ids.gtmId) {
      (window as Win).dataLayer!.push({
        'gtm.start': Date.now(),
        event: 'gtm.js',
      });
      addScript('gtm', {
        src: `https://www.googletagmanager.com/gtm.js?id=${ids.gtmId}`,
      });
    }
    if (ids.ga4Id) {
      addScript('ga4', {
        src: `https://www.googletagmanager.com/gtag/js?id=${ids.ga4Id}`,
      });
      if (!added.has('ga4-config')) {
        added.add('ga4-config');
        (window as Win).gtag!('js', new Date());
        (window as Win).gtag!('config', ids.ga4Id);
      }
    }
    if (ids.clarityId) {
      addScript('clarity', {
        text: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${ids.clarityId}");`,
      });
    }
  }
  if (choice.advertising && ids.metaPixelId) {
    addScript('meta-pixel', {
      text: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.metaPixelId}');fbq('track','PageView');`,
    });
  }
  loadAds(services, choice.advertising);
  current = {
    analytics: !!current?.analytics || choice.analytics,
    advertising: !!current?.advertising || choice.advertising,
  };
}

/**
 * Analytics and ads on the public pages (never the staff portal), loaded
 * only for the purposes the visitor agreed to. Saying no later removes their
 * cookies and reloads the page, since a running script can't be taken back.
 * Analytics, Google's consent mode and the Meta Pixel run on every public
 * page; AdSense only on the news pages (loadAds), and leaving those pages
 * after it ran is always a full page load.
 *
 * `version` is the site's cookie choice version (W7 addendum §5.13): a
 * stored choice older than it loads nothing optional (as no choice), and
 * when the visitor answers, a purpose that old choice allowed and the new
 * answer refuses gets its cookies cleared as well.
 */
export function ConsentScripts({
  services,
  version = 1,
}: {
  services: OptionalServices;
  /** The cookie choice version (settings.cookieConsent.version). */
  version?: number;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const saved = readConsent();
    const ok = isCurrentConsent(saved, version);
    stale = saved && !ok ? { analytics: saved.analytics, advertising: saved.advertising } : null;
    load(services, ok ? saved : null);
    const changed = (e: Event) => {
      const next = (e as CustomEvent<Consent>).detail;
      const before = current ?? { analytics: false, advertising: false };
      const was = stale;
      stale = null;
      const purposes = ['analytics', 'advertising'] as const;
      // Loaded here and now refused: clear their cookies and reload.
      const withdrawn = purposes.filter((p) => before[p] && !next[p]);
      // Allowed only by the outdated choice (nothing loaded on this page),
      // now refused: their cookies from earlier pages go too.
      const lapsed = purposes.filter((p) => !before[p] && !!was?.[p] && !next[p]);
      for (const p of lapsed) clearOptionalCookies(p);
      // Ads already on the page were asked for one way: ask again.
      const adsSwitched =
        added.has('adsense') && before.advertising !== next.advertising;
      if (withdrawn.length || adsSwitched) {
        for (const p of withdrawn) clearOptionalCookies(p);
        location.reload();
        return;
      }
      load(services, next);
    };
    window.addEventListener(CONSENT_EVENT, changed);
    return () => window.removeEventListener(CONSENT_EVENT, changed);
  }, [services, version]);

  // Every route change, by any means: arriving on a news page may load the
  // ads (under the choice this page acts on); landing anywhere else, or on
  // the news 404, with AdSense running is the fallback for a way out the
  // two exits didn't catch (router.push and the like): reload, and the page
  // opens without it.
  useEffect(() => {
    if (pathname == null) return;
    if (added.has('adsense')) {
      if (!adsAllowedHere()) location.reload();
    } else if (applied) {
      loadAds(services, applied.advertising);
    }
  }, [pathname, services]);

  // This component lives in the (public) layout: unmounted while the page
  // stays open, a soft navigation left the public pages altogether (the
  // site-wide 404, the portal). With AdSense running, load that page in
  // full. StrictMode's trial unmount remounts at once, hence the tick.
  useEffect(() => {
    mounted++;
    return () => {
      mounted--;
      setTimeout(() => {
        if (mounted === 0 && added.has('adsense')) location.reload();
      }, 0);
    };
  }, []);
  return null;
}
