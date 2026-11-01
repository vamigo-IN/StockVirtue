/** "+919876543210" → "••••••••3210": enough to tell people apart. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}
