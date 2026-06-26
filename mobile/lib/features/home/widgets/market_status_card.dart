import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/market_hours.dart';

/// Market hours / holidays card. NSE & BSE equity trading runs 09:15–15:30 IST
/// with a 09:00–09:15 pre-open auction. The card refreshes its open/closed
/// state on a 1-second timer so the countdown stays smooth.
class MarketStatusCard extends ConsumerStatefulWidget {
  const MarketStatusCard({super.key});

  @override
  ConsumerState<MarketStatusCard> createState() => _MarketStatusCardState();
}

class _MarketStatusCardState extends ConsumerState<MarketStatusCard> {
  Timer? _ticker;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
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
    final ist = istNow(_now);
    final state = marketState(ist);
    final nextEvent = _nextEventFor(ist);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          children: [
            Row(
              children: [
                _StatusDot(state: state),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              state.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: state.color,
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              '· NSE / BSE',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: scheme.onSurface.withValues(alpha: 0.55),
                              ),
                            ),
                          ),
                          // Tiny chip flagging where the holiday list
                          // came from. Green "LIVE" when we successfully
                          // pulled from NSE; amber "CACHED" when we
                          // fell back to the bundled list.
                          const SizedBox(width: 6),
                          const _HolidaySourceBadge(),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        nextEvent,
                        style: TextStyle(
                          color: scheme.onSurface.withValues(alpha: 0.65),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                _ClockChip(istNow: ist),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.2),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _MetaTile(
                    icon: Icons.schedule,
                    label: 'Hours',
                    value: '9:15 – 3:30 PM',
                    color: const Color(0xFF06B6D4),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: _HolidaysTile(istNow: ist)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Maps the pure-Dart [MarketStateKind] into the Material colours this
/// widget uses for the dot, label, and live-glow halo. Kept here so the
/// shared `market_hours.dart` stays free of Flutter imports.
extension _MarketStateColor on MarketState {
  Color get color => switch (kind) {
        MarketStateKind.open => const Color(0xFF22C55E),
        MarketStateKind.preOpen => const Color(0xFFF59E0B),
        MarketStateKind.holiday => const Color(0xFFEC4899),
        MarketStateKind.closed => const Color(0xFF94A3B8),
      };
}

/// Tiny chip that flags whether the holiday list backing the
/// market-status card came from NSE's live API or our curated
/// fallback. Useful in dev to confirm the live fetch is actually
/// reaching upstream; in prod it doubles as a "data verified" cue.
class _HolidaySourceBadge extends ConsumerWidget {
  const _HolidaySourceBadge();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(liveMarketHolidaysProvider);
    final payload = async.value;
    // While the fetch is in flight we render nothing — the parent row
    // already gives meaningful info; an empty chip would just be noise.
    if (payload == null) return const SizedBox.shrink();
    final isLive = payload.source == 'nse';
    final color = isLive ? const Color(0xFF22C55E) : const Color(0xFFF59E0B);
    final label = isLive ? 'LIVE' : 'CACHED';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 8.5,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.state});
  final MarketState state;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: state.color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          color: state.color,
          shape: BoxShape.circle,
          boxShadow: state.isOpen
              ? [
                  BoxShadow(
                    color: state.color.withValues(alpha: 0.6),
                    blurRadius: 8,
                  ),
                ]
              : null,
        ),
      ),
    );
  }
}

class _ClockChip extends StatelessWidget {
  const _ClockChip({required this.istNow});
  final DateTime istNow;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final h = istNow.hour % 12 == 0 ? 12 : istNow.hour % 12;
    final m = istNow.minute.toString().padLeft(2, '0');
    final s = istNow.second.toString().padLeft(2, '0');
    final ampm = istNow.hour >= 12 ? 'PM' : 'AM';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            '$h:$m:$s $ampm',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12,
              letterSpacing: 0.3,
            ),
          ),
          Text(
            'IST',
            style: TextStyle(
              fontSize: 9,
              color: scheme.onSurface.withValues(alpha: 0.55),
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaTile extends StatelessWidget {
  const _MetaTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Icon(icon, color: color, size: 14),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HolidaysTile extends StatelessWidget {
  const _HolidaysTile({required this.istNow});
  final DateTime istNow;

  @override
  Widget build(BuildContext context) {
    final upcoming = upcomingHoliday(istNow);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => _showHolidaysSheet(context),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFEC4899).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(7),
              ),
              child: const Icon(
                Icons.event_busy,
                color: Color(0xFFEC4899),
                size: 14,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Next holiday',
                    style: TextStyle(
                      fontSize: 10,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.55),
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.3,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    upcoming == null
                        ? 'All done for ${istNow.year}'
                        : '${_fmtDate(upcoming.date)} · ${upcoming.name}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right,
              size: 14,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
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

/// Human-readable countdown / next-open label for the [MarketState] row.
/// The status itself comes from [marketState]; this helper just turns the
/// kind into a sentence with a live-ticking countdown when applicable.
String _nextEventFor(DateTime ist) {
  final state = marketState(ist);

  switch (state.kind) {
    case MarketStateKind.open:
      final totalSeconds =
          ((15 * 60 + 30) * 60) -
          ((ist.hour * 60 + ist.minute) * 60 + ist.second);

      final h = totalSeconds ~/ 3600;
      final m = (totalSeconds % 3600) ~/ 60;
      final s = totalSeconds % 60;

      return 'Closes in '
          '${h > 0 ? '${h}h ' : ''}'
          '${m}m ${s}s';

    case MarketStateKind.preOpen:
      final totalSeconds =
          ((9 * 60 + 15) * 60) -
          ((ist.hour * 60 + ist.minute) * 60 + ist.second);

      final h = totalSeconds ~/ 3600;
      final m = (totalSeconds % 3600) ~/ 60;
      final s = totalSeconds % 60;

      return 'Regular session in '
          '${h > 0 ? '${h}h ' : ''}'
          '${m}m ${s}s';

    case MarketStateKind.holiday:
      return todayHoliday(ist) ?? 'Market holiday';

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
