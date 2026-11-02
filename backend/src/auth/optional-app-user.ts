import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

const jwt = new JwtService();

/**
 * The signed-in app user behind a request to a public endpoint, or null (no
 * token, an expired or forged one, or a refresh token). For keying limits
 * and counts per reader rather than per address — many phones share a
 * mobile carrier's IP — never for access control, which stays with
 * JwtAuthGuard (it also checks the account still exists and isn't blocked).
 */
export function optionalAppUser(
  req: Request,
  accessSecret: string,
): string | null {
  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ') || !accessSecret) return null;
  try {
    const payload = jwt.verify<{ sub?: unknown; type?: unknown }>(
      header.slice(7).trim(),
      { secret: accessSecret, algorithms: ['HS256'] },
    );
    return payload.type === 'access' && typeof payload.sub === 'string'
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}
