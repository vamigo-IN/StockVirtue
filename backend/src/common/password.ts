import {
  randomBytes,
  scrypt as scryptCb,
  ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

/// scrypt cost parameters. N=2^15 keeps us under ~100ms on a modest server
/// and well over what an attacker can brute-force a leak with. r/p are the
/// OWASP defaults for password storage. Shared by admin auth and user
/// email/password auth so there is one hashing scheme to reason about.
const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
// scrypt with our N/r/p exceeds the default `maxmem` cap (~32 MB). Bump it
// explicitly so the call doesn't ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scrypt(
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/// Encodes the salt + derived key in PHC-ish format so we can rotate
/// parameters later by reading them off the stored hash:
///   `scrypt$N=32768,r=8,p=1$<salt-b64>$<key-b64>`
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  const params = `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`;
  return `scrypt$${params}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/// Verifies a plaintext password against a stored hash. Uses timingSafeEqual
/// to avoid leaking match length via response time.
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const paramMap: Record<string, number> = {};
  for (const kv of parts[1].split(',')) {
    const [k, v] = kv.split('=');
    paramMap[k] = parseInt(v, 10);
  }
  const N = paramMap.N ?? SCRYPT_N;
  const r = paramMap.r ?? SCRYPT_R;
  const p = paramMap.p ?? SCRYPT_P;
  let salt: Buffer;
  let key: Buffer;
  try {
    salt = Buffer.from(parts[2], 'base64');
    key = Buffer.from(parts[3], 'base64');
  } catch {
    return false;
  }
  const derived = await scrypt(plain, salt, key.length, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });
  return key.length === derived.length && timingSafeEqual(key, derived);
}
