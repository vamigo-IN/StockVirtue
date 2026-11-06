import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The error codes the portal maps (W7 addendum §7.6). Every answer is
 * `{ statusCode, message: { message, code, ...extra }, timestamp }` through
 * AllExceptionsFilter; `message.message` is a sentence the portal shows.
 */
export type SiteContentErrorCode =
  | 'invalid_content'
  | 'stale_draft'
  | 'nothing_to_publish'
  | 'missing_hook'
  | 'slug_reserved'
  | 'slug_taken'
  | 'legal_field_locked'
  | 'page_in_menu'
  | 'page_not_live'
  | 'too_large'
  | 'preview_expired'
  | 'preview_busy'
  | 'announcement_required'
  | 'announcement_in_future'
  | 'announcement_too_recent'
  | 'not_published'
  | 'not_found'
  | 'privacy_notice_flow'
  | 'not_allowed'
  | 'site_cms_unavailable'
  // The privacy notice publish (§5.1, §5.3; M7.3).
  | 'material_needs_both_languages'
  | 'material_questions_required'
  | 'version_confirmation_mismatch'
  | 'material_required'
  | 'minor_needs_super_admin';

export interface FieldError {
  /** Dotted path into the content, e.g. "hero.title" or "body.content[3]". */
  path: string;
  message: string;
}

export class SiteContentError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: SiteContentErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super({ message, code, ...extra }, status);
  }
}

export const STALE_DRAFT_MESSAGE =
  'Someone saved this page after you opened it. Reload to see their changes.';

export const staleDraft = () =>
  new SiteContentError(HttpStatus.CONFLICT, 'stale_draft', STALE_DRAFT_MESSAGE);

export const invalidContent = (errors: FieldError[]) =>
  new SiteContentError(
    HttpStatus.BAD_REQUEST,
    'invalid_content',
    errors.length === 1
      ? errors[0].message
      : `${errors.length} fields need attention before this can be saved.`,
    { errors: errors.slice(0, 100) },
  );

export const notFound = (what = 'That page') =>
  new SiteContentError(HttpStatus.NOT_FOUND, 'not_found', `${what} doesn't exist.`);

/** Prisma: the table (P2021) or a column (P2022) is missing. */
export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'P2021' || code === 'P2022') return true;
  // Raw queries report the Postgres error inside P2010.
  const msg = String((err as { message?: string } | null)?.message ?? '');
  return code === 'P2010' && /42P01|42703|does not exist/.test(msg);
}

export const cmsUnavailable = () =>
  new SiteContentError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'site_cms_unavailable',
    'Website content is not available right now.',
  );
