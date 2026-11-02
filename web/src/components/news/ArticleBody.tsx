import { WidgetDataProvider } from '@/components/widgets/data';
import { Widget, WidgetBoundary } from '@/components/widgets/Widget';
import type { ReaderBlock } from '@/news/types';

/**
 * A story as blocks: the server-rendered, sanitised HTML runs, and live
 * widgets between them. Content widgets still render on the server, so their
 * text is in the page for readers without JavaScript and for search engines.
 */
export function ArticleBody({ blocks }: { blocks: ReaderBlock[] }) {
  return (
    <WidgetDataProvider mode="public">
      {blocks.map((b, i) =>
        b.type === 'html' ? (
          <div
            key={i}
            className="sv-prose prose prose-neutral mt-8 max-w-none"
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
  );
}
