/**
 * Renders admin-managed raw HTML snippets (analytics, verification tags, third-
 * party scripts) into the server-rendered output. Because the root layout is a
 * Server Component, these snippets land in the initial HTML response — so
 * <meta> verification tags are present for crawlers and <script> tags execute
 * on first parse (unlike client-side innerHTML, which wouldn't run scripts).
 */
export function RawHtml({ html }: { html?: string }) {
  if (!html || !html.trim()) return null;
  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
