import Link from 'next/link';
import { NAV, SITE } from '@/lib/site';
import { Icon } from './Icon';

export function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} home`}>
          <span className="brand-mark">S</span>
          {SITE.name}
        </Link>
        <nav className="nav" aria-label="Primary">
          <div className="nav-links" style={{ display: 'flex', gap: 26 }}>
            {NAV.filter((n) => n.href !== '/download').map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="nav-cta">
            <a
              className="btn btn-primary"
              href={SITE.playUrl}
              target="_blank"
              rel="noopener"
            >
              <Icon name="play" size={16} />
              Get the app
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
