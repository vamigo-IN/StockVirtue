import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { AppConfig } from '../config/configuration';

/** What a sealed value protects; bound into the ciphertext so one can't stand in for another. */
export type SecretPurpose = 'news-source' | 'ai-provider';

const VERSION = 'sb1';

/** The stored value can't be opened: re-entering the secret fixes it. */
export class SecretUnreadableError extends Error {
  constructor(readonly reason: 'format' | 'key' | 'corrupt') {
    super(
      reason === 'key'
        ? 'This secret was saved with a different encryption key. Enter it again.'
        : 'This secret can’t be read. Enter it again.',
    );
  }
}

/**
 * AES-256-GCM sealing for credentials kept in the database (news-source API
 * keys, AI provider keys). Sealed values read
 * "sb1:<key id>:<iv>:<tag>:<ciphertext>": the key id tells a key change
 * (NEWSROOM_SECRETS_KEY or JWT_ACCESS_SECRET rotated) apart from corruption,
 * so the portal can ask for the secret again instead of failing.
 */
export class SecretBox {
  private readonly key: Buffer;
  readonly keyId: string;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error('The secrets key must be at least 32 characters.');
    }
    this.key = createHash('sha256').update(secret, 'utf8').digest();
    this.keyId = createHash('sha256')
      .update(this.key)
      .digest('hex')
      .slice(0, 8);
  }

  seal(plain: string, purpose: SecretPurpose): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(purpose, 'utf8'));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      VERSION,
      this.keyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      body.toString('base64url'),
    ].join(':');
  }

  open(sealed: string, purpose: SecretPurpose): string {
    const parts = sealed.split(':');
    if (parts.length !== 5 || parts[0] !== VERSION) {
      throw new SecretUnreadableError('format');
    }
    if (parts[1] !== this.keyId) throw new SecretUnreadableError('key');
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(parts[2], 'base64url'),
      );
      decipher.setAAD(Buffer.from(purpose, 'utf8'));
      decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(parts[4], 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretUnreadableError('corrupt');
    }
  }

  /** Whether `sealed` was made with this key (without opening it). */
  ownsValue(sealed: string): boolean {
    return sealed.split(':')[1] === this.keyId;
  }
}

/**
 * NEWSROOM_SECRETS_KEY when set; otherwise a key derived from the JWT access
 * secret (always present, ≥32 chars) with a purpose label, so a fresh deploy
 * needs no new secret. Set NEWSROOM_SECRETS_KEY before rotating
 * JWT_ACCESS_SECRET, or saved credentials will need entering again.
 */
export function secretsKey(
  configured: string,
  jwtAccessSecret: string,
): string {
  if (configured) return configured;
  return createHmac('sha256', jwtAccessSecret)
    .update('stockvirtue:newsroom:secrets:v1')
    .digest('hex');
}

/** The process-wide SecretBox, configured from the environment. */
@Injectable()
export class SecretBoxService extends SecretBox {
  constructor(config: ConfigService<AppConfig, true>) {
    super(
      secretsKey(
        config.get('newsroom', { infer: true }).secretsKey,
        config.get('jwt', { infer: true }).accessSecret,
      ),
    );
  }
}
