import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/market/market_repository.dart';

/// Single source of truth for "is the Indian equity market open right now?".
/// NSE & BSE equity trading: 09:15–15:30 IST, Mon–Fri, excluding the
/// holiday list (live-fetched from the backend; falls back to the
/// hand-curated list when the network is unavailable).
///
/// The pure timezone helpers stay synchronous so widgets can call them
/// directly. The dynamic holiday list overrides the static one via
/// [bindLiveHolidays] — call this once at app start (we wire it up in
/// `marketHoursLifecycleProvider` below) and from then on every
/// [marketState] / [isMarketOpen] call honours the latest fetch.

const _istOffset = Duration(hours: 5, minutes: 30);

DateTime istNow([DateTime? at]) {
  final t = at ?? DateTime.now();
  // Shift to the IST instant, then REBUILD as a local-flagged DateTime whose
  // field values ARE the IST wall-clock. Returning a UTC-flagged value here
  // would make marketState()/todayHoliday()/upcomingHoliday() — which re-test
  // `at.isUtc` and add the offset again — apply +5:30 a SECOND time (the
  // "market open before 09:15" bug). Do NOT collapse this back to a plain
  // `.add()` return.
  final u = t.isUtc ? t.add(_istOffset) : t.toUtc().add(_istOffset);
  return DateTime(
    u.year,
    u.month,
    u.day,
    u.hour,
    u.minute,
    u.second,
    u.millisecond,
    u.microsecond,
  );
}

enum MarketStateKind { open, preOpen, closed, holiday }

class MarketState {
  final MarketStateKind kind;
  final String label;
  const MarketState(this.kind, this.label);

  bool get isOpen => kind == MarketStateKind.open;
  bool get isPreOpen => kind == MarketStateKind.preOpen;
  bool get isActive => isOpen || isPreOpen;
}

/// Commodity exchanges (MCX/NCO) trade ~09:00–23:30 IST — much longer than
/// the equity session. Mirrors the backend `market-hours.ts` window.
bool _isCommodityExchange(String? exchange) =>
    exchange == 'MCX' || exchange == 'NCO';

MarketState marketState([DateTime? at, String? exchange]) {
  final ist = at == null ? istNow() : (at.isUtc ? at.add(_istOffset) : at);
  if (_isHoliday(ist)) {
    return const MarketState(MarketStateKind.holiday, 'CLOSED · HOLIDAY');
  }
  if (ist.weekday == DateTime.saturday || ist.weekday == DateTime.sunday) {
    return const MarketState(MarketStateKind.closed, 'CLOSED · WEEKEND');
  }
  final mins = ist.hour * 60 + ist.minute;
  if (_isCommodityExchange(exchange)) {
    const start = 9 * 60; // 09:00
    const end = 23 * 60 + 30; // 23:30
    if (mins >= start && mins < end) {
      return const MarketState(MarketStateKind.open, 'MARKET OPEN');
    }
    return const MarketState(MarketStateKind.closed, 'CLOSED');
  }
  const preOpenStart = 9 * 60;
  const openStart = 9 * 60 + 15;
  const openEnd = 15 * 60 + 30;
  if (mins >= openStart && mins < openEnd) {
    return const MarketState(MarketStateKind.open, 'MARKET OPEN');
  }
  if (mins >= preOpenStart && mins < openStart) {
    return const MarketState(MarketStateKind.preOpen, 'PRE-OPEN');
  }
  return const MarketState(MarketStateKind.closed, 'CLOSED');
}

bool isMarketOpen([DateTime? at, String? exchange]) =>
    marketState(at, exchange).isOpen;

bool isMarketActive([DateTime? at, String? exchange]) =>
    marketState(at, exchange).isActive;

class MarketHoliday {
  final DateTime date;
  final String name;
  const MarketHoliday(this.date, this.name);
}

bool _isHoliday(DateTime ist) {
  for (final h in holidaysFor(ist.year)) {
    if (h.date.year == ist.year &&
        h.date.month == ist.month &&
        h.date.day == ist.day) {
      return true;
    }
  }
  return false;
}

String? todayHoliday([DateTime? at]) {
  final ist = at == null ? istNow() : (at.isUtc ? at.add(_istOffset) : at);
  for (final h in holidaysFor(ist.year)) {
    if (h.date.year == ist.year &&
        h.date.month == ist.month &&
        h.date.day == ist.day) {
      return h.name;
    }
  }
  return null;
}

MarketHoliday? upcomingHoliday([DateTime? at]) {
  final ist = at == null ? istNow() : (at.isUtc ? at.add(_istOffset) : at);
  final today = DateTime(ist.year, ist.month, ist.day);
  for (final h in holidaysFor(ist.year)) {
    if (!h.date.isBefore(today)) return h;
  }
  return null;
}

/// Holiday list for the given year. Returns whichever has been bound
/// via [bindLiveHolidays] (post-startup fetch from /market/holidays) or
/// falls back to the curated baseline below.
List<MarketHoliday> holidaysFor(int year) {
  final live = _liveHolidays;
  if (live != null) {
    final filtered = live.where((h) => h.date.year == year).toList();
    if (filtered.isNotEmpty) return filtered;
  }
  if (year == 2026) return _holidays2026;
  if (year == 2025) return _holidays2025;
  return const [];
}

