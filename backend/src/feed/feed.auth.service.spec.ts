import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig, FeedConfig } from '../config/configuration';
import { FeedAuthService } from './feed.auth.service';

const SECRET = 'a-very-long-random-client-secret-value';
const TOKEN_SECRET = 'x'.repeat(48);

function makeService(over: Partial<FeedConfig> = {}): FeedAuthService {
  const cfg: FeedConfig = {
    enabled: true,
    apiKeys: [
      {
        id: 'fincalc-app',
        hash: createHash('sha256').update(SECRET, 'utf8').digest('hex'),
      },
    ],
    tokenSecret: TOKEN_SECRET,
    tokenTtl: 900,
    requireSignedTokens: false,
    allowedOrigins: [],
    broadcastMs: 1000,
    snapshotRefreshMs: 60_000,
    universeRefreshMs: 21_600_000,
    maxConnections: 5000,
    maxConnectionsPerIp: 20,
    ...over,
  };
  const config = {
    get: () => cfg,
  } as unknown as ConfigService<AppConfig, true>;
  return new FeedAuthService(config);
}

describe('FeedAuthService', () => {
  describe('raw API keys', () => {
    it('accepts a correct clientId:secret pair', () => {
      const result = makeService().verify(`fincalc-app:${SECRET}`);
      expect(result).toEqual({
        ok: true,
        clientId: 'fincalc-app',
        mode: 'key',
      });
    });

    it('rejects a wrong secret', () => {
      const result = makeService().verify('fincalc-app:nope');
      expect(result.ok).toBe(false);
    });

    it('rejects an unknown client id', () => {
      const result = makeService().verify(`someone-else:${SECRET}`);
      expect(result).toMatchObject({ ok: false, reason: 'unknown client' });
    });

    it('rejects a credential with no separator', () => {
      expect(makeService().verify(SECRET).ok).toBe(false);
    });

    it('rejects everything when signed tokens are mandatory', () => {
      const svc = makeService({ requireSignedTokens: true });
      expect(svc.verify(`fincalc-app:${SECRET}`)).toMatchObject({
        ok: false,
        reason: 'raw api keys are disabled',
      });
    });
  });

  describe('signed tokens', () => {
    it('round-trips a minted token', () => {
      const svc = makeService();
      const token = svc.mintToken('fincalc-app');
      expect(token).toBeTruthy();
      expect(svc.verify(token)).toEqual({
        ok: true,
        clientId: 'fincalc-app',
        mode: 'token',
      });
    });

    it('accepts a minted token even when raw keys are disabled', () => {
      const svc = makeService({ requireSignedTokens: true });
      expect(svc.verify(svc.mintToken('fincalc-app'))).toMatchObject({
        ok: true,
      });
    });

    it('refuses to mint for an unknown client', () => {
      expect(makeService().mintToken('ghost')).toBeNull();
    });

    it('rejects a tampered signature', () => {
      const svc = makeService();
      const token = svc.mintToken('fincalc-app') as string;
      const forged = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
      expect(svc.verify(forged)).toMatchObject({ ok: false });
    });

    it('rejects a token whose client id was swapped', () => {
      const svc = makeService();
      const token = svc.mintToken('fincalc-app') as string;
      const [, , exp, sig] = token.split('.');
      expect(svc.verify(`sv1.other-app.${exp}.${sig}`)).toMatchObject({
        ok: false,
      });
    });

    it('rejects an expired token', () => {
      const svc = makeService();
      const token = svc.mintToken('fincalc-app', 60) as string;
      jest.useFakeTimers();
      try {
        jest.setSystemTime(Date.now() + 120_000);
        expect(svc.verify(token)).toMatchObject({
          ok: false,
          reason: 'token expired',
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('rejects signed tokens when no token secret is configured', () => {
      const signer = makeService();
      const token = signer.mintToken('fincalc-app') as string;
      const svc = makeService({ tokenSecret: '' });
      expect(svc.verify(token)).toMatchObject({ ok: false });
    });
  });

  describe('input hardening', () => {
    it.each([undefined, null, '', 42, {}, []])(
      'rejects non-string credential %p',
      (value) => {
        expect(makeService().verify(value).ok).toBe(false);
      },
    );

    it('rejects an oversized credential without hashing it', () => {
      expect(makeService().verify('a'.repeat(5000))).toMatchObject({
        ok: false,
        reason: 'credential too long',
      });
    });
  });
});
