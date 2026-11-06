/**
 * Fact statuses that client modules need, kept apart from the fact table
 * (src/content/app.ts) so a client module can read one without shipping
 * the whole table to the browser. APP_FACTS takes these statuses from here,
 * so each one is still changed in one place.
 *
 * F20: the movers' tracked-list counts (components/market/copy.ts, read by
 * the client MoversBoard).
 */
export const F20_STATUS: 'confirmed' | 'verify' = 'confirmed';
