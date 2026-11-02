import type { Metadata, Viewport } from 'next';
import './portal.css';
import { PortalProviders } from '@/components/portal/PortalProviders';
import { articleSerif } from '@/lib/fonts';

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
  // The article serif is for the editor and preview; `contents` keeps the
  // wrapper out of layout.
  return (
    <div className={`${articleSerif.variable} contents`}>
      <PortalProviders>{children}</PortalProviders>
    </div>
  );
}
