import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ARTICLE_STATUS_LABELS } from '@/portal/format';

const STYLES: Record<string, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  IN_REVIEW: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  CHANGES_REQUESTED: 'border-warning/30 bg-warning/10 text-warning',
  APPROVED:
    'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  SCHEDULED:
    'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  PUBLISHED: 'border-success/30 bg-success/10 text-success',
  REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
  CANCELLED: 'border-border bg-muted text-muted-foreground line-through',
  ARCHIVED: 'border-border bg-muted text-muted-foreground',
};

export function ArticleStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', STYLES[status], className)}
    >
      {ARTICLE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
