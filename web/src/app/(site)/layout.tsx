import { getSettings } from '@/lib/settings';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { RawHtml } from '@/components/CodeInjection';
import { JsonLd } from '@/components/JsonLd';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { ScrollProgress } from '@/components/motion/ScrollProgress';
import { MotionProvider } from '@/components/motion/MotionProvider';

/**
 * Public marketing chrome. Lives in the (site) route group so the admin panel
 * (outside this group) is isolated from the header/footer AND from any
 * admin-managed code injection — a broken snippet can never lock you out of
 * the settings panel.
 */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  return (
    <>
      <RawHtml html={settings.headCode} />
      <RawHtml html={settings.bodyStartCode} />
      <JsonLd />
      <MotionProvider>
        <SmoothScroll />
        <ScrollProgress />
        <Header />
        <main>{children}</main>
        <Footer settings={settings} />
      </MotionProvider>
      <RawHtml html={settings.bodyEndCode} />
    </>
  );
}
