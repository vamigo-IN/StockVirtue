import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {
    const jwt = config.get('jwt', { infer: true });
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt.accessSecret,
      // Pin the signing algorithm so a token can't be accepted under a
      // different alg (alg-confusion / "alg:none").
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Wrong token type');
    }
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User no longer exists');
    // BLOCKED users hold positions but can't act — admin sets this via
    // the dashboard. We 401 so the mobile client clears its token and
    // bounces the user back to PhoneScreen, where re-auth attempts also
    // fail because the same status check fires on every authed request.
    if (user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account is blocked. Contact support.');
    }
    if (user.status === 'DELETED') {
      throw new UnauthorizedException('This account was deleted.');
    }
    return user;
  }
}
