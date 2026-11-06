import type { ContactContent } from './types';

/**
 * The /contact page's built-in content (W7 addendum §3.7): spec §9.5.6 word
 * for word. getPageContent merges the published content over it. Plain data.
 *
 * Code, not content: the form's labels, hint, ids, button and server
 * messages (contact/actions.ts), the Email row (Settings), the Company row
 * (Settings, Privacy), "Copy email address" and the privacy link's target.
 */
export const CONTACT_DEFAULT: ContactContent = {
  seo: {
    title: 'Contact',
    description: 'Write to the StockVirtue team about the app, a story or your data. We reply by email.',
  },
  head: {
    title: 'Write to us',
    summary: "Ask about the app, a story or your data, and we'll reply by email.",
  },
  form: {
    // Legal-locked and verbatim (the collection notice, spec §4.12, §9.5.6).
    collectionNotice: [
      {
        type: 'text',
        text: 'We use your name, email and message only to reply to you, and delete them a year after our last reply. See our ',
      },
      { type: 'text', text: 'privacy notice', marks: [{ type: 'link', attrs: { href: '/privacy' } }] },
      { type: 'text', text: '.' },
    ],
  },
  aside: {
    title: 'Other ways',
    privacy: {
      title: 'Your data and privacy',
      text: {
        value:
          'To get a summary of your data, correct it or delete it, the privacy requests form is quicker for both of us.',
        facts: ['F39'],
        fallback: null,
      },
      linkLabel: 'Privacy requests',
    },
    mistake: {
      title: 'A mistake in a story?',
      text: "Use the form and paste the story's link, and our editors will look at it.",
    },
  },
};
