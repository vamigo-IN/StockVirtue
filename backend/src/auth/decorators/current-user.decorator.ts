import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { User } from '@prisma/client';
import { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<Request & { user: User }>();
    return req.user;
  },
);
