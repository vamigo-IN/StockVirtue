/**
 * Static brand config for the public site. Anything an admin should be able
 * to change at runtime lives in SiteSettings (see settings.ts); this file
 * holds compile-time constants. Page copy lives in src/content/site/ and
 * the navigation in ./nav.ts.
 */

export const SITE = {
  name: 'StockVirtue',
  /**
   * Lower case on purpose: the default title is `${title}: ${tagline}`, so it
   * reads exactly like the home page's title, "StockVirtue: stock market
   * simulator for India" (spec §9.5.1, §10). No slogan reaches any title.
   */
  tagline: 'stock market simulator for India',
  /**
   * The home page's meta description (spec §9.5.1), and the fallback when
   * the admin's site description is empty. Facts F1, F4, F8, F35, F22
   * (spec §9.3), all confirmed.
   */
  description:
    'Practise trading Indian shares, F&O and commodities with ₹10 lakh of virtual money, at real NSE, BSE and MCX prices. Free on Android.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://stockvirtue.com',
  playUrl:
    process.env.NEXT_PUBLIC_PLAY_URL ||
    'https://play.google.com/store/apps/details?id=com.vamigo.stockvirtue',
  packageId: 'com.vamigo.stockvirtue',
  email: 'support@stockvirtue.com',
  company: 'Vamigo Media (OPC) Pvt. Ltd.',
  twitter: '@stockvirtue',
} as const;
