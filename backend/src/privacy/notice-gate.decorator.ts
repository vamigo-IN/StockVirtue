import { SetMetadata } from '@nestjs/common';

export const NOTICE_GATE_EXEMPT = 'sv:noticeGateExempt';

/**
 * Keeps an app route open for an account that hasn't accepted the current
 * privacy notice while the app notice gate is on (W7 decision 2, addendum
 * §5.11.3): reading and accepting the notice, signing out, deleting the
 * account and the person's DPDP rights. Every other `JwtAuthGuard` route is
 * gated. The list is fixed: jwt-auth.guard.spec.ts holds it exactly, so a
 * new exempt route fails that spec until §5.11.3 and the spec change too.
 */
export const NoticeGateExempt = () => SetMetadata(NOTICE_GATE_EXEMPT, true);
