import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequestForm } from '@/app/(public)/(site)/privacy/requests/RequestForm';
import { NoticeCookieSettings } from '@/components/consent/NoticeCookieSettings';
import { loadHomeData } from '@/components/home/home-data';
import { HomeView } from '@/components/home/pages/HomeView';
import { pricesOnSite } from '@/components/market/gate';
import { MarketStatus } from '@/components/market/MarketStatus';
import { PageHead } from '@/components/public/Heads';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { WontDo } from '@/components/public/WontDo';
import { AboutView } from '@/components/site/pages/AboutView';
import { ContactView } from '@/components/site/pages/ContactView';
import { DownloadView } from '@/components/site/pages/DownloadView';
import { FaqView } from '@/components/site/pages/FaqView';
import { FeaturesView } from '@/components/site/pages/FeaturesView';
import { CustomPage } from '@/components/site-content/CustomPage';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { PreviewMeasure } from '@/components/site-content/PreviewMeasure';
import { FAQ_DEFAULT } from '@/content/site/faq';
import { defaultContent } from '@/content/site/index';
import { DESIGNED_KEYS, type DesignedKey, type WontDoContent } from '@/content/site/types';
import { WONT_DO_DEFAULT } from '@/content/site/wont-do';
import { logoSize, playStoreUrl } from '@/lib/metadata';
import { getSettings, logoUrl, type SiteSettings } from '@/lib/settings';
import { getChrome, getPageContent, getPreview, getSharedContent } from '@/lib/site-content/api';
import { isLegalKey, isRec, isSiteDoc, parseLegalAnswer, type PreviewAnswer } from '@/lib/site-content/answers';
import { mergeContent } from '@/lib/site-content/merge';
import { resolveChrome, type SiteChrome } from '@/lib/site-content/site-chrome';
import { getChart, getTicker } from '@/market/server';
import type { TickerData } from '@/market/types';
import { clientFromHeaders } from '@/portal/backend';
import { STAFF_COOKIE } from '@/portal/session';

/**
 * /preview/<token> (W7 addendum §8.9): an unsaved draft from the portal's
 * editor, drawn with the same view components the real routes use, inside
 * the same family chrome (the published menus and footer, from getChrome()).
 * Staff only: it reads the staff session cookie (a documented exception to
 * plan §0 rule 10) and asks `GET staff/site/previews/<token>` with the
 * session and the site key. Without a session, with someone else's or an
 * expired token, or on any failure: 404. Dynamic, never cached, never
 * indexed; no third-party script (the layout is outside (public)).
 *
 * By kind:
 * - DESIGNED (M7.4b): the page's own view with the draft merged over the
 *   built-in default (as getPageContent merges a published item), the same
 *   data the live page fetches, and the live page's family: Home in the
 *   home chrome (the MarketStatus chip and the footer's data line follow the
 *   site-prices gate), the five site pages in the site chrome. `?gate=off`
 *   shows the page with the site-prices gate off (the portal's "Gate off"
 *   switch on Home: the type-led hero and the gate-off H2). PreviewMeasure
 *   posts the layout meters' numbers to the portal frame.
 * - LEGAL: LegalShell + LegalDocument with the values the API resolves now
 *   (the "Updated" date a publish would set: today);
 * - CUSTOM: the custom page template;
 * - SHARED (wont-do): "What it won't do", full (as on /features) and compact
 *   (as on the home page);
 * - CHROME: the header and footer with the draft menus and texts, and the
 *   draft 404 heading and line.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Params = { token: string };
type Search = { gate?: string | string[] };

/**
 * The family chrome around the preview, as the (home) and (site) layouts
 * render it: the published chrome, or the draft one when previewing `chrome`.
 */
