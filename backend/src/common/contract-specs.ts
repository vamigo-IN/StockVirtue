// Real-world contract specifications for MCX commodity derivatives.
//
// Angel One's scrip master gives every MCX contract a `lotsize` expressed in
// the exchange's TRADING unit (GOLD = 1 kg, ZINC = 5 MT, GOLDM = 100 g …), but
// prices are QUOTED in a different unit (GOLD per 10 g, ZINC per kg, GOLDM per
// 10 g). Multiplying the quoted price by that raw lotsize therefore values a
// lot of GOLD at 1/100th of its real worth, ZINC at 1/1000th, and GOLDM at 10×
// — which is why commodity buying never matched the real market.
//
// The simulator fixes this by normalising every MCX quantity to QUOTATION
// units: one lot of GOLD is 100 units (100 × 10 g = 1 kg), one lot of ZINC is
// 5,000 units (kg). With quantity in quotation units, `price × quantity` is
// the true contract value everywhere — order cost, margin, P&L and portfolio
// valuation — without special-casing the order engine.
//
// Source: MCX contract specifications (trading unit / quotation basis).
// Margin rates approximate exchange SPAN + exposure margins and are
// deliberately rounded; they are a simulator's teaching values, not a quote.

export interface CommoditySpec {
  /** Display name, e.g. "Gold Mini". */
  label: string;
  /** Quotation units in one lot: contract value = price × unitsPerLot. */
  unitsPerLot: number;
  /** Physical size of one lot, e.g. "1 kg". */
  lotLabel: string;
  /** What the quoted price is per, e.g. "10 g". */
  quoteUnit: string;
  /** Initial margin as basis points of contract value. */
  marginBps: number;
  /** False for contracts whose lot can't be expressed in whole quotation units. */
  supported?: boolean;
}

const GOLD_BPS = 900;
const SILVER_BPS = 1100;
const CRUDE_BPS = 1500;
const NATGAS_BPS = 2500;
const BASE_METAL_BPS = 1000;
const AGRI_BPS = 1200;

