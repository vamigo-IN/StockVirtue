import { Module } from '@nestjs/common';
import { IpoModule } from '../ipo/ipo.module';
import { MarketModule } from '../market/market.module';
import { NewsroomModule } from '../newsroom/newsroom.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { StaffModule } from '../staff/staff.module';
import { TicksModule } from '../ticks/ticks.module';
import { InstrumentsService } from './instruments.service';
import { MarketCache } from './market-cache';
import { MarketClock } from './market-clock';
import { MarketConfigService } from './market-config.service';
import { MarketDataService } from './market-data.service';
import { MarketSnapshotService } from './market-snapshot.service';
import {
  MarketPublicController,
  MarketStaffController,
  WidgetPresetsController,
} from './market.controllers';
import { QuoteAllowlistService } from './quote-allowlist.service';
import { WidgetPresetsService } from './widget-presets.service';

/**
 * Market data for readers: the curated instruments, the data licence, the
 * site ticker, the public market API behind article widgets, and the saved
 * widget library. Uses the trading app's broker socket and scrip master —
 * no second login, no second socket — and lives in the API process only.
 */
@Module({
  imports: [
    StaffModule,
    NewsroomModule,
    MarketModule,
    TicksModule,
    SmartApiModule,
    IpoModule,
  ],
  controllers: [
    MarketPublicController,
    MarketStaffController,
    WidgetPresetsController,
  ],
  providers: [
    MarketClock,
    MarketCache,
    MarketConfigService,
    MarketSnapshotService,
    InstrumentsService,
    QuoteAllowlistService,
    MarketDataService,
    WidgetPresetsService,
  ],
})
export class MarketDisplayModule {}
