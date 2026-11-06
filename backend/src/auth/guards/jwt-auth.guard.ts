import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { User } from '@prisma/client';
import { NOTICE_GATE_EXEMPT } from '../../privacy/notice-gate.decorator';
import { NoticeGateService } from '../../privacy/notice-gate.service';

/**
 * The app's sign-in on HTTP (the access token), and the app notice gate
 * (W7 decision 2, addendum §5.11.1): once passport has signed the account
 * in, a route without `@NoticeGateExempt()` (on the handler or its class)
 * answers 403 `notice_required` for an account that hasn't accepted the
 * current privacy notice while the gate is on. A bad token is still 401
 * before the gate runs. The switch is in memory, so this costs no query.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly gate: NoticeGateService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(ctx))) return false;
    const exempt = this.reflector.getAllAndOverride<boolean>(
      NOTICE_GATE_EXEMPT,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!exempt) {
      this.gate.assertOpen(ctx.switchToHttp().getRequest<{ user: User }>().user);
    }
    return true;
  }
}
