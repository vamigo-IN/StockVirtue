import 'server-only';
import type { Metadata } from 'next';
import { inlineText } from '@/components/site-content/RichInline';
import type { LegalKey } from '@/content/site/types';
import { pageMetadata } from '@/lib/metadata';
import type { LegalDoc } from './answers';

/** Where each legal document lives. */
export const LEGAL_PATHS: Readonly<Record<LegalKey, string>> = {
  privacy: '/privacy',
  'privacy-hi': '/privacy/hi',
  terms: '/terms',
  disclaimer: '/disclaimer',
  'privacy-requests': '/privacy/requests',
};

/**
 * The two notices' language pair. BOTH /privacy and /privacy/hi carry it
 * (reciprocal hreflang, W7 addendum §4.3, §9.2), as they always have.
 */
export const NOTICE_LANGUAGES: Readonly<Record<string, string>> = {
  'en-IN': '/privacy',
  'hi-IN': '/privacy/hi',
};

/**
 * A legal page's metadata from its document's head (§4.3): the SEO title
 * (through the site's title template), the SEO description with its tokens
 * resolved from the revision's values, the canonical, Open Graph and, on the
 * two notices, the hreflang pair.
 */
export async function legalMetadata(doc: LegalDoc): Promise<Metadata> {
  const { content, liveValues } = doc;
  const description =
    inlineText(content.seo.description, liveValues).trim() || inlineText(content.summary, liveValues).trim();
  const notice = doc.key === 'privacy' || doc.key === 'privacy-hi';
  return pageMetadata({
    title: content.seo.title.trim() || content.title,
    description,
    path: LEGAL_PATHS[doc.key],
    languages: notice ? { ...NOTICE_LANGUAGES } : undefined,
  });
}