function Family({
  variant = 'site',
  settings,
  chrome,
  gateOn = false,
  marketAttribution = null,
  children,
}: {
  variant?: 'home' | 'site';
  settings: SiteSettings;
  chrome: SiteChrome;
  /** Home only: the site-prices gate (the header's status chip, the footer's data line). */
  gateOn?: boolean;
  marketAttribution?: string | null;
  children: ReactNode;
}) {
  const home = variant === 'home';
  return (
    <>
      <SiteHeader
        variant={variant}
        logoUrl={logoUrl(settings)}
        logoSize={logoSize(settings)}
        playUrl={playStoreUrl(settings)}
        showStatus={home && gateOn}
        status={home ? (gateOn ? <MarketStatus variant="chip" media="(min-width: 1024px)" /> : null) : undefined}
        nav={chrome.primary}
        drawer={{ more: chrome.drawerMore, legal: chrome.drawerLegal }}
      />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter
        variant={variant}
        settings={settings}
        marketAttribution={home ? (gateOn ? marketAttribution : null) : undefined}
        chrome={chrome}
      />
    </>
  );
}

/** The ticker as the site would serve it with the gate off: placed on news pages only (spec §7.0 rule 4). */
function gateOffTicker(t: TickerData | null): TickerData | null {
  return t ? { ...t, config: { ...t.config, placement: 'news' } } : null;
}

const isDesignedKey = (key: string): key is DesignedKey => (DESIGNED_KEYS as readonly string[]).includes(key);

const todayIso = () => new Date().toISOString();

/** A designed page with the draft: the live page's view, data and family. */
async function DesignedPreview({
  itemKey,
  draft,
  settings,
  chrome,
  gateOff,
}: {
  itemKey: DesignedKey;
  draft: Record<string, unknown>;
  settings: SiteSettings;
  chrome: SiteChrome;
  gateOff: boolean;
}) {
  const ticker = getTicker().then((t) => (gateOff ? gateOffTicker(t) : t));
  const measure = <PreviewMeasure itemKey={itemKey} />;

  switch (itemKey) {
    case 'home': {
      // As (home)/page.tsx: loadHomeData(), everything in parallel, every source null-safe.
      const [wontDo, data] = await Promise.all([getSharedContent('wont-do'), loadHomeData(ticker)]);
      const tickerData = data.ticker;
      const gateOn = pricesOnSite(tickerData);
      return (
        <>
          <Family variant="home" settings={settings} chrome={chrome} gateOn={gateOn} marketAttribution={tickerData?.attribution ?? null}>
            <HomeView
              content={mergeContent(defaultContent('home'), draft)}
              wontDo={wontDo}
              settings={settings}
              data={data}
            />
          </Family>
          {measure}
        </>
      );
    }
    case 'features': {
      const [wontDo, tickerData, chart] = await Promise.all([
        getSharedContent('wont-do'),
        ticker,
        getChart('NSE:NIFTY', '6M'),
      ]);
      return (
        <>
          <Family settings={settings} chrome={chrome}>
            <FeaturesView
              content={mergeContent(defaultContent('features'), draft)}
              settings={settings}
              data={{ chart: pricesOnSite(tickerData) ? chart : null, wontDo }}
            />
          </Family>
          {measure}
        </>
      );
    }
    case 'about':
      return (
        <>
          <Family settings={settings} chrome={chrome}>
            <AboutView content={mergeContent(defaultContent('about'), draft)} settings={settings} />
          </Family>
          {measure}
        </>
      );
    case 'faq':
      return (
        <>
          <Family settings={settings} chrome={chrome}>
            <FaqView content={mergeContent(defaultContent('faq'), draft)} settings={settings} />
          </Family>
          {measure}
        </>
      );
    case 'download': {
      // "Before you install" quotes the published FAQ, as /download does.
      const faq = await getPageContent('faq', FAQ_DEFAULT);
      return (
        <>
          <Family settings={settings} chrome={chrome}>
            <DownloadView content={mergeContent(defaultContent('download'), draft)} settings={settings} data={{ faq }} />
          </Family>
          {measure}
        </>
      );
    }
    case 'contact':
      return (
        <>
          <Family settings={settings} chrome={chrome}>
            <ContactView content={mergeContent(defaultContent('contact'), draft)} settings={settings} />
          </Family>
          {measure}
        </>
      );
  }
}

