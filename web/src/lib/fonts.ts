import { Source_Serif_4 } from 'next/font/google';

/**
 * Reading face for article text, shared by the public news pages and the
 * portal's editor and preview so writers see what readers will. Loaded only
 * by those two layouts, never by the marketing pages.
 */
export const articleSerif = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif-sv',
  display: 'swap',
});
