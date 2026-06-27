import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-alt)' }}>
      <header
        className="header"
        style={{ background: '#fff', position: 'static' }}
      >
        <div className="container header-inner">
          <Link href="/admin/dashboard" className="brand">
            <span className="brand-mark">S</span>
            {SITE.name} <span className="muted" style={{ fontWeight: 600 }}>· Admin</span>
          </Link>
          <Link href="/" className="muted" style={{ fontSize: '0.9rem' }}>
            ← View site
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
