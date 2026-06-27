'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NAV, SITE } from '@/lib/site';
import { Icon } from './Icon';

export function Header() {
  const [open, setOpen] = useState(false);
  const links = NAV.filter((n) => n.href !== '/download');

  return (
    <header className="header">
      <div className="container header-inner">
        <Link
          href="/"
          className="brand"
          aria-label={`${SITE.name} home`}
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={SITE.name} className="brand-logo" />
        </Link>

        {/* Desktop nav */}
        <nav className="nav-desktop" aria-label="Primary">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link">
              {n.label}
            </Link>
          ))}
          <a
            className="btn btn-primary btn-sm"
            href={SITE.playUrl}
            target="_blank"
            rel="noopener"
          >
            <Icon name="play" size={15} />
            Get the app
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <nav className="mobile-menu" aria-label="Mobile">
          {NAV.filter((n) => n.href !== '/download').map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          <a
            className="btn btn-primary"
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
