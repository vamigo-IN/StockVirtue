// Curated equity universes per market-cap bucket. These power the home
// "Top movers" section. The classification is a snapshot — Indian indices
// reshuffle quarterly, so we keep the lists short and obviously-representative
// rather than chase the exact NSE Nifty 100 / Nifty Midcap 150 etc. memberships.
//
// Each list deliberately excludes derivatives so a single multi-quote call to
// the NSE segment returns the full picture.

export type CapSegment = 'largecap' | 'midcap' | 'smallcap';

const LARGECAP = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI',
  'HCLTECH', 'WIPRO', 'TITAN', 'ULTRACEMCO', 'NESTLEIND',
  'TATAMOTORS', 'SUNPHARMA', 'POWERGRID', 'NTPC', 'M&M',
  'ADANIENT', 'ADANIPORTS', 'BAJAJFINSV', 'JSWSTEEL', 'TATASTEEL',
  'COALINDIA', 'ONGC', 'HINDALCO', 'GRASIM', 'BRITANNIA',
  'TECHM', 'INDUSINDBK', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO',
  'DIVISLAB', 'APOLLOHOSP', 'HDFCLIFE', 'SBILIFE', 'CIPLA',
  'DRREDDY', 'DMART', 'LICI',
];

const MIDCAP = [
  'TVSMOTOR', 'ASHOKLEY', 'BHARATFORG', 'MOTHERSON', 'MFSL',
  'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD', 'DLF',
  'AUBANK', 'BANDHANBNK', 'FEDERALBNK', 'IDFCFIRSTB', 'INDIANB',
  'PERSISTENT', 'MPHASIS', 'COFORGE', 'LTIM', 'OFSS',
  'LUPIN', 'AUROPHARMA', 'TORNTPHARM', 'GLENMARK', 'BIOCON',
  'BALKRISIND', 'MRF', 'ABCAPITAL', 'CHOLAFIN', 'MUTHOOTFIN',
  'PETRONET', 'GAIL', 'IOC', 'BPCL', 'HINDPETRO',
  'PIIND', 'UPL', 'TATAPOWER', 'JUBLFOOD', 'TRENT',
  'CONCOR', 'INDIAMART', 'IDEA', 'YESBANK', 'PNB',
  'BANKBARODA', 'CANBK',
];

const SMALLCAP = [
  'SHRIRAMFIN', 'IRFC', 'RECLTD', 'PFC', 'NHPC',
  'NMDC', 'SAIL', 'NATIONALUM', 'JINDALSTEL', 'RAILTEL',
  'IRCON', 'RVNL', 'BEL', 'BEML', 'HAL',
  'BHEL', 'CONCOR', 'CESC', 'CASTROLIND', 'EXIDEIND',
  'CROMPTON', 'POLYCAB', 'HAVELLS', 'VOLTAS', 'BLUESTARCO',
  'WHIRLPOOL', 'AMBER', 'DIXON', 'KAJARIACER', 'CENTURYTEX',
  'INDHOTEL', 'CHALET', 'EIHOTEL', 'JUBLPHARMA', 'GRANULES',
  'LAURUSLABS', 'ALKEM', 'AJANTPHARM', 'IPCALAB', 'NATCOPHARM',
];

export const CAP_LISTS: Record<CapSegment, string[]> = {
  largecap: LARGECAP,
  midcap: MIDCAP,
  smallcap: SMALLCAP,
};