function LegalPreview({ preview }: { preview: PreviewAnswer }) {
  if (!isLegalKey(preview.key)) return null;
  const key = preview.key;
  const values = preview.liveValues ?? {};
  const now = todayIso();
  const doc = parseLegalAnswer(key, {
    key,
    lang: preview.lang,
    content: preview.content,
    revision: { number: 0, change: 'EDIT', publishedAt: now, dateShown: now, dateLabel: null, noticeVersion: values['notice.version'] ?? null },
    liveValues: values,
    notice: null,
  });
  if (!doc) return <DraftNote text="This draft can't be shown yet: its document is incomplete." />;
  if (key === 'privacy-hi') {
    return (
      <LegalPage
        doc={doc}
        breadcrumbs={[
          { name: 'Privacy notice', href: '/privacy' },
          { name: doc.content.title, lang: 'hi' },
        ]}
      />
    );
  }
  if (key === 'privacy-requests') {
    return (
      <LegalPage
        doc={doc}
        showUpdated={false}
        breadcrumbs={[{ name: 'Privacy notice', href: '/privacy' }, { name: doc.content.title }]}
        islands={{ requestForm: <RequestForm /> }}
      />
    );
  }
  if (key === 'privacy') {
    return <LegalPage doc={doc} islands={{ cookieSettings: <NoticeCookieSettings /> }} />;
  }
  return <LegalPage doc={doc} />;
}

function CustomPreview({ preview }: { preview: PreviewAnswer }) {
  const c = preview.content;
  if (typeof c.title !== 'string' || !isSiteDoc(c.body)) {
    return <DraftNote text="This draft can't be shown yet: its page is incomplete." />;
  }
  return (
    <CustomPage
      page={{
        title: c.title,
        intro: typeof c.intro === 'string' ? c.intro : '',
        body: c.body,
        showUpdated: c.showUpdated !== false,
        revision: { dateShown: todayIso(), dateLabel: null },
        liveValues: preview.liveValues ?? {},
      }}
    />
  );
}

function WontDoPreview({ content }: { content: WontDoContent }) {
  return (
    <div className="sv-container py-(--sv-section-site)">
      <div className="grid gap-12">
        <section aria-label="Full list, as on /features">
          <p className="t-meta mb-3 text-fg-3">Full list (/features)</p>
          <WontDo headingLevel="h2" content={content} />
        </section>
        <section aria-label="Compact list, as on the home page">
          <p className="t-meta mb-3 text-fg-3">Compact list (home page)</p>
          <WontDo headingLevel="h2" compact headingId="wont-do-compact" content={content} />
        </section>
      </div>
    </div>
  );
}

function DraftNote({ text }: { text: string }) {
  return (
    <div className="sv-container py-(--sv-section-site)">
      <p className="t-lead max-w-[34em] text-fg-2">{text}</p>
    </div>
  );
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const session = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!session) notFound();
  const result = await getPreview(token, session, clientFromHeaders(await headers()));
  if (result.status === 'none') notFound();

  const [settings, liveChrome] = await Promise.all([getSettings(), getChrome()]);
  if (result.status === 'busy') {
    return (
      <Family settings={settings} chrome={liveChrome}>
        <DraftNote text="Preview paused for a moment." />
      </Family>
    );
  }

  const { preview } = result;
  switch (preview.kind) {
    case 'DESIGNED': {
      if (!isDesignedKey(preview.key)) notFound();
      const gate = (await searchParams).gate;
      return (
        <DesignedPreview
          itemKey={preview.key}
          draft={preview.content}
          settings={settings}
          chrome={liveChrome}
          gateOff={gate === 'off'}
        />
      );
    }
    case 'LEGAL':
      return (
        <Family settings={settings} chrome={liveChrome}>
          <LegalPreview preview={preview} />
        </Family>
      );
    case 'CUSTOM':
      return (
        <Family settings={settings} chrome={liveChrome}>
          <CustomPreview preview={preview} />
        </Family>
      );
    case 'SHARED':
      return (
        <Family settings={settings} chrome={liveChrome}>
          <WontDoPreview content={mergeContent(WONT_DO_DEFAULT, preview.content)} />
        </Family>
      );
    case 'CHROME': {
      const chrome = resolveChrome(isRec(preview.chrome) ? preview.chrome : null);
      return (
        <Family settings={settings} chrome={chrome}>
          <PageHead family="site" title={chrome.notFound.title} summary={chrome.notFound.line} />
        </Family>
      );
    }
    default:
      notFound();
  }
}
