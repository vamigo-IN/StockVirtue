import './not-found.css';
import type { Metadata } from 'next';
import { StaticFooter, StaticHeader } from '@/components/public/StaticChrome';
import { fontVars404 } from '@/lib/fonts-404';
import { articleSerif } from '@/lib/fonts-public';
import { logoSize, playStoreUrl } from '@/lib/metadata';
import { getSettings, logoUrl } from '@/lib/settings';
import { getChrome } from '@/lib/site-content/api';

/**
 * Unknown URLs anywhere on the site (spec §5.8, §9.5.8). It renders in the
 * root layout, outside the (public) group, so it brings the public styles
 * and the public faces itself: through ./not-found.css and @/lib/fonts-404,
 * files no layout imports. Importing public.css or fonts-public's faces
 * directly leaves the built 404 unstyled (Next 15.5 hands a CSS file to one
 * importing entry only; see not-found.css).
 *
 * Emerald Terminal: the emerald StaticHeader and StaticFooter, a mono
 * kicker, the Hanken H1 and line from getChrome(), the search pill and the
 * popular pages as outline pills; from 1024 px a decorative terminal panel
 * with the status code.
 *
 * `articleSerif` stays imported and on the wrapper, as on #sv-public: the
 * 404 sets no serif text, but dropping the import changes how Next merges
 * CSS chunks, and /admin/login then loads the consent banner's CSS.
 *
 * SERVER-ONLY: import no client component here, not even indirectly. This
 * tree is serialised into every page's payload as the root not-found
 * fallback, so a client import would ship its JavaScript to every public
 * and /admin route (that is how Motion and Lenis used to reach /news and
 * /admin). For the same reason: no preload() calls here, and the chrome is
 * StaticHeader / StaticFooter (plain links, inline SVG, no scripts).
 *
 * Admin-managed (W7 addendum §6.4): the header menu, the footer and the
 * H1 and line come from getChrome() (`primary`, the footer parts,
 * `notFound`), fetched beside the settings; it never throws, and with no
 * published chrome it returns today's built-in chrome and texts.
 *
 * Metadata: the title "Page not found" (through the site's template) and
 * robots: null, which drops the root layout's "index, follow"; Next adds
 * its own single noindex on every 404 (spec §10). The root layout sets no
 * canonical. NEVER export robots: { index: false } here: with Next's own
 * tag that prints two robots metas.
 */
export const metadata: Metadata = { title: 'Page not found', robots: null };

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/news', label: 'Front page' },
  { href: '/news/markets', label: 'Markets' },
  { href: '/features', label: 'The app' },
];

export default async function NotFound() {
  const [settings, chrome] = await Promise.all([getSettings(), getChrome()]);
  return (
    <div id="sv-public" className={`${fontVars404} ${articleSerif.variable}`}>
      <StaticHeader
        logoUrl={logoUrl(settings)}
        logoSize={logoSize(settings)}
        playUrl={playStoreUrl(settings)}
        nav={chrome.primary}
      />
      <main id="main" tabIndex={-1}>
        <div className="sv-container sv-404">
          <div className="sv-404-text">
            <p className="t-kicker">Error 404</p>
            <h1 className="t-stage-1 mt-4 max-w-[18ch] text-fg">{chrome.notFound.title}</h1>
            <p className="t-lead mt-4 max-w-[34em] text-fg-2">{chrome.notFound.line}</p>
            <form
              action="/news/search"
              method="get"
              role="search"
              className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="not-found-q" className="sr-only">
                Search the news
              </label>
              <input
                id="not-found-q"
                name="q"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="A company, a sector, a topic"
                className="sv-input min-w-0 sm:flex-1"
              />
              <button type="submit" className="sv-btn sv-btn-primary" data-size="lg">
                Search
              </button>
            </form>
            <ul className="mt-8 flex flex-wrap gap-3" aria-label="Popular pages">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="sv-btn sv-btn-secondary">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {/* Decorative: the status code on a terminal panel. */}
          <div className="sv-404-panel sv-terminal" aria-hidden="true">
            <span className="t-mono-label sv-404-panel-label">Status</span>
            <span className="sv-404-code">404</span>
            <span className="t-mono-label sv-404-panel-label">Page not found</span>
          </div>
        </div>
      </main>
      <StaticFooter settings={settings} chrome={chrome} />
    </div>
  );
}
