'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV, SITE } from '@/lib/site';
import { Icon } from './Icon';

export function Header({ logoUrl = '/logo.png' }: { logoUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const links = NAV.filter((n) => n.href !== '/download');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on route change.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`header${scrolled ? ' scrolled' : ''}`}>
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={SITE.name} className="brand-logo" />
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {links.map((n) => {
            const active = pathname === n.href;
            const props = {
              href: n.href,
              className: `nav-link${active ? ' active' : ''}`,
              'aria-current': active ? ('page' as const) : undefined,
            };
            return n.fullLoad ? (
              <a key={n.href} {...props}>
                {n.label}
              </a>
            ) : (
              <Link key={n.href} {...props}>
                {n.label}
              </Link>
            );
          })}
          <a
            className="btn btn-primary btn-sm nav-cta"
            href={SITE.playUrl}
            target="_blank"
            rel="noopener"
          >
            <Icon name="play" size={15} />
            Get the app
          </a>
        </nav>

        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
      </div>

      {open && (
        <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile">
          {links.map((n) =>
            n.fullLoad ? (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ) : (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            ),
          )}
          <a
            className="btn btn-primary btn-block"
            href={SITE.playUrl}
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
          >
            <Icon name="play" size={16} />
            Get the app
          </a>
        </nav>
      )}
    </header>
  );
}
