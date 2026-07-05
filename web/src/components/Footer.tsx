import Link from 'next/link';
import { FOOTER_LINKS, SITE } from '@/lib/site';
import type { SiteSettings } from '@/lib/settings';
import { Sparkline } from './motion/Sparkline';
import { SimChip } from './motion/Glass';

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  const social: { label: string; href?: string }[] = [
    { label: 'X / Twitter', href: settings.social.twitter },
    { label: 'Instagram', href: settings.social.instagram },
    { label: 'LinkedIn', href: settings.social.linkedin },
    { label: 'YouTube', href: settings.social.youtube },
    { label: 'Facebook', href: settings.social.facebook },
  ].filter((s) => s.href);

  return (
    <footer className="footer terminal">
      <div className="floor" aria-hidden="true" />
      <div className="grid-bg" aria-hidden="true" />
      <div className="container footer-inner">
        <div className="footer-top">
          <div>
            <Link
              href="/"
              className="footer-logo"
              aria-label={`${SITE.name} home`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt={SITE.name} />
            </Link>
            <p className="footer-disclaimer">
              {SITE.name} is an educational stock-market simulator. Every trade
              uses virtual money — not real funds. Nothing here is investment
              advice.
            </p>
            <div className="footer-spark">
              <Sparkline
                points={[8, 10, 9, 13, 12, 16, 15, 19, 18, 22, 24]}
                height={28}
              />
            </div>
            {social.length > 0 && (
              <div style={{ marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {social.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener">
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              {col.links.map((l) => (
                <div key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <SimChip label="Simulated · not a broker" />
            © {year} {SITE.company}
          </span>
          <span>{SITE.name} · Made in India 🇮🇳</span>
        </div>
      </div>
    </footer>
  );
}
