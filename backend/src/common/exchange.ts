export const EXCHANGES = [
  'NSE',
  'BSE',
  'NFO',
  'BFO',
  'MCX',
  'CDS',
  'NCO',
] as const;

export type Exchange = (typeof EXCHANGES)[number];

export function isExchange(value: string): value is Exchange {
  return (EXCHANGES as readonly string[]).includes(value);
}
