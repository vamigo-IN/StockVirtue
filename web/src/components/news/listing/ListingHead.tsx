import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/news/blocks';
import { PageHead } from '@/components/public/Heads';

export type Crumb = { name: string; href?: string; lang?: string };

/**
 * The head of a listing or a hub (spec §5.10, §5.11; W5): W0's PageHead
 * with the news family (H1 `hub-1`, summary `standfirst`), the breadcrumbs
 * as the only thing above the H1 (R1), then `children` under the summary
 * (the sub-section links, a hub's MarketStatus line). No eyebrow and no
 * count line ("N stories" was CMS metadata). Server component.
 */
export function ListingHead({
  title,
  summary,
  crumbs,
  children,
  className,
}: {
  title: string;
  summary?: ReactNode;
  crumbs: Crumb[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <PageHead
      family="news"
      title={title}
      summary={summary || undefined}
      crumbs={crumbs.length ? <Breadcrumbs items={crumbs} /> : undefined}
      className={className}
    >
      {children}
    </PageHead>
  );
}
