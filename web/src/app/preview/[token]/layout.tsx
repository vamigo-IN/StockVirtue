import '../../(public)/public.css';
import type { Metadata } from 'next';
import { DISCLOSURE_SCRIPT } from '@/lib/disclosure';
import { articleSerif, publicFontVars } from '@/lib/fonts-public';
import { PRE_PAINT_SCRIPT } from '@/lib/palette';

/**
 * The preview route's shell (W7 addendum §8.9, §9.1): outside (public), so
 * SiteScripts, the code injections, analytics, ads, the structured data and
 * the consent banner never load here. It brings the public styles and fonts
 * itself, with the public font variables on #sv-public (as the (public)
 * layout sets them), and runs the same two pre-paint scripts (the palette,
 * the phone disclosures). Never indexed: robots noindex, nofollow; `other`
 * is emptied so the root layout's AdSense account tag isn't printed either.
 */
export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  other: {},
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="sv-public" className={`${publicFontVars} ${articleSerif.variable}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      {children}
      <script dangerouslySetInnerHTML={{ __html: DISCLOSURE_SCRIPT }} />
    </div>
  );
}
