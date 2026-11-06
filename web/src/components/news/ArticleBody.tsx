import { WidgetDataProvider } from '@/components/widgets/data';
import { Widget, WidgetBoundary } from '@/components/widgets/Widget';
import { cn } from '@/lib/utils';
import type { ReaderBlock } from '@/news/types';

/** One HTML run's wrapper: the story prose (article-prose.css). */
const PROSE = 'sv-prose prose prose-neutral';

/**
 * A story as blocks (spec §5.12): the server-rendered, sanitised HTML runs
 * and the live widgets between them, in the order the newsroom placed them.
 *
 * - Each HTML run is ONE `.sv-prose` wrapper (Source Serif 18/30, 19/32 from
 *   768 px, at most 34em wide: about 70 characters a line).
 * - Each widget is `<div data-widget="{type}">` with its own error boundary,
 *   all inside one `WidgetDataProvider mode="public"`. Widgets keep their
 *   authored order and use the body column's full width (up to c2–8 at
 *   1280 px, past the prose's 34em).
 * - Content widgets still render on the server, so their text is in the
 *   page for readers without JavaScript and for search engines.
 *
 * `html` is the API's sanitised story HTML (an older story without blocks):
 * one prose run.
 */
export function ArticleBody({
  blocks,
  html,
  className,
}: {
  blocks?: ReaderBlock[];
  html?: string;
  className?: string;
}) {
  if (!blocks?.length) {
    return (
      <div className={className}>
        {/* Built and sanitised by the API from the stored story. */}
        <div className={cn(PROSE, 'mt-8')} dangerouslySetInnerHTML={{ __html: html ?? '' }} />
      </div>
    );
  }
  return (
    <div className={className}>
      <WidgetDataProvider mode="public">
        {blocks.map((b, i) =>
          b.type === 'html' ? (
            <div
              key={i}
              className={cn(PROSE, 'mt-8')}
              // Built and sanitised by the API from the stored story.
              dangerouslySetInnerHTML={{ __html: b.html }}
            />
          ) : (
            <div key={i} data-widget={b.widget}>
              <WidgetBoundary>
                <Widget block={b} />
              </WidgetBoundary>
            </div>
          ),
        )}
      </WidgetDataProvider>
    </div>
  );
}
