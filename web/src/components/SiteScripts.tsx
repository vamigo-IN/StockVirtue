import { ConsentBanner } from '@/components/consent/ConsentBanner';
import { ConsentScripts } from '@/components/consent/ConsentScripts';
import type { SiteConfig } from '@/lib/settings';
import { optionalServices } from '@/lib/consent-services';

/**
 * Analytics and AdSense on the public pages (never the staff portal), from
 * the ids saved under Site settings. Only ids are stored, so no arbitrary
 * script can come through here; anything else goes through code injection.
 * Nothing optional loads until the visitor agrees to its purpose (DPDP Act);
 * with no optional service set up there is nothing to ask, and no banner.
 *
 * This renders on every public page (the (public) layout), but AdSense
 * itself loads only on the news pages, /news and below (isAdPath;
 * ConsentScripts reads the path client side, so the pages stay static).
 * The banner and the consent rules are the same everywhere.
 *
 * `cookieVersion` is the cookie choice version from the settings payload
 * (`settings.cookieConsent.version`, W7 addendum §5.13; 1 from an API that
 * sends none). A stored choice counts only when its version is at least
 * this, so a new version asks everyone again.
 */
export function SiteScripts({
  config,
  cookieVersion = 1,
}: {
  config: SiteConfig;
  cookieVersion?: number;
}) {
  const services = optionalServices(config);
  if (!services.analytics.length && !services.advertising.length) return null;
  return (
    <>
      <ConsentScripts services={services} version={cookieVersion} />
      <ConsentBanner
        analytics={services.analytics}
        advertising={services.advertising}
        version={cookieVersion}
      />
    </>
  );
}
