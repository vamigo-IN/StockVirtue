/// Symbol → sector map for the curated equity universe. Mirrors
/// mobile/lib/core/company_info.dart (the client's source of truth for the
/// "diversified" badges). Kept on the server so achievement evaluation is
/// authoritative rather than trusting a client computation. Unknown symbols
/// (anything not in this map) simply don't count toward sector diversity.
const COMPANY_SECTORS: Record<string, string> = {
  RELIANCE: 'Energy',
  ONGC: 'Energy',
  IOC: 'Energy',
  TCS: 'IT',
  INFY: 'IT',
  WIPRO: 'IT',
  HCLTECH: 'IT',
  TECHM: 'IT',
  HDFCBANK: 'Banking',
  ICICIBANK: 'Banking',
  SBIN: 'Banking',
  AXISBANK: 'Banking',
  KOTAKBANK: 'Banking',
  INDUSINDBK: 'Banking',
  HINDUNILVR: 'FMCG',
  ITC: 'FMCG',
  NESTLEIND: 'FMCG',
  BRITANNIA: 'FMCG',
  DABUR: 'FMCG',
  MARUTI: 'Auto',
  TATAMOTORS: 'Auto',
  'M&M': 'Auto',
  'BAJAJ-AUTO': 'Auto',
  EICHERMOT: 'Auto',
  HEROMOTOCO: 'Auto',
  SUNPHARMA: 'Pharma',
  DRREDDY: 'Pharma',
  CIPLA: 'Pharma',
  DIVISLAB: 'Pharma',
  BHARTIARTL: 'Telecom',
  LT: 'Capital Goods',
  ULTRACEMCO: 'Cement',
  GRASIM: 'Diversified',
  ADANIENT: 'Diversified',
  ASIANPAINT: 'Paints',
  BAJFINANCE: 'Finance',
  BAJAJFINSV: 'Finance',
  HDFCLIFE: 'Insurance',
  SBILIFE: 'Insurance',
  ADANIPORTS: 'Infrastructure',
  NTPC: 'Power',
  POWERGRID: 'Power',
  COALINDIA: 'Mining',
  TATASTEEL: 'Metals',
  JSWSTEEL: 'Metals',
  HINDALCO: 'Metals',
  TITAN: 'Consumer Discretionary',
  APOLLOHOSP: 'Healthcare',
  DMART: 'Retail',
};

export function sectorFor(symbol: string): string | null {
  return COMPANY_SECTORS[symbol.toUpperCase()] ?? null;
}

/// Count distinct sectors across a list of held symbols (unknowns ignored).
export function distinctSectorCount(symbols: string[]): number {
  const set = new Set<string>();
  for (const s of symbols) {
    const sector = sectorFor(s);
    if (sector) set.add(sector);
  }
  return set.size;
}
