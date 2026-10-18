import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../../core/market_hours.dart';
import '../../../widgets/ui/market_widgets.dart';

/// Compact market-status row: NSE/BSE session state with a countdown, the
/// MCX evening session when commodities are trading after equities close,
/// and the holiday calendar one tap away. Equity trading runs 09:15–15:30
/// IST with a 09:00–09:15 pre-open auction. Minute-resolution countdowns
/// only need a slow refresh, so the row re-renders every 15 seconds.
class MarketStatusCard extends StatefulWidget {
  const MarketStatusCard({super.key});

  @override
  State<MarketStatusCard> createState() => _MarketStatusCardState();
}

class _MarketStatusCardState extends State<MarketStatusCard> {
  Timer? _ticker;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final ist = istNow(_now);
    final state = marketState(ist);
    final mcxOpen = isMarketOpen(ist, 'MCX');
    final color = switch (state.kind) {
      MarketStateKind.open => m.up,
      MarketStateKind.preOpen => m.warning,
      MarketStateKind.holiday => m.violet,
      MarketStateKind.closed => scheme.outline,
    };
    final title = switch (state.kind) {
      MarketStateKind.open => 'Market open',
      MarketStateKind.preOpen => 'Pre-open session',
      MarketStateKind.holiday => 'Market holiday',
      MarketStateKind.closed => 'Market closed',
    };
    // After 15:30 the equity session is shut but MCX trades till late.
    final mcxLine = !state.isOpen && mcxOpen
        ? 'MCX commodities open till '
            '${_clock12(commodityCloseMinutes(ist))}'
        : null;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
      child: AppCard(
        radius: AppRadius.md,
        padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
        child: Row(
          children: [
            _StatusDot(color: color, glow: state.isOpen),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: title,
                          style: TextStyle(color: state.isOpen ? color : null),
                        ),
                        TextSpan(
                          text: '  NSE · BSE',
                          style: t.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _nextEventFor(ist),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodySmall,
                  ),
                  if (mcxLine != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      mcxLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodySmall?.copyWith(
                        color: m.gold,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => _showHolidaysSheet(context),
              icon: const Icon(Icons.event_note_rounded, size: 18),
              label: const Text('Holidays'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.color, required this.glow});
  final Color color;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        shape: BoxShape.circle,
      ),
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          boxShadow: glow
              ? [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 8)]
              : null,
        ),
      ),
    );
  }
}

void _showHolidaysSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) {
      final ist = istNow();
      final all = holidaysFor(ist.year);
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        shrinkWrap: true,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Icon(Icons.event_busy, size: 20),
                const SizedBox(width: 8),
                Text(
                  'NSE & BSE holidays ${ist.year}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          for (final h in all)
            _HolidayRow(
              date: h.date,
              name: h.name,
              isPast: h.date.isBefore(DateTime(ist.year, ist.month, ist.day)),
            ),
          const SizedBox(height: 12),
          Text(
            'Source: BSE / NSE annual trading calendar. Schedule is subject '
            'to revision by the exchanges.',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(
                ctx,
              ).colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      );
    },
  );
}

class _HolidayRow extends StatelessWidget {
  const _HolidayRow({
    required this.date,
    required this.name,
    required this.isPast,
  });
  final DateTime date;
  final String name;
  final bool isPast;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 56,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  _monthShort(date.month),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
                Text(
                  '${date.day}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: isPast
                        ? scheme.onSurface.withValues(alpha: 0.4)
                        : scheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              style: TextStyle(
                fontWeight: isPast ? FontWeight.w400 : FontWeight.w600,
                color: isPast
                    ? scheme.onSurface.withValues(alpha: 0.55)
                    : scheme.onSurface,
              ),
            ),
          ),
          if (!isPast)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(
                _dayName(date.weekday),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: scheme.primary,
                  letterSpacing: 0.4,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Date utilities ──────────────────────────────────────────────────────

String _fmtDate(DateTime d) => '${d.day} ${_monthShort(d.month)}';

String _monthShort(int m) {
  const names = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return names[m - 1];
}

String _dayName(int weekday) {
  const names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return names[weekday - 1];
}

// ─── Market state ───────────────────────────────────────────────────────

/// "11:30 PM" for minutes after IST midnight.
String _clock12(int minutes) {
  final h24 = minutes ~/ 60;
  final h = h24 % 12 == 0 ? 12 : h24 % 12;
  final m = (minutes % 60).toString().padLeft(2, '0');
  return '$h:$m ${h24 >= 12 ? 'PM' : 'AM'}';
}

/// "2h 15m" / "7m" — rounded up, so the last minute reads "1m", not "0m".
String _countdown(int seconds) {
  final mins = (seconds / 60).ceil();
  final h = mins ~/ 60;
  final m = mins % 60;
  return h > 0 ? '${h}h ${m}m' : '${m}m';
}

/// One-line "what's next" for the status row.
String _nextEventFor(DateTime ist) {
  final state = marketState(ist);
  final nowSec = (ist.hour * 60 + ist.minute) * 60 + ist.second;
  switch (state.kind) {
    case MarketStateKind.open:
      return 'Closes in ${_countdown((15 * 60 + 30) * 60 - nowSec)} · '
          'at 3:30 PM';
    case MarketStateKind.preOpen:
      return 'Pre-open auction · trading starts in '
          '${_countdown((9 * 60 + 15) * 60 - nowSec)}';
    case MarketStateKind.holiday:
      final name = todayHoliday(ist);
      final next = _nextOpenLabel(ist);
      return name == null ? next : '$name · $next';
    case MarketStateKind.closed:
      return _nextOpenLabel(ist);
  }
}

String _nextOpenLabel(DateTime ist) {
  // Walk forward up to 10 days to find the next trading day at 09:15.
  for (var i = 0; i < 10; i++) {
    final target = DateTime(ist.year, ist.month, ist.day + i);
    if (target.weekday == DateTime.saturday ||
        target.weekday == DateTime.sunday) {
      continue;
    }
    if (marketState(target).kind == MarketStateKind.holiday) continue;
    // Same day but already past close → keep walking.
    if (i == 0) {
      final mins = ist.hour * 60 + ist.minute;
      if (mins >= 15 * 60 + 30) continue;
      if (mins < 9 * 60) return 'Opens today at 9:15 AM';
    }
    if (i == 0) return 'Opens today at 9:15 AM';
    if (i == 1) return 'Opens tomorrow at 9:15 AM';
    return 'Opens ${_fmtDate(target)} at 9:15 AM';
  }
  return 'Closed';
}
