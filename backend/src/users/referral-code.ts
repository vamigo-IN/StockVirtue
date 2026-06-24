/// FNV-1a 32-bit over the input bytes, formatted as "SV-XXXXXX" (first
/// six hex digits uppercased). The algorithm matches the client's
/// `referralCodeFor` helper and the SQL backfill in
/// `migrations/20260527_referrals/migration.sql` — codes shared via
/// either path map to the same user.
export function referralCodeFromUserId(userId: string): string {
  if (!userId) return 'SV-STOCKV';
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    // Force unsigned 32-bit by ANDing with 0xFFFFFFFF after every multiply.
    hash = (Math.imul(hash, 0x01000193)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, '0').toUpperCase();
  return `SV-${hex.slice(0, 6)}`;
}
