import type { SiteConfig } from './settings';

/// The same formats the API accepts, checked again before an id reaches a script.
export const GA4 = /^G-[A-Z0-9]{4,15}$/;
export const GTM = /^GTM-[A-Z0-9]{4,12}$/;
export const PIXEL = /^\d{6,20}$/;
export const CLARITY = /^[a-z0-9]{6,20}$/;
export const ADSENSE = /^ca-pub-\d{10,20}$/;

/** The optional services switched on under Site settings, by purpose. */
export interface OptionalServices {
  analytics: string[];
  advertising: string[];
  ids: {
    ga4Id: string | null;
    gtmId: string | null;
    clarityId: string | null;
    metaPixelId: string | null;
    /** AdSense (Auto ads), when it is switched on. */
    adsenseClient: string | null;
  };
  /** Without advertising consent: non-personalised ads, or none. */
  adsWithoutConsent: 'non_personalised' | 'off';
}

export function optionalServices(config: SiteConfig): OptionalServices {
  const { ga4Id, gtmId, metaPixelId, clarityId } = config.analytics;
  const { adsenseClient, autoAds, withoutConsent } = config.ads;
  const ids = {
    ga4Id: GA4.test(ga4Id) ? ga4Id : null,
    gtmId: GTM.test(gtmId) ? gtmId : null,
    clarityId: CLARITY.test(clarityId) ? clarityId : null,
    metaPixelId: PIXEL.test(metaPixelId) ? metaPixelId : null,
    adsenseClient:
      autoAds && ADSENSE.test(adsenseClient) ? adsenseClient : null,
  };
  return {
    analytics: [
      ids.ga4Id && 'Google Analytics',
      ids.gtmId && 'Google Tag Manager',
      ids.clarityId && 'Microsoft Clarity',
    ].filter((s): s is string => !!s),
    advertising: [
      ids.adsenseClient && 'Google AdSense',
      ids.metaPixelId && 'Meta Pixel',
    ].filter((s): s is string => !!s),
    ids,
    adsWithoutConsent: withoutConsent,
  };
}

/** Whether visitors have anything to choose (and so see the banner). */
export const hasOptionalServices = (config: SiteConfig) => {
  const s = optionalServices(config);
  return s.analytics.length > 0 || s.advertising.length > 0;
};
