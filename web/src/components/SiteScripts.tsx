import Script from 'next/script';
import type { SiteConfig } from '@/lib/settings';

/// The same formats the API accepts, checked again before an id reaches a script.
const GA4 = /^G-[A-Z0-9]{4,15}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;
const PIXEL = /^\d{6,20}$/;
const CLARITY = /^[a-z0-9]{6,20}$/;
const ADSENSE = /^ca-pub-\d{10,20}$/;

/**
 * Analytics and AdSense on the public pages (never the staff portal), from
 * the ids saved under Site settings. Only ids are stored, so no arbitrary
 * script can come through here; anything else goes through code injection.
 */
export function SiteScripts({ config }: { config: SiteConfig }) {
  const { ga4Id, gtmId, metaPixelId, clarityId } = config.analytics;
  const { adsenseClient, autoAds } = config.ads;
  return (
    <>
      {GTM.test(gtmId) && (
        <>
          <Script id="sv-gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}
      {GA4.test(ga4Id) && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="sv-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`}
          </Script>
        </>
      )}
      {PIXEL.test(metaPixelId) && (
        <Script id="sv-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}
      {CLARITY.test(clarityId) && (
        <Script id="sv-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`}
        </Script>
      )}
      {autoAds && ADSENSE.test(adsenseClient) && (
        // A plain tag, so it is in the page's HTML as AdSense expects.
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          crossOrigin="anonymous"
        />
      )}
    </>
  );
}
