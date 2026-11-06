-- The market-data attribution names the exchanges, not the data vendor
-- (owner, 6 Nov 2026): "NSE, BSE, MCX and NSE currency data via Angel One"
-- becomes "NSE, BSE, MCX and NSE currency data", the new default in
-- MarketConfigService. Data only, no schema change. Only the old default
-- text is rewritten, so an attribution an admin wrote in the portal is
-- kept; running it again changes nothing.
UPDATE "market_data_sources"
   SET "attribution" = 'NSE, BSE, MCX and NSE currency data',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "key" = 'angel-one'
   AND "attribution" = 'NSE, BSE, MCX and NSE currency data via Angel One';
