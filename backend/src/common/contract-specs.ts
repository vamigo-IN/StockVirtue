// Contract facts for MCX commodity futures, as the SIMULATOR trades them.
//
// On the exchange every MCX contract trades in lots — a GOLD lot is 1 kg while
// the price is quoted per 10 g, so one lot is worth ~₹1.6 crore. Against a
// ₹10 lakh virtual wallet that makes most commodities untradeable, so the
// simulator trades commodities like cash: ONE UNIT = THE QUOTED QUANTITY
// (1 unit of GOLD = 10 g, of CRUDEOIL = 1 barrel, of SILVER = 1 kg), any whole
// number of units, paid in full — no lots, no margin. Live prices, P&L and the
// contract's expiry settlement still follow the real MCX contract.
//
// Note: Angel One's scrip-master `lotsize` is the exchange TRADING unit
// (GOLD "1" = 1 kg, ZINC "5" = 5 MT), not the quote unit, so it must never be
// multiplied by the price. Quantity is always in quote units here.

export interface CommoditySpec {
  /** Display name, e.g. "Gold Mini". */
  label: string;
  /** What the quoted price — and therefore one unit — is, e.g. "10 g". */
  quoteUnit: string;
  /** The exchange's real lot size, shown for context only, e.g. "1 kg". */
  exchangeLot: string;
}

export const MCX_SPECS: Readonly<Record<string, CommoditySpec>> = {
  // Bullion
  GOLD: { label: 'Gold', quoteUnit: '10 g', exchangeLot: '1 kg' },
  GOLDM: { label: 'Gold Mini', quoteUnit: '10 g', exchangeLot: '100 g' },
  GOLDTEN: { label: 'Gold Ten', quoteUnit: '10 g', exchangeLot: '10 g' },
  GOLDGUINEA: { label: 'Gold Guinea', quoteUnit: '8 g', exchangeLot: '8 g' },
  GOLDPETAL: { label: 'Gold Petal', quoteUnit: '1 g', exchangeLot: '1 g' },
  SILVER: { label: 'Silver', quoteUnit: '1 kg', exchangeLot: '30 kg' },
  SILVERM: { label: 'Silver Mini', quoteUnit: '1 kg', exchangeLot: '5 kg' },
  SILVERMIC: { label: 'Silver Micro', quoteUnit: '1 kg', exchangeLot: '1 kg' },
  SILVER100: { label: 'Silver 100', quoteUnit: '1 kg', exchangeLot: '100 g' },
  // Energy
  CRUDEOIL: { label: 'Crude Oil', quoteUnit: '1 bbl', exchangeLot: '100 bbl' },
  CRUDEOILM: {
    label: 'Crude Oil Mini',
    quoteUnit: '1 bbl',
    exchangeLot: '10 bbl',
  },
  NATURALGAS: {
    label: 'Natural Gas',
    quoteUnit: '1 mmBtu',
    exchangeLot: '1,250 mmBtu',
  },
  NATGASMINI: {
    label: 'Natural Gas Mini',
    quoteUnit: '1 mmBtu',
    exchangeLot: '250 mmBtu',
  },
  ELECDMBL: { label: 'Electricity', quoteUnit: '1 MWh', exchangeLot: '50 MWh' },
  // Base metals — the exchange trades tonnes, quotes per kg
  COPPER: { label: 'Copper', quoteUnit: '1 kg', exchangeLot: '2.5 MT' },
  ZINC: { label: 'Zinc', quoteUnit: '1 kg', exchangeLot: '5 MT' },
  ZINCMINI: { label: 'Zinc Mini', quoteUnit: '1 kg', exchangeLot: '1 MT' },
  ALUMINIUM: { label: 'Aluminium', quoteUnit: '1 kg', exchangeLot: '5 MT' },
  ALUMINI: { label: 'Aluminium Mini', quoteUnit: '1 kg', exchangeLot: '1 MT' },
  LEAD: { label: 'Lead', quoteUnit: '1 kg', exchangeLot: '5 MT' },
  LEADMINI: { label: 'Lead Mini', quoteUnit: '1 kg', exchangeLot: '1 MT' },
  NICKEL: { label: 'Nickel', quoteUnit: '1 kg', exchangeLot: '250 kg' },
  STEELREBAR: { label: 'Steel Rebar', quoteUnit: '1 MT', exchangeLot: '5 MT' },
  // Agri
  MENTHAOIL: { label: 'Mentha Oil', quoteUnit: '1 kg', exchangeLot: '360 kg' },
  CARDAMOM: { label: 'Cardamom', quoteUnit: '1 kg', exchangeLot: '100 kg' },
  COTTON: { label: 'Cotton', quoteUnit: '1 bale', exchangeLot: '25 bales' },
  COTTONOIL: {
    label: 'Cotton Seed Oil',
    quoteUnit: '10 kg',
    exchangeLot: '5 MT',
  },
  KAPAS: { label: 'Kapas', quoteUnit: '20 kg', exchangeLot: '4 MT' },
};

export function isCommodityExchange(exchange: string): boolean {
  return exchange === 'MCX' || exchange === 'NCO';
}

/** Spec for an MCX underlying (by scrip-master `name`), if we have one. */
export function commoditySpec(
  exchange: string,
  underlying: string,
): CommoditySpec | null {
  if (exchange !== 'MCX') return null;
  return MCX_SPECS[underlying.toUpperCase()] ?? null;
}

/**
 * The quantity step the simulator trades in: a single quote unit for
 * commodities (no exchange lots — see the header), the scrip-master lot for
 * everything else (equity = 1, F&O = the contract lot).
 */
export function normalizedLotSize(
  exchange: string,
  _underlying: string,
  rawLotSize: number,
): number {
  return isCommodityExchange(exchange) ? 1 : rawLotSize;
}
