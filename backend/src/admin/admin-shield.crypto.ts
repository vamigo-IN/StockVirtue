import * as crypto from 'node:crypto';

/// Primitives for Admin Shield's two login factors.
///
/// Nothing in this file ever reaches the browser: the OTP transform and the
/// passcode derivation are server-only, and the login page is rendered
/// server-side, so the algorithms never appear in client JS or API responses.

// ─── Attempt caps + windows (Admin Shield spec §6, §10-§12) ─────────────────

/// Wrong-OTP and wrong-passcode budgets, per login session.
export const MAX_OTP_ATTEMPTS = 3;
export const MAX_PASSCODE_ATTEMPTS = 3;
/// Wrong-password budget before the login session is terminated (spec §10).
export const MAX_PASSWORD_ATTEMPTS = 5;
/// Progressive back-off after each wrong password, in milliseconds. The Nth
/// wrong attempt waits DELAYS[N-1]; exhausting the list terminates the session.
export const PASSWORD_DELAYS_MS = [2000, 5000, 10000, 20000] as const;
/// Cap on OTP re-sends per login session, so "resend" can't be used to spray
/// mail or to farm transformed/real OTP pairs for cryptanalysis of the key.
export const MAX_OTP_RESENDS = 3;
export const MAX_PASSCODE_RESENDS = 3;

/// Emergency protection (spec §25). A coordinated attack shows up as many
/// failed admin logins from MANY IPs at once — which per-IP throttles, by
/// construction, cannot see. These thresholds are global.
export const EMERGENCY_FAIL_THRESHOLD = 20;
export const EMERGENCY_WINDOW_SEC = 5 * 60;
/// How long new logins are refused once tripped. Deliberately short: this is a
/// circuit breaker, not a lockout, and it must not become a way for an attacker
/// to keep the operator out indefinitely by failing logins on purpose.
export const EMERGENCY_LOCK_SEC = 10 * 60;

/// Redis key namespaces. All Admin Shield counters live under one prefix so
/// they are trivially greppable and separately flushable from app data.
export const RK = {
  loginIp: (ip: string) => `admin:shield:login:ip:${ip}`,
  loginEmail: (email: string) => `admin:shield:login:email:${email}`,
  otpSend: (sid: string) => `admin:shield:otp:send:${sid}`,
  verifyIp: (ip: string) => `admin:shield:verify:ip:${ip}`,
  emergency: 'admin:shield:emergency',
  failWindow: 'admin:shield:failwindow',
} as const;

// ─── OTP ────────────────────────────────────────────────────────────────────

/// Six cryptographically-secure digits. `randomInt` is uniform over the range
/// (rejection-sampled internally), so no modulo bias.
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/// Transforms the REAL otp into the one that gets emailed: every digit is
/// stepped UP by one, with 9 wrapping to 0.
///
///   real 666666  ->  emailed 777777
///   real 190349  ->  emailed 201450
///
/// The admin reverses it mentally — step every digit DOWN by one (0 wraps back
/// to 9) — and types the REAL code. Only the transformed value is ever emailed;
/// the real OTP never leaves the server.
export function transformOtp(real: string): string {
  let out = '';
  for (const ch of real) out += ((Number(ch) + 1) % 10).toString();
  return out;
}

/// Inverse of [transformOtp] — the arithmetic the admin does in their head.
/// Not used by the login path (the server compares against the stored real
/// OTP); exported so the round-trip stays testable.
export function untransformOtp(emailed: string): string {
  let out = '';
  for (const ch of emailed) out += ((Number(ch) + 9) % 10).toString();
  return out;
}

// ─── Passcode ───────────────────────────────────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/// Passcodes are accepted within ±1 minute of the instant the login session
/// started. Without this, submitting at 15:40:59 while reading a clock that
/// has ticked to 15:41 would fail for no reason the operator can see.
export const PASSCODE_TOLERANCE_MINUTES = 1;

/// The time-derived passcode: `DD` + `hh` + `mm` in IST, where `hh` is the
/// 12-hour clock hour — i.e. 19 July, 3:40 pm IST → "190340", matching how
/// the operator reads it off a wall clock.
///
/// Derived from the UTC epoch and read back with getUTC* after a fixed shift,
/// so it is independent of the process TZ (main.ts pins TZ=Asia/Kolkata; a
/// local-time derivation would double-apply the offset).
///
/// SECURITY NOTE: this value is a function of the clock alone. Anyone who
/// knows the format can compute it, so it is a liveness/ordering gate — NOT a
/// secret and NOT a real second factor. The OTP (which requires mailbox access
/// *and* the transform key) is what actually gates this login.
export function derivePasscode(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const h24 = ist.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return pad2(ist.getUTCDate()) + pad2(h12) + pad2(ist.getUTCMinutes());
}

/// Every passcode acceptable for a session that started at [at] — the exact
/// minute plus the tolerance either side.
export function passcodeCandidates(at: Date): string[] {
  const out: string[] = [];
  for (
    let d = -PASSCODE_TOLERANCE_MINUTES;
    d <= PASSCODE_TOLERANCE_MINUTES;
    d++
  ) {
    out.push(derivePasscode(new Date(at.getTime() + d * 60_000)));
  }
  return Array.from(new Set(out));
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

// ─── Storage of single-use codes ────────────────────────────────────────────

/// Keyed digest of a short-lived code. A 6-digit code is trivially brute-
/// forced from a bare hash, so this is HMAC'd with a server-side secret: a
/// database leak alone cannot verify or recover a code. scrypt is deliberately
/// NOT used here — at 64 MB per call it would turn 3 verification attempts
/// into a memory-amplification lever on an unauthenticated endpoint.
export function hashCode(code: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

/// Constant-time comparison of a submitted code against its stored digest.
export function verifyCode(
  code: string,
  stored: string | null | undefined,
  secret: string,
): boolean {
  if (!stored) return false;
  const a = Buffer.from(hashCode(code, secret), 'hex');
  const b = Buffer.from(stored, 'hex');
  // timingSafeEqual throws on length mismatch; a malformed stored value must
  // fail closed rather than crash the request.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/// True when any candidate matches, in constant time per candidate.
export function verifyAnyCode(
  code: string,
  stored: string | null | undefined,
  secret: string,
  candidates: string[],
): boolean {
  let ok = false;
  for (const c of candidates) {
    // No early exit: keep the work independent of which candidate matched.
    if (verifyCode(c, stored, secret) && c === code) ok = true;
  }
  return ok;
}
