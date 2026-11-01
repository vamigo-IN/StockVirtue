import type { Metadata, Viewport } from 'next';
import './portal.css';
import { PortalProviders } from '@/components/portal/PortalProviders';

export const metadata: Metadata = {
  title: { default: 'Newsroom', template: '%s · StockVirtue Newsroom' },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { colorScheme: 'light dark' };

/**
 * The staff portal (newsroom CMS). Its own stylesheet and providers; the
 * marketing site's header, footer, animations and admin-managed code
 * injection never load here, so a broken snippet can't lock staff out.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalProviders>{children}</PortalProviders>;
}
