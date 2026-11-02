import { Rss, Search } from 'lucide-react';
import Link from 'next/link';
import type { SiteSettings } from '@/lib/settings';
import { FOOTER_LINKS, SITE } from '@/lib/site';
import { newsPath } from '@/news/routes';
import type { NewsCategoryNode } from '@/news/types';
import { Container } from './blocks';

/**
 * News masthead. Links back to the marketing site are plain <a> tags (full
 * page loads), so the two areas' stylesheets never meet in one document.
 */
export function NewsHeader({
  categories,
  playUrl,
}: {
  categories: NewsCategoryNode[];
  playUrl: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
      >
        Skip to the stories
      </a>
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label={`${SITE.name} home`} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={SITE.name}
              width={143}
              height={32}
              className="h-7 w-auto sm:h-8"
            />
          </a>
          <span aria-hidden="true" className="h-6 w-px bg-border" />
          <Link
            href={newsPath.home()}
            className="font-mono text-sm font-bold tracking-[0.18em] text-primary uppercase"
          >
            News
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={newsPath.search()}
            className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
            aria-label="Search the news"
          >
            <Search className="size-5" />
          </Link>
          <a
            href={playUrl}
            target="_blank"
            rel="noopener"
            className="hidden rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:inline-flex"
          >
            Get the app
          </a>
        </div>
      </Container>
      <nav aria-label="News sections" className="border-t border-border">
        <Container>
          <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <li>
              <NavLink href={newsPath.home()}>Top stories</NavLink>
            </li>
            <li>
              <NavLink href={newsPath.latest()}>Latest</NavLink>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <NavLink href={newsPath.category(c.slug)}>{c.name}</NavLink>
              </li>
            ))}
          </ul>
        </Container>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export function NewsFooter({
  settings,
  categories,
  marketAttribution,
}: {
  settings: SiteSettings;
  categories: NewsCategoryNode[];
  marketAttribution?: string;
}) {
  const social = [
    { label: 'X / Twitter', href: settings.social.twitter },
    { label: 'Instagram', href: settings.social.instagram },
    { label: 'LinkedIn', href: settings.social.linkedin },
    { label: 'YouTube', href: settings.social.youtube },
    { label: 'Facebook', href: settings.social.facebook },
  ].filter((s): s is { label: string; href: string } => !!s.href);
  const year = new Date().getFullYear();
  const legal = FOOTER_LINKS.find((c) => c.title === 'Legal')?.links ?? [];
  const company = FOOTER_LINKS.filter((c) => c.title !== 'Legal')
    .flatMap((c) => c.links)
    .filter((l) => !l.href.startsWith('/news'));
  return (
    <footer className="mt-16 bg-ink text-ink-foreground">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <a href="/" aria-label={`${SITE.name} home`} className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={SITE.name}
              width={143}
              height={32}
              className="h-8 w-auto rounded bg-white/95 px-2 py-1"
            />
          </a>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
            News and explainers on Indian and global markets, from the
            StockVirtue newsroom. For information and learning only: nothing
            here is investment advice.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <a
              href="/news/feed.xml"
              className="inline-flex items-center gap-1.5 text-ink-muted hover:text-glow"
            >
              <Rss className="size-4" /> RSS feed
            </a>
            {social.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener"
                className="text-ink-muted hover:text-glow"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
        <FooterColumn title="Sections">
          <FooterLink href={newsPath.latest()}>Latest news</FooterLink>
          {categories.slice(0, 6).map((c) => (
            <FooterLink key={c.slug} href={newsPath.category(c.slug)}>
              {c.name}
            </FooterLink>
          ))}
        </FooterColumn>
        {[
          { title: SITE.name, links: company },
          { title: 'Legal', links: legal },
        ].map((col) => (
          <FooterColumn key={col.title} title={col.title}>
            {col.links.map((l) => (
              // The marketing pages load their own stylesheet: full page loads.
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-ink-muted hover:text-glow"
              >
                {l.label}
              </a>
            ))}
          </FooterColumn>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-ink-muted sm:flex-row sm:justify-between">
          <span>
            © {year} {SITE.company}
            {marketAttribution && (
              <>
                {' · '}Market data: {marketAttribution}. Each price shows
                whether it is live, delayed or end-of-day.
              </>
            )}
          </span>
          <span>
            {SITE.name} is an educational trading simulator, not a broker.
          </span>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 font-mono text-[11px] tracking-[0.12em] text-ink-muted uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-sm text-ink-muted hover:text-glow">
      {children}
    </Link>
  );
}