export const MCX_SPECS: Readonly<Record<string, CommoditySpec>> = {
  // Bullion
  GOLD: {
    label: 'Gold',
    unitsPerLot: 100,
    lotLabel: '1 kg',
    quoteUnit: '10 g',
    marginBps: GOLD_BPS,
  },
  GOLDM: {
    label: 'Gold Mini',
    unitsPerLot: 10,
    lotLabel: '100 g',
    quoteUnit: '10 g',
    marginBps: GOLD_BPS,
  },
  GOLDTEN: {
    label: 'Gold Ten',
    unitsPerLot: 1,
    lotLabel: '10 g',
    quoteUnit: '10 g',
    marginBps: GOLD_BPS,
  },
  GOLDGUINEA: {
    label: 'Gold Guinea',
    unitsPerLot: 1,
    lotLabel: '8 g',
    quoteUnit: '8 g',
    marginBps: GOLD_BPS,
  },
  GOLDPETAL: {
    label: 'Gold Petal',
    unitsPerLot: 1,
    lotLabel: '1 g',
    quoteUnit: '1 g',
    marginBps: GOLD_BPS,
  },
  SILVER: {
    label: 'Silver',
    unitsPerLot: 30,
    lotLabel: '30 kg',
    quoteUnit: '1 kg',
    marginBps: SILVER_BPS,
  },
  SILVERM: {
    label: 'Silver Mini',
    unitsPerLot: 5,
    lotLabel: '5 kg',
    quoteUnit: '1 kg',
    marginBps: SILVER_BPS,
  },
  SILVERMIC: {
    label: 'Silver Micro',
    unitsPerLot: 1,
    lotLabel: '1 kg',
    quoteUnit: '1 kg',
    marginBps: SILVER_BPS,
  },
  // 100 g lot quoted per kg — a lot is 0.1 quotation units, which a whole-unit
  // quantity can't represent. Blocked rather than silently mis-valued.
  SILVER100: {
    label: 'Silver 100',
    unitsPerLot: 0,
    lotLabel: '100 g',
    quoteUnit: '1 kg',
    marginBps: SILVER_BPS,
    supported: false,
  },
  // Energy
  CRUDEOIL: {
    label: 'Crude Oil',
    unitsPerLot: 100,
    lotLabel: '100 bbl',
    quoteUnit: '1 bbl',
    marginBps: CRUDE_BPS,
  },
  CRUDEOILM: {
    label: 'Crude Oil Mini',
    unitsPerLot: 10,
    lotLabel: '10 bbl',
    quoteUnit: '1 bbl',
    marginBps: CRUDE_BPS,
  },
  NATURALGAS: {
    label: 'Natural Gas',
    unitsPerLot: 1250,
    lotLabel: '1,250 mmBtu',
    quoteUnit: '1 mmBtu',
    marginBps: NATGAS_BPS,
  },
  NATGASMINI: {
    label: 'Natural Gas Mini',
    unitsPerLot: 250,
    lotLabel: '250 mmBtu',
    quoteUnit: '1 mmBtu',
    marginBps: NATGAS_BPS,
  },
  ELECDMBL: {
    label: 'Electricity',
    unitsPerLot: 50,
    lotLabel: '50 MWh',
    quoteUnit: '1 MWh',
    marginBps: CRUDE_BPS,
  },
  // Base metals — traded in metric tonnes, quoted per kg
  COPPER: {
    label: 'Copper',
    unitsPerLot: 2500,
    lotLabel: '2.5 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  ZINC: {
    label: 'Zinc',
    unitsPerLot: 5000,
    lotLabel: '5 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  ZINCMINI: {
    label: 'Zinc Mini',
    unitsPerLot: 1000,
    lotLabel: '1 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  ALUMINIUM: {
    label: 'Aluminium',
    unitsPerLot: 5000,
    lotLabel: '5 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  ALUMINI: {
    label: 'Aluminium Mini',
    unitsPerLot: 1000,
    lotLabel: '1 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  LEAD: {
    label: 'Lead',
    unitsPerLot: 5000,
    lotLabel: '5 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  LEADMINI: {
    label: 'Lead Mini',
    unitsPerLot: 1000,
    lotLabel: '1 MT',
    quoteUnit: '1 kg',
    marginBps: BASE_METAL_BPS,
  },
  NICKEL: {
    label: 'Nickel',
    unitsPerLot: 250,
    lotLabel: '250 kg',
    quoteUnit: '1 kg',
    marginBps: 1200,
  },
  STEELREBAR: {
    label: 'Steel Rebar',
    unitsPerLot: 5,
    lotLabel: '5 MT',
    quoteUnit: '1 MT',
    marginBps: AGRI_BPS,
  },
  // Agri
  MENTHAOIL: {
    label: 'Mentha Oil',
    unitsPerLot: 360,
    lotLabel: '360 kg',
    quoteUnit: '1 kg',
    marginBps: AGRI_BPS,
  },
  CARDAMOM: {
    label: 'Cardamom',
    unitsPerLot: 100,
    lotLabel: '100 kg',
    quoteUnit: '1 kg',
    marginBps: AGRI_BPS,
  },
  COTTON: {
    label: 'Cotton',
    unitsPerLot: 25,
    lotLabel: '25 bales',
    quoteUnit: '1 bale',
    marginBps: AGRI_BPS,
  },
  COTTONOIL: {
    label: 'Cotton Seed Oil',
    unitsPerLot: 500,
    lotLabel: '5 MT',
    quoteUnit: '10 kg',
    marginBps: AGRI_BPS,
  },
  KAPAS: {
    label: 'Kapas',
    unitsPerLot: 200,
    lotLabel: '4 MT',
    quoteUnit: '20 kg',
    marginBps: AGRI_BPS,
  },
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
 * Lot size in QUOTATION units — the quantity step the simulator trades in.
 * Non-MCX instruments (and MCX contracts we have no spec for, whose lot is
 * already expressed in the quotation unit) keep the scrip-master lot size.
 */
export function normalizedLotSize(
  exchange: string,
  underlying: string,
  rawLotSize: number,
): number {
  const spec = commoditySpec(exchange, underlying);
  if (!spec || spec.supported === false || spec.unitsPerLot <= 0) {
    return rawLotSize;
  }
  return spec.unitsPerLot;
}

/** False when the simulator can't value this contract correctly. */
export function isContractSupported(
  exchange: string,
  underlying: string,
): boolean {
  return commoditySpec(exchange, underlying)?.supported !== false;
}
