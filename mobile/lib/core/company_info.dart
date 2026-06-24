/// Curated qualitative metadata for popular Indian equities — sector,
/// industry, HQ, founding year, and a short "About" blurb. These are facts
/// that change slowly (sector reclassifications, mergers) and never depend
/// on intraday market action, so they're safe to ship as static data.
///
/// We deliberately do **not** carry numeric fundamentals (P/E, market cap,
/// EPS, RoE, etc.) anymore — those age out the moment they're written down
/// and we have no live source for them. Real-time numbers users care about
/// (52w hi/lo, volume, OI, etc.) are surfaced from the SmartAPI snapshot in
/// [TradingInfoCard] instead.
library;

class CompanyInfo {
  final String sector;
  final String industry;
  final String hq;
  final int founded;
  final String about;

  const CompanyInfo({
    required this.sector,
    required this.industry,
    required this.hq,
    required this.founded,
    required this.about,
  });
}

/// Resolve a CompanyInfo for the given symbol (case-insensitive).
CompanyInfo? companyInfoFor(String symbol) =>
    _companyInfo[symbol.toUpperCase()];

/// Stocks in the same sector as [symbol], excluding [symbol] itself.
List<String> similarStocksFor(String symbol) {
  final me = companyInfoFor(symbol);
  if (me == null) return const [];
  final upper = symbol.toUpperCase();
  final out = <String>[];
  for (final e in _companyInfo.entries) {
    if (e.key == upper) continue;
    if (e.value.sector == me.sector) out.add(e.key);
  }
  return out;
}

