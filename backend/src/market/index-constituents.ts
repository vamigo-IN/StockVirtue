/// Hand-curated constituent lists for the major Indian indices the
/// app's home / F&O screens advertise. Symbols match the NSE / BSE
/// scrip-master `name` field so /market/quote resolves them directly.
///
/// We deliberately don't bundle weights here — index weights re-balance
/// quarterly and a stale weight is misleading. The mobile shows
/// constituents as a flat list with live LTP fetched via /market/quotes.
///
/// Last refreshed 2026-05 against NSE / BSE published constituent
/// snapshots. Keep this list lean: only indices that appear on the
/// home strip or the F&O landing need a constituents entry.
///
/// 2026-11: Tata Motors is TMPV (Tata Motors Passenger Vehicles) in the
/// Nifty 50 and Nifty Auto: NSE renamed TATAMOTORS on 24 Oct 2025
/// (circular NSE/FAOP/70882), and NSE Indices' lists of 5 Nov 2026 have it.

export interface IndexConstituent {
  symbol: string;
  name: string;
}

export interface IndexConstituentSet {
  /// Always quoted on NSE since these are equity constituents.
  exchange: 'NSE';
  members: IndexConstituent[];
}

/// Look up the constituents for an index. The key is the canonical
/// short name we use everywhere (`NIFTY`, `BANKNIFTY`, …); the
/// function normalises common alternate spellings (e.g. `NIFTY 50` →
/// `NIFTY`) so the caller doesn't have to.
export function constituentsFor(indexSymbol: string): IndexConstituentSet | null {
  const key = normaliseIndexKey(indexSymbol);
  return INDEX_CONSTITUENTS[key] ?? null;
}

export function hasConstituents(indexSymbol: string): boolean {
  return constituentsFor(indexSymbol) != null;
}

function normaliseIndexKey(raw: string): string {
  const up = raw.trim().toUpperCase().replace(/\s+/g, '');
  // Folks have called BSE Sensex by half a dozen different short forms;
  // unify them all here.
  switch (up) {
    case 'NIFTY50':
    case 'CNXNIFTY':
      return 'NIFTY';
    case 'NIFTYBANK':
      return 'BANKNIFTY';
    case 'NIFTYFINSERVICE':
    case 'NIFTYFINANCIALSERVICES':
      return 'FINNIFTY';
    case 'NIFTYMIDSELECT':
    case 'NIFTYMIDCAPSELECT':
      return 'MIDCPNIFTY';
    case 'BSESENSEX':
    case 'S&PBSESENSEX':
      return 'SENSEX';
    case 'BSEBANKEX':
    case 'S&PBSEBANKEX':
      return 'BANKEX';
    default:
      return up;
  }
}

