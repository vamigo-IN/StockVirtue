import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortfolioAnalyticsService } from './portfolio-analytics.service';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly analytics: PortfolioAnalyticsService,
  ) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.portfolio.getPortfolio(user.id);
  }

  /// Trailing equity snapshots. `days` controls the window — default 90
  /// is roughly one quarter of trading data, capped at ~5 years.
  @Get('history')
  history(
    @CurrentUser() user: User,
    @Query('days') daysRaw = '90',
  ) {
    const parsed = parseInt(daysRaw, 10);
    const days = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 1800)
      : 90;
    return this.portfolio.getHistory(user.id, days);
  }

  /// Per-symbol P&L breakdown — drives the "By symbol" tab on the
  /// mobile analytics screen.
  @Get('analytics/by-symbol')
  bySymbol(@CurrentUser() user: User) {
    return this.analytics.perSymbolPnL(user.id);
  }

  /// Sharpe / Sortino / Max DD / CAGR. Computed from the user's
  /// snapshot history — returns zeros + `points` < 30 when the user
  /// is too new for the math to be meaningful.
  @Get('analytics/risk')
  risk(@CurrentUser() user: User) {
    return this.analytics.riskMetrics(user.id);
  }

  /// Capital-gains report (FIFO, ST vs LT). Optional date window via
  /// ?from=YYYY-MM-DD&to=YYYY-MM-DD; both default to "all time".
  @Get('analytics/capital-gains')
  capitalGains(
    @CurrentUser() user: User,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
  ) {
    const from = parseIsoDate(fromRaw);
    const to = parseIsoDate(toRaw);
    return this.analytics.capitalGains(user.id, { from, to });
  }
}

function parseIsoDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