const _companyInfo = <String, CompanyInfo>{
  'RELIANCE': CompanyInfo(
    sector: 'Energy',
    industry: 'Oil & Gas, Telecom, Retail',
    hq: 'Mumbai',
    founded: 1966,
    about:
        'Diversified conglomerate operating in petrochemicals, refining, '
        'oil & gas, retail, telecommunications (Jio), and digital services.',
  ),
  'TCS': CompanyInfo(
    sector: 'IT',
    industry: 'IT Services & Consulting',
    hq: 'Mumbai',
    founded: 1968,
    about:
        'India\'s largest IT services exporter — consulting, application '
        'services, business solutions and engineering services worldwide.',
  ),
  'HDFCBANK': CompanyInfo(
    sector: 'Banking',
    industry: 'Private Sector Bank',
    hq: 'Mumbai',
    founded: 1994,
    about:
        'India\'s largest private-sector bank by market cap. Retail and '
        'wholesale banking, plus the merged HDFC mortgage portfolio.',
  ),
  'INFY': CompanyInfo(
    sector: 'IT',
    industry: 'IT Services & Consulting',
    hq: 'Bengaluru',
    founded: 1981,
    about:
        'Global IT services major — digital, AI, cloud, enterprise services '
        'and ER&D. Pioneer of the Indian software export industry.',
  ),
  'ICICIBANK': CompanyInfo(
    sector: 'Banking',
    industry: 'Private Sector Bank',
    hq: 'Mumbai',
    founded: 1994,
    about:
        'Full-service private bank with retail, corporate, treasury and '
        'global subsidiaries in insurance, asset management and broking.',
  ),
  'SBIN': CompanyInfo(
    sector: 'Banking',
    industry: 'Public Sector Bank',
    hq: 'Mumbai',
    founded: 1955,
    about:
        'India\'s largest public-sector bank — vast branch network, '
        'flagship merchant of state-owned financial infrastructure.',
  ),
  'AXISBANK': CompanyInfo(
    sector: 'Banking',
    industry: 'Private Sector Bank',
    hq: 'Mumbai',
    founded: 1993,
    about:
        'Private-sector bank with a strong retail franchise, growing wealth '
        'management and merchant-acquisition businesses.',
  ),
  'KOTAKBANK': CompanyInfo(
    sector: 'Banking',
    industry: 'Private Sector Bank',
    hq: 'Mumbai',
    founded: 2003,
    about:
        'Conservative private bank known for asset quality. Group has '
        'major presence in insurance, asset management and broking.',
  ),
  'INDUSINDBK': CompanyInfo(
    sector: 'Banking',
    industry: 'Private Sector Bank',
    hq: 'Mumbai',
    founded: 1994,
    about:
        'Mid-sized private bank with strong vehicle-finance, microfinance '
        'and consumer-loan books.',
  ),
  'HINDUNILVR': CompanyInfo(
    sector: 'FMCG',
    industry: 'Personal Care & Home Care',
    hq: 'Mumbai',
    founded: 1933,
    about:
        'India\'s largest FMCG company. Soaps, shampoo, packaged foods, '
        'tea, and ice-cream brands like Surf Excel, Dove, Lipton, Brooke Bond.',
  ),
  'ITC': CompanyInfo(
    sector: 'FMCG',
    industry: 'Cigarettes, FMCG, Hotels, Paper',
    hq: 'Kolkata',
    founded: 1910,
    about:
        'Diversified group across cigarettes, packaged foods, personal '
        'care, hotels, paperboards, packaging and agribusiness.',
  ),
  'NESTLEIND': CompanyInfo(
    sector: 'FMCG',
    industry: 'Packaged Foods',
    hq: 'Gurugram',
    founded: 1959,
    about:
        'Indian subsidiary of Nestlé S.A. Maker of Maggi, Nescafé, KitKat, '
        'Munch, Cerelac and infant nutrition.',
  ),
  'BRITANNIA': CompanyInfo(
    sector: 'FMCG',
    industry: 'Bakery & Dairy',
    hq: 'Bengaluru',
    founded: 1892,
    about:
        'Leading biscuit-maker — Good Day, Marie Gold, Bourbon, NutriChoice '
        '— plus a fast-growing dairy and adjacencies portfolio.',
  ),
  'DABUR': CompanyInfo(
    sector: 'FMCG',
    industry: 'Ayurveda & Personal Care',
    hq: 'Ghaziabad',
    founded: 1884,
    about:
        'Ayurvedic and natural healthcare major — Dabur Chyawanprash, Real '
        'Juice, Honey, Hajmola, and Vatika.',
  ),
  'MARUTI': CompanyInfo(
    sector: 'Auto',
    industry: 'Passenger Vehicles',
    hq: 'New Delhi',
    founded: 1981,
    about:
        'India\'s largest passenger-car manufacturer — ~40% market share. '
        'Owned by Suzuki Motor Corporation, Japan.',
  ),
  'TATAMOTORS': CompanyInfo(
    sector: 'Auto',
    industry: 'Commercial & Passenger Vehicles',
    hq: 'Mumbai',
    founded: 1945,
    about:
        'Tata Group flagship in mobility. Commercial vehicles in India and '
        'global luxury via Jaguar Land Rover, plus an EV pivot.',
  ),
  'M&M': CompanyInfo(
    sector: 'Auto',
    industry: 'Utility Vehicles & Tractors',
    hq: 'Mumbai',
    founded: 1945,
    about:
        'Leading SUV and tractor manufacturer. Group holdings in IT '
        '(Tech Mahindra), finance, hospitality and renewables.',
  ),
  'BAJAJ-AUTO': CompanyInfo(
    sector: 'Auto',
    industry: 'Two- & Three-Wheelers',
    hq: 'Pune',
    founded: 1945,
    about:
        'Premium-segment motorcycle (KTM, Pulsar, Dominar) and three-'
        'wheeler exporter — strong African and Latin American footprint.',
  ),
  'EICHERMOT': CompanyInfo(
    sector: 'Auto',
    industry: 'Premium Motorcycles & CVs',
    hq: 'New Delhi',
    founded: 1948,
    about:
        'Maker of Royal Enfield motorcycles and 50% partner in Volvo '
        'Eicher Commercial Vehicles JV.',
  ),
  'HEROMOTOCO': CompanyInfo(
    sector: 'Auto',
    industry: 'Two-Wheelers',
    hq: 'New Delhi',
    founded: 1984,
    about:
        'World\'s largest two-wheeler maker by volume — mass-market '
        'commuter motorcycles and growing scooter portfolio.',
  ),
  'SUNPHARMA': CompanyInfo(
    sector: 'Pharma',
    industry: 'Pharmaceuticals',
    hq: 'Mumbai',
    founded: 1983,
    about:
        'India\'s largest pharma company by market cap. Strong US generics '
        'and growing specialty / branded portfolio.',
  ),
  'DRREDDY': CompanyInfo(
    sector: 'Pharma',
    industry: 'Pharmaceuticals',
    hq: 'Hyderabad',
    founded: 1984,
    about:
        'Global generics player with growing biosimilars and proprietary '
        'products business across the US, Europe and emerging markets.',
  ),
  'CIPLA': CompanyInfo(
    sector: 'Pharma',
    industry: 'Pharmaceuticals',
    hq: 'Mumbai',
    founded: 1935,
    about:
        'Respiratory franchise leader with strong India, South Africa and '
        'US generics businesses. Pioneer of low-cost HIV therapies.',
  ),
  'DIVISLAB': CompanyInfo(
    sector: 'Pharma',
    industry: 'Active Pharma Ingredients',
    hq: 'Hyderabad',
    founded: 1990,
    about:
        'Leading API and custom-synthesis manufacturer for global '
        'innovator pharma companies.',
  ),
  'WIPRO': CompanyInfo(
    sector: 'IT',
    industry: 'IT Services & Consulting',
    hq: 'Bengaluru',
    founded: 1945,
    about:
        'Indian IT services and consulting major, with a presence in cloud, '
        'cybersecurity and engineering services.',
  ),
  'HCLTECH': CompanyInfo(
    sector: 'IT',
    industry: 'IT Services & Products',
    hq: 'Noida',
    founded: 1976,
    about:
        'IT services and engineering with a distinct Products & Platforms '
        'arm, plus strong infrastructure-management business.',
  ),
  'TECHM': CompanyInfo(
    sector: 'IT',
    industry: 'IT Services & Telecom',
    hq: 'Pune',
    founded: 1986,
    about:
        'IT services major with deep telecom-vertical expertise, part of '
        'the Mahindra Group.',
  ),
  'BHARTIARTL': CompanyInfo(
    sector: 'Telecom',
    industry: 'Mobile, Broadband, Enterprise',
    hq: 'New Delhi',
    founded: 1995,
    about:
        'India\'s second-largest mobile operator. Operations across Africa '
        '(Airtel Africa) and enterprise / broadband businesses.',
  ),
  'LT': CompanyInfo(
    sector: 'Capital Goods',
    industry: 'Engineering & Construction',
    hq: 'Mumbai',
    founded: 1938,
    about:
        'India\'s largest engineering and construction company. Defence, '
        'shipbuilding, IT subsidiaries and heavy industrial businesses.',
  ),
  'ULTRACEMCO': CompanyInfo(
    sector: 'Cement',
    industry: 'Cement & Concrete',
    hq: 'Mumbai',
    founded: 1983,
    about:
        'India\'s largest cement maker — part of the Aditya Birla Group, '
        'with capacity over 140 MTPA.',
  ),
  'GRASIM': CompanyInfo(
    sector: 'Diversified',
    industry: 'VSF, Chemicals, Cement, Financial Services',
    hq: 'Mumbai',
    founded: 1947,
    about:
        'Aditya Birla flagship — viscose fibre, chemicals, cement '
        '(UltraTech), insulators, and paints (Birla Opus).',
  ),
  'ASIANPAINT': CompanyInfo(
    sector: 'Paints',
    industry: 'Decorative & Industrial Paints',
    hq: 'Mumbai',
    founded: 1942,
    about:
        'India\'s largest paint company, with ~50% decorative paint market '
        'share and growing home-decor adjacencies.',
  ),
  'BAJFINANCE': CompanyInfo(
    sector: 'Finance',
    industry: 'NBFC — Consumer Finance',
    hq: 'Pune',
    founded: 1987,
    about:
        'India\'s largest NBFC by market cap. Consumer durables, mortgage, '
        'SME and rural finance.',
  ),
  'BAJAJFINSV': CompanyInfo(
    sector: 'Finance',
    industry: 'Financial Holding Company',
    hq: 'Pune',
    founded: 2007,
    about:
        'Holding company for Bajaj Finance, Bajaj Allianz Life, and Bajaj '
        'Allianz General Insurance.',
  ),
  'HDFCLIFE': CompanyInfo(
    sector: 'Insurance',
    industry: 'Life Insurance',
    hq: 'Mumbai',
    founded: 2000,
    about:
        'Private life-insurance subsidiary of HDFC group — diversified '
        'product mix across protection, savings and annuity.',
  ),
  'SBILIFE': CompanyInfo(
    sector: 'Insurance',
    industry: 'Life Insurance',
    hq: 'Mumbai',
    founded: 2001,
    about:
        'JV between SBI and BNP Paribas Cardif. Largest private life '
        'insurer by new-business premium.',
  ),
  'ADANIENT': CompanyInfo(
    sector: 'Diversified',
    industry: 'Mining, Infrastructure, Solar',
    hq: 'Ahmedabad',
    founded: 1988,
    about:
        'Adani Group flagship — incubator for green hydrogen, airports, '
        'roads, data centers and copper.',
  ),
  'ADANIPORTS': CompanyInfo(
    sector: 'Infrastructure',
    industry: 'Ports & Logistics',
    hq: 'Ahmedabad',
    founded: 1998,
    about:
        'India\'s largest private port operator — Mundra, Hazira, Krishnapatnam '
        'and several minor ports. Integrated logistics platform.',
  ),
  'NTPC': CompanyInfo(
    sector: 'Power',
    industry: 'Thermal & Renewable Power',
    hq: 'New Delhi',
    founded: 1975,
    about:
        'India\'s largest power generation company, transitioning from '
        'thermal-dominant fleet to a sizeable renewables pipeline.',
  ),
  'POWERGRID': CompanyInfo(
    sector: 'Power',
    industry: 'Power Transmission',
    hq: 'Gurugram',
    founded: 1989,
    about:
        'Central transmission utility — owns ~85% of India\'s inter-state '
        'high-voltage transmission network.',
  ),
  'COALINDIA': CompanyInfo(
    sector: 'Mining',
    industry: 'Coal Mining',
    hq: 'Kolkata',
    founded: 1975,
    about:
        'World\'s largest coal-mining company by output. Government of '
        'India holds the controlling stake.',
  ),
  'ONGC': CompanyInfo(
    sector: 'Energy',
    industry: 'Oil & Gas Exploration',
    hq: 'New Delhi',
    founded: 1956,
    about:
        'India\'s largest crude-oil and natural-gas producer. Subsidiaries '
        'in refining (HPCL) and overseas E&P (OVL).',
  ),
  'IOC': CompanyInfo(
    sector: 'Energy',
    industry: 'Oil Refining & Marketing',
    hq: 'New Delhi',
    founded: 1959,
    about:
        'India\'s largest oil refiner and marketer — Indian Oil retail '
        'outlets, pipelines and petrochemicals.',
  ),
  'TATASTEEL': CompanyInfo(
    sector: 'Metals',
    industry: 'Steel',
    hq: 'Mumbai',
    founded: 1907,
    about:
        'Tata Group flagship — integrated steel operations in India, the '
        'Netherlands and the UK.',
  ),
  'JSWSTEEL': CompanyInfo(
    sector: 'Metals',
    industry: 'Steel',
    hq: 'Mumbai',
    founded: 1982,
    about:
        'India\'s second-largest steelmaker. Integrated operations and '
        'an aggressive capacity-expansion roadmap.',
  ),
  'HINDALCO': CompanyInfo(
    sector: 'Metals',
    industry: 'Aluminium & Copper',
    hq: 'Mumbai',
    founded: 1958,
    about:
        'Aditya Birla flagship in metals — domestic aluminium / copper '
        'operations plus Novelis, world\'s largest can-sheet maker.',
  ),
  'TITAN': CompanyInfo(
    sector: 'Consumer Discretionary',
    industry: 'Jewellery, Watches, Eyewear',
    hq: 'Bengaluru',
    founded: 1984,
    about:
        'Tata Group lifestyle major — Tanishq jewellery, Titan watches, '
        'Titan Eye+, Skinn fragrances.',
  ),
  'APOLLOHOSP': CompanyInfo(
    sector: 'Healthcare',
    industry: 'Hospitals & Pharmacies',
    hq: 'Chennai',
    founded: 1983,
    about:
        'India\'s largest private hospital chain with growing diagnostics '
        '(Apollo 24/7) and pharmacy operations.',
  ),
  'DMART': CompanyInfo(
    sector: 'Retail',
    industry: 'Hypermarket & Supermarket',
    hq: 'Mumbai',
    founded: 2002,
    about:
        'Operator of D-Mart value-retail stores — disciplined '
        'cost-leadership and EDLP (Every Day Low Price) model.',
  ),
};