/// In-memory override for [holidaysFor] populated by the live fetch.
/// Null until the first successful /market/holidays response lands.
List<MarketHoliday>? _liveHolidays;

/// Called by [liveMarketHolidaysProvider] when the backend's holiday
/// payload arrives. Replaces the static list for every subsequent
/// market-hours check.
void bindLiveHolidays(List<MarketHoliday> list) {
  _liveHolidays = List.unmodifiable(list);
}

final _holidays2026 = <MarketHoliday>[
  MarketHoliday(DateTime(2026, 1, 26), 'Republic Day'),
  MarketHoliday(DateTime(2026, 2, 17), 'Maha Shivaratri'),
  MarketHoliday(DateTime(2026, 3, 3), 'Holi'),
  MarketHoliday(DateTime(2026, 3, 19), 'Eid-ul-Fitr (Ramadan Eid)'),
  MarketHoliday(DateTime(2026, 3, 27), 'Good Friday'),
  MarketHoliday(DateTime(2026, 4, 14), 'Dr. Ambedkar Jayanti'),
  MarketHoliday(DateTime(2026, 5, 1), 'Maharashtra Day'),
  MarketHoliday(DateTime(2026, 5, 27), 'Eid-ul-Adha (Bakri Eid)'),
  MarketHoliday(DateTime(2026, 6, 26), 'Muharram'),
  MarketHoliday(DateTime(2026, 8, 15), 'Independence Day'),
  MarketHoliday(DateTime(2026, 8, 27), 'Ganesh Chaturthi'),
  MarketHoliday(DateTime(2026, 10, 2), 'Mahatma Gandhi Jayanti'),
  MarketHoliday(DateTime(2026, 11, 9), 'Diwali (Laxmi Pujan)'),
  MarketHoliday(DateTime(2026, 11, 25), 'Guru Nanak Jayanti'),
  MarketHoliday(DateTime(2026, 12, 25), 'Christmas'),
];

final _holidays2025 = <MarketHoliday>[
  MarketHoliday(DateTime(2025, 2, 26), 'Maha Shivaratri'),
  MarketHoliday(DateTime(2025, 3, 14), 'Holi'),
  MarketHoliday(DateTime(2025, 3, 31), 'Eid-ul-Fitr'),
  MarketHoliday(DateTime(2025, 4, 10), 'Mahavir Jayanti'),
  MarketHoliday(DateTime(2025, 4, 14), 'Ambedkar Jayanti'),
  MarketHoliday(DateTime(2025, 4, 18), 'Good Friday'),
  MarketHoliday(DateTime(2025, 5, 1), 'Maharashtra Day'),
  MarketHoliday(DateTime(2025, 8, 15), 'Independence Day'),
  MarketHoliday(DateTime(2025, 8, 27), 'Ganesh Chaturthi'),
  MarketHoliday(DateTime(2025, 10, 2), 'Mahatma Gandhi Jayanti'),
  MarketHoliday(DateTime(2025, 10, 21), 'Diwali (Laxmi Pujan)'),
  MarketHoliday(DateTime(2025, 10, 22), 'Balipratipada'),
  MarketHoliday(DateTime(2025, 11, 5), 'Guru Nanak Jayanti'),
  MarketHoliday(DateTime(2025, 12, 25), 'Christmas'),
];

/// Pulls the trading-holiday calendar from the backend once per app
/// session and binds it via [bindLiveHolidays]. The payload's `source`
/// field exposes whether NSE's live API or the curated fallback was
/// used — surfaced on the market-status card as a "verified" badge.
final liveMarketHolidaysProvider =
    FutureProvider<MarketHolidaysPayload>((ref) async {
  final repo = ref.watch(marketRepositoryProvider);
  final payload = await repo.getHolidays();
  bindLiveHolidays([
    for (final h in payload.holidays)
      MarketHoliday(
        DateTime(h.date.year, h.date.month, h.date.day),
        h.name,
      ),
  ]);
  return payload;
});

/// Streams the live market state, ticking every 15 seconds. Cheap timer —
/// consumers should `.select((s) => s.isOpen)` so they only rebuild on the
/// open/closed transitions, not every tick.
final marketStateProvider = StreamProvider<MarketState>((ref) {
  final controller = StreamController<MarketState>();
  controller.add(marketState());
  final timer = Timer.periodic(const Duration(seconds: 15), (_) {
    if (!controller.isClosed) controller.add(marketState());
  });
  ref.onDispose(() {
    timer.cancel();
    controller.close();
  });
  return controller.stream;
});

/// Convenience: true while the regular session is live. Rebuilds only on
/// the open/closed flip thanks to the stream selector.
final marketOpenProvider = Provider<bool>((ref) {
  final state = ref.watch(marketStateProvider).value;
  return state?.isOpen ?? isMarketOpen();
});
