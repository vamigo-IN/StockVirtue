// All money on the server is stored as BigInt paise (1 INR = 100 paise) to
// avoid floating-point drift. Conversions happen only at the API boundary.

export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

export function paiseToRupees(paise: bigint): number {
  // 2 decimals; safe for any realistic INR amount since Number can hold
  // integers exactly up to 2^53.
  return Number(paise) / 100;
}
