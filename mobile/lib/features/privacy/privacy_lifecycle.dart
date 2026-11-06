import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/navigation.dart';
import '../../core/notice_events.dart';
import '../../data/models/user.dart';
import '../auth/auth_controller.dart';

/// A resume reads the account's privacy status at most this often.
const kPrivacyResumeInterval = Duration(minutes: 10);

/// A `notice_required` answer reads it at most this often.
const kNoticeRequiredInterval = Duration(seconds: 5);

/// The clock the lifecycle reads; tests replace it.
final privacyClockProvider =
    Provider<DateTime Function()>((ref) => DateTime.now);

/// Keeps the privacy notice gate current while the app runs:
///  • on resume, re-reads the account's privacy status at most every 10
///    minutes while signed in, so a notice published while the app sat in
///    the background is asked for;
///  • on a 403 `notice_required` from any call (the app notice gate), reads
///    it at once, at most once per 5 s;
///  • when the account comes to need the notice while signed in, closes the
///    screens above the first route: the notice screen is the home route,
///    and a pushed screen would hide it. Screens opened from the notice
///    screen afterwards (Delete my account, a tapped story) stay open.
/// Watch once from the widget tree, like the socket and push providers.
final privacyLifecycleProvider = Provider<void>((ref) {
  final now = ref.read(privacyClockProvider);
  // When the status was last read: the cold start's /auth/me and every
  // sign-in count, since both carry it.
  DateTime? lastRead =
      ref.read(authControllerProvider).value == null ? null : now();
  DateTime? lastRefusal;
  var reading = false;

  bool signedIn() => ref.read(authControllerProvider).value != null;

  Future<void> read() async {
    if (reading) return;
    reading = true;
    lastRead = now();
    try {
      await ref.read(authControllerProvider.notifier).refreshPrivacy();
    } catch (_) {
      // Offline or refused: the next resume or refusal reads it again.
    } finally {
      reading = false;
    }
  }

  void onResume() {
    if (!signedIn()) return;
    final last = lastRead;
    if (last != null && now().difference(last) < kPrivacyResumeInterval) {
      return;
    }
    read();
  }

  void onNoticeRequired(NoticeRequired _) {
    if (!signedIn()) return;
    final at = now();
    final last = lastRefusal;
    if (last != null && at.difference(last) < kNoticeRequiredInterval) return;
    lastRefusal = at;
    read();
  }

  final lifecycle = AppLifecycleListener(onResume: onResume);
  final refusals = noticeRequiredEvents.listen(onNoticeRequired);
  ref.onDispose(() {
    lifecycle.dispose();
    refusals.cancel();
  });

  ref.listen<AsyncValue<AppUser?>>(authControllerProvider, (previous, next) {
    final before = previous?.value;
    final after = next.value;
    if (after == null) {
      lastRead = null;
      lastRefusal = null;
      return;
    }
    if (before == null || before.id != after.id) {
      // Signed in (or the cold start resolved): the status was just read.
      // The sign-in screens close themselves.
      lastRead = now();
      return;
    }
    if (!before.needsPrivacyNotice && after.needsPrivacyNotice) _revealGate();
  });
});

/// Pops every screen above the first route, where the notice screen now is.
void _revealGate() {
  void pop() => rootNavigatorKey.currentState?.popUntil((r) => r.isFirst);
  final binding = SchedulerBinding.instance;
  if (binding.schedulerPhase == SchedulerPhase.persistentCallbacks) {
    // Mid-build: pop once the frame is done.
    binding.addPostFrameCallback((_) => pop());
  } else {
    pop();
  }
}
