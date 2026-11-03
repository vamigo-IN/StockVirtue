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
 */
export function SiteScripts({ config }: { config: SiteConfig }) {
  const services = optionalServices(config);
  if (!services.analytics.length && !services.advertising.length) return null;
  return (
    <>
      <ConsentScripts services={services} />
      <ConsentBanner
        analytics={services.analytics}
        advertising={services.advertising}
      />
    </>
  );
}
