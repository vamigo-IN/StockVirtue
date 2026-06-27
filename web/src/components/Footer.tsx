import Link from 'next/link';
import { FOOTER_LINKS, SITE } from '@/lib/site';
import type { SiteSettings } from '@/lib/settings';

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
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div>
            <Link href="/" className="brand">
              <span className="brand-mark">S</span>
              {SITE.name}
            </Link>
            <p className="footer-disclaimer">
              {SITE.name} is a virtual stock-market simulator for learning.
              All trades use virtual money — not real funds. Nothing here is
              investment advice.
            </p>
            {social.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
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
          <span>
            © {year} {SITE.company}. All rights reserved.
          </span>
          <span>{SITE.name} · Made in India 🇮🇳</span>
        </div>
      </div>
    </footer>
  );
}
