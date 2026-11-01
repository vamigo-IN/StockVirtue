import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { getSettings } from '@/lib/settings';
import SiteNotFound from './(site)/not-found';

/**
 * Unknown URLs anywhere on the site. Rendered in the root layout (outside the
 * (site) group), so it brings the marketing stylesheet and chrome itself.
 */
export default async function NotFound() {
  const settings = await getSettings();
  return (
    <>
      <Header />
      <main>
        <SiteNotFound />
      </main>
      <Footer settings={settings} />
    </>
  );
}
