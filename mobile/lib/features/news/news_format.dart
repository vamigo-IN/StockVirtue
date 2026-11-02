/// Dates and times for news, always in India time (stories are dated in
/// IST whatever the phone's zone).
library;

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

DateTime _ist(DateTime at) =>
    at.toUtc().add(const Duration(hours: 5, minutes: 30));

/// "3:40 pm"
String istClock(DateTime at) {
  final t = _ist(at);
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final m = t.minute.toString().padLeft(2, '0');
  return '$h:$m ${t.hour < 12 ? 'am' : 'pm'}';
}

/// "2 Nov 2026"
String istDate(DateTime at) {
  final t = _ist(at);
  return '${t.day} ${_months[t.month - 1]} ${t.year}';
}

/// "2 Nov 2026, 3:40 pm IST"
String istDateTime(DateTime at) => '${istDate(at)}, ${istClock(at)} IST';

/// "just now", "5m ago", "3h ago", "2d ago", then the date.
String newsAgo(DateTime at, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(at);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return istDate(at);
}
