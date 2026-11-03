'use client';

import { useEffect } from 'react';
import {
  clearOptionalCookies,
  type Consent,
  CONSENT_EVENT,
  readConsent,
} from '@/lib/consent';
import type { OptionalServices } from '@/lib/consent-services';

type Fn = (...args: unknown[]) => void;
type Win = Window & {
  dataLayer?: unknown[];
  gtag?: Fn;
  adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
};

/** Scripts already added to this page: each loads once. */
const added = new Set<string>();
/** What the page was set up with, to tell what a new choice changed. */
let current: { analytics: boolean; advertising: boolean } | null = null;

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

function load(services: OptionalServices, c: Consent | null) {
  const choice = {
    analytics: !!c?.analytics,
    advertising: !!c?.advertising,
  };
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
  if (
    ids.adsenseClient &&
    (choice.advertising || services.adsWithoutConsent === 'non_personalised')
  ) {
    const w = window as Win;
    w.adsbygoogle = w.adsbygoogle || [];
    // Without consent to advertising cookies, only non-personalised ads.
    w.adsbygoogle.requestNonPersonalizedAds = choice.advertising ? 0 : 1;
    addScript('adsense', {
      src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ids.adsenseClient}`,
    });
  }
  current = choice;
}

/**
 * Analytics and ads on the public pages (never the staff portal), loaded
 * only for the purposes the visitor agreed to. Saying no later removes their
 * cookies and reloads the page, since a running script can't be taken back.
 */
export function ConsentScripts({ services }: { services: OptionalServices }) {
  useEffect(() => {
    load(services, readConsent());
    const changed = (e: Event) => {
      const next = (e as CustomEvent<Consent>).detail;
      const before = current ?? { analytics: false, advertising: false };
      const withdrawn = (['analytics', 'advertising'] as const).filter(
        (p) => before[p] && !next[p],
      );
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
  }, [services]);
  return null;
}