const INDEX_CONSTITUENTS: Record<string, IndexConstituentSet> = {
  // ─── Nifty 50 (50 stocks) ─────────────────────────────────────────
  NIFTY: {
    exchange: 'NSE',
    members: [
      { symbol: 'RELIANCE', name: 'Reliance Industries' },
      { symbol: 'HDFCBANK', name: 'HDFC Bank' },
      { symbol: 'TCS', name: 'Tata Consultancy Services' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank' },
      { symbol: 'BHARTIARTL', name: 'Bharti Airtel' },
      { symbol: 'INFY', name: 'Infosys' },
      { symbol: 'SBIN', name: 'State Bank of India' },
      { symbol: 'HINDUNILVR', name: 'Hindustan Unilever' },
      { symbol: 'LT', name: 'Larsen & Toubro' },
      { symbol: 'ITC', name: 'ITC Ltd' },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
      { symbol: 'AXISBANK', name: 'Axis Bank' },
      { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
      { symbol: 'MARUTI', name: 'Maruti Suzuki' },
      { symbol: 'NTPC', name: 'NTPC Ltd' },
      { symbol: 'HCLTECH', name: 'HCL Technologies' },
      { symbol: 'M&M', name: 'Mahindra & Mahindra' },
      { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical' },
      { symbol: 'TITAN', name: 'Titan Company' },
      { symbol: 'ASIANPAINT', name: 'Asian Paints' },
      { symbol: 'POWERGRID', name: 'Power Grid Corporation' },
      { symbol: 'ULTRACEMCO', name: 'UltraTech Cement' },
      { symbol: 'WIPRO', name: 'Wipro' },
      { symbol: 'TMPV', name: 'Tata Motors Passenger Vehicles' },
      { symbol: 'ADANIENT', name: 'Adani Enterprises' },
      { symbol: 'JSWSTEEL', name: 'JSW Steel' },
      { symbol: 'NESTLEIND', name: 'Nestle India' },
      { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv' },
      { symbol: 'ONGC', name: 'Oil & Natural Gas' },
      { symbol: 'TATASTEEL', name: 'Tata Steel' },
      { symbol: 'TECHM', name: 'Tech Mahindra' },
      { symbol: 'HINDALCO', name: 'Hindalco Industries' },
      { symbol: 'COALINDIA', name: 'Coal India' },
      { symbol: 'GRASIM', name: 'Grasim Industries' },
      { symbol: 'CIPLA', name: 'Cipla' },
      { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
      { symbol: 'DRREDDY', name: "Dr Reddy's Laboratories" },
      { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto' },
      { symbol: 'EICHERMOT', name: 'Eicher Motors' },
      { symbol: 'BRITANNIA', name: 'Britannia Industries' },
      { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp' },
      { symbol: 'SHRIRAMFIN', name: 'Shriram Finance' },
      { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ' },
      { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals' },
      { symbol: 'DIVISLAB', name: "Divi's Laboratories" },
      { symbol: 'TATACONSUM', name: 'Tata Consumer Products' },
      { symbol: 'SBILIFE', name: 'SBI Life Insurance' },
      { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance' },
      { symbol: 'BPCL', name: 'Bharat Petroleum' },
      { symbol: 'TRENT', name: 'Trent Ltd' },
    ],
  },

  // ─── Nifty Bank (12 stocks) ───────────────────────────────────────
  BANKNIFTY: {
    exchange: 'NSE',
    members: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank' },
      { symbol: 'SBIN', name: 'State Bank of India' },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
      { symbol: 'AXISBANK', name: 'Axis Bank' },
      { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
      { symbol: 'BANKBARODA', name: 'Bank of Baroda' },
      { symbol: 'PNB', name: 'Punjab National Bank' },
      { symbol: 'FEDERALBNK', name: 'Federal Bank' },
      { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank' },
      { symbol: 'AUBANK', name: 'AU Small Finance Bank' },
      { symbol: 'BANDHANBNK', name: 'Bandhan Bank' },
    ],
  },

  // ─── Nifty Financial Services (20 stocks) ────────────────────────
  FINNIFTY: {
    exchange: 'NSE',
    members: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank' },
      { symbol: 'SBIN', name: 'State Bank of India' },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
      { symbol: 'AXISBANK', name: 'Axis Bank' },
      { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
      { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv' },
      { symbol: 'SBILIFE', name: 'SBI Life Insurance' },
      { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance' },
      { symbol: 'SHRIRAMFIN', name: 'Shriram Finance' },
      { symbol: 'CHOLAFIN', name: 'Cholamandalam Investment' },
      { symbol: 'HDFCAMC', name: 'HDFC AMC' },
      { symbol: 'ICICIPRULI', name: 'ICICI Prudential Life' },
      { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
      { symbol: 'ICICIGI', name: 'ICICI Lombard' },
      { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance' },
      { symbol: 'PFC', name: 'Power Finance Corporation' },
      { symbol: 'RECLTD', name: 'REC Ltd' },
      { symbol: 'LICHSGFIN', name: 'LIC Housing Finance' },
      { symbol: 'AUBANK', name: 'AU Small Finance Bank' },
    ],
  },

  // ─── Nifty IT (10 stocks) ─────────────────────────────────────────
  NIFTYIT: {
    exchange: 'NSE',
    members: [
      { symbol: 'TCS', name: 'Tata Consultancy Services' },
      { symbol: 'INFY', name: 'Infosys' },
      { symbol: 'HCLTECH', name: 'HCL Technologies' },
      { symbol: 'WIPRO', name: 'Wipro' },
      { symbol: 'TECHM', name: 'Tech Mahindra' },
      { symbol: 'LTIM', name: 'LTIMindtree' },
      { symbol: 'PERSISTENT', name: 'Persistent Systems' },
      { symbol: 'COFORGE', name: 'Coforge' },
      { symbol: 'MPHASIS', name: 'Mphasis' },
      { symbol: 'OFSS', name: 'Oracle Financial Services' },
    ],
  },

  // ─── Nifty Auto (15 stocks) ───────────────────────────────────────
  NIFTYAUTO: {
    exchange: 'NSE',
    members: [
      { symbol: 'MARUTI', name: 'Maruti Suzuki' },
      { symbol: 'M&M', name: 'Mahindra & Mahindra' },
      { symbol: 'TMPV', name: 'Tata Motors Passenger Vehicles' },
      { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto' },
      { symbol: 'EICHERMOT', name: 'Eicher Motors' },
      { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp' },
      { symbol: 'TVSMOTOR', name: 'TVS Motor' },
      { symbol: 'ASHOKLEY', name: 'Ashok Leyland' },
      { symbol: 'BHARATFORG', name: 'Bharat Forge' },
      { symbol: 'BOSCHLTD', name: 'Bosch Ltd' },
      { symbol: 'MOTHERSON', name: 'Samvardhana Motherson' },
      { symbol: 'BALKRISIND', name: 'Balkrishna Industries' },
      { symbol: 'MRF', name: 'MRF Ltd' },
      { symbol: 'APOLLOTYRE', name: 'Apollo Tyres' },
      { symbol: 'EXIDEIND', name: 'Exide Industries' },
    ],
  },

  // ─── Nifty Pharma (20 stocks) ─────────────────────────────────────
  NIFTYPHARMA: {
    exchange: 'NSE',
    members: [
      { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical' },
      { symbol: 'CIPLA', name: 'Cipla' },
      { symbol: 'DRREDDY', name: "Dr Reddy's Laboratories" },
      { symbol: 'DIVISLAB', name: "Divi's Laboratories" },
      { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals' },
      { symbol: 'LUPIN', name: 'Lupin' },
      { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma' },
      { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals' },
      { symbol: 'ZYDUSLIFE', name: 'Zydus Lifesciences' },
      { symbol: 'BIOCON', name: 'Biocon' },
      { symbol: 'GLENMARK', name: 'Glenmark Pharma' },
      { symbol: 'ALKEM', name: 'Alkem Laboratories' },
      { symbol: 'ABBOTINDIA', name: 'Abbott India' },
      { symbol: 'IPCALAB', name: 'Ipca Laboratories' },
      { symbol: 'JBCHEPHARM', name: 'JB Chemicals' },
    ],
  },

  // ─── BSE Sensex (30 stocks) ───────────────────────────────────────
  // Stale: TATAMOTORS no longer trades, and Tata Motors Passenger Vehicles
  // was reported dropped from the Sensex on 22 Dec 2025. Refresh this list
  // against BSE's published constituents; it is left as it was until then.
  SENSEX: {
    exchange: 'NSE',
    members: [
      { symbol: 'RELIANCE', name: 'Reliance Industries' },
      { symbol: 'HDFCBANK', name: 'HDFC Bank' },
      { symbol: 'TCS', name: 'Tata Consultancy Services' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank' },
      { symbol: 'BHARTIARTL', name: 'Bharti Airtel' },
      { symbol: 'INFY', name: 'Infosys' },
      { symbol: 'SBIN', name: 'State Bank of India' },
      { symbol: 'HINDUNILVR', name: 'Hindustan Unilever' },
      { symbol: 'LT', name: 'Larsen & Toubro' },
      { symbol: 'ITC', name: 'ITC Ltd' },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
      { symbol: 'AXISBANK', name: 'Axis Bank' },
      { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
      { symbol: 'MARUTI', name: 'Maruti Suzuki' },
      { symbol: 'NTPC', name: 'NTPC Ltd' },
      { symbol: 'HCLTECH', name: 'HCL Technologies' },
      { symbol: 'M&M', name: 'Mahindra & Mahindra' },
      { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical' },
      { symbol: 'TITAN', name: 'Titan Company' },
      { symbol: 'ASIANPAINT', name: 'Asian Paints' },
      { symbol: 'POWERGRID', name: 'Power Grid Corporation' },
      { symbol: 'ULTRACEMCO', name: 'UltraTech Cement' },
      { symbol: 'WIPRO', name: 'Wipro' },
      { symbol: 'TATAMOTORS', name: 'Tata Motors' },
      { symbol: 'JSWSTEEL', name: 'JSW Steel' },
      { symbol: 'NESTLEIND', name: 'Nestle India' },
      { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv' },
      { symbol: 'TATASTEEL', name: 'Tata Steel' },
      { symbol: 'TECHM', name: 'Tech Mahindra' },
      { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
    ],
  },

  // ─── BSE Bankex (10 stocks) ───────────────────────────────────────
  BANKEX: {
    exchange: 'NSE',
    members: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank' },
      { symbol: 'SBIN', name: 'State Bank of India' },
      { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
      { symbol: 'AXISBANK', name: 'Axis Bank' },
      { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
      { symbol: 'BANKBARODA', name: 'Bank of Baroda' },
      { symbol: 'PNB', name: 'Punjab National Bank' },
      { symbol: 'FEDERALBNK', name: 'Federal Bank' },
      { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank' },
    ],
  },

  // ─── Nifty Midcap Select (25 stocks) ─────────────────────────────
  MIDCPNIFTY: {
    exchange: 'NSE',
    members: [
      { symbol: 'TRENT', name: 'Trent Ltd' },
      { symbol: 'POLYCAB', name: 'Polycab India' },
      { symbol: 'GODREJPROP', name: 'Godrej Properties' },
      { symbol: 'CUMMINSIND', name: 'Cummins India' },
      { symbol: 'TIINDIA', name: 'Tube Investments' },
      { symbol: 'INDHOTEL', name: 'The Indian Hotels Company' },
      { symbol: 'PIIND', name: 'PI Industries' },
      { symbol: 'PERSISTENT', name: 'Persistent Systems' },
      { symbol: 'MAXHEALTH', name: 'Max Healthcare' },
      { symbol: 'PHOENIXLTD', name: 'Phoenix Mills' },
      { symbol: 'OBEROIRLTY', name: 'Oberoi Realty' },
      { symbol: 'COFORGE', name: 'Coforge' },
      { symbol: 'MPHASIS', name: 'Mphasis' },
      { symbol: 'LUPIN', name: 'Lupin' },
      { symbol: 'CONCOR', name: 'Container Corporation' },
      { symbol: 'PERSISTENT', name: 'Persistent Systems' },
      { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma' },
      { symbol: 'ASHOKLEY', name: 'Ashok Leyland' },
      { symbol: 'DIXON', name: 'Dixon Technologies' },
      { symbol: 'NMDC', name: 'NMDC Ltd' },
    ],
  },
};
