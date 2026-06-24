import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';
import '../auth/auth_controller.dart';
import 'learn_repository.dart';
import 'lesson_definitions.dart';

/// Per-device cache of which Academy lessons the user has finished, keyed PER
/// USER. Progress is server-authoritative (synced via /learn) so it follows the
/// account across devices; this cache is for offline display and is merged with
/// the server set on load. A lesson is either "completed" (all cards seen +
/// quizzes answered) or it isn't — we don't track per-card progress.
class LessonProgressStorage {
  LessonProgressStorage(this._storage);
  final FlutterSecureStorage _storage;

  String _keyFor(String userId) => 'stockvirtue.academy.completed.$userId';

  Future<Set<String>> read(String userId) async {
    final raw = await _storage.read(key: _keyFor(userId));
    if (raw == null || raw.isEmpty) return <String>{};
    try {
      final list = (jsonDecode(raw) as List).cast<String>();
      return list.toSet();
    } catch (_) {
      return <String>{};
    }
  }

  Future<void> write(String userId, Set<String> ids) async {
    await _storage.write(key: _keyFor(userId), value: jsonEncode(ids.toList()));
  }
}

final lessonProgressStorageProvider = Provider<LessonProgressStorage>((ref) {
  return LessonProgressStorage(appSecureStorage);
});

class LessonProgressNotifier extends AsyncNotifier<Set<String>> {
  String? _userId;

  @override
  Future<Set<String>> build() async {
    final userId = ref.watch(authControllerProvider).value?.id;
    _userId = userId;
    if (userId == null) return <String>{};
    final local = await ref.read(lessonProgressStorageProvider).read(userId);
    // Merge server truth (cross-device) with the local cache, so an offline
    // completion isn't lost before it syncs and a new device sees past progress.
    try {
      final server = await ref.read(learnRepositoryProvider).fetchCompleted();
      final merged = {...local, ...server};
      if (merged.length != local.length) unawaited(_persist(userId, merged));
      return merged;
    } catch (_) {
      return local;
    }
  }

  /// Marks a lesson complete locally and on the server. [score]/[total] record
  /// the end-of-lesson quiz result (powers the 'quiz ace' achievement). Safe to
  /// call again on a retake — the server records the new attempt.
  Future<void> markCompleted(String lessonId, {int? score, int? total}) async {
    final userId = _userId;
    final current = state.value ?? await future;
    if (!current.contains(lessonId)) {
      final next = {...current, lessonId};
      state = AsyncData(next);
      if (userId != null) unawaited(_persist(userId, next));
    }
    unawaited(_sync(lessonId, score, total));
  }

  Future<void> _sync(String lessonId, int? score, int? total) async {
    try {
      final serverSet = await ref
          .read(learnRepositoryProvider)
          .complete(lessonId, score: score, total: total);
      final userId = _userId;
      if (userId == null) return;
      final merged = {...(state.value ?? const <String>{}), ...serverSet};
      state = AsyncData(merged);
      await _persist(userId, merged);
    } catch (e) {
      // Offline / transient — local state already reflects the completion.
      debugPrint('Lesson completion sync failed: $e');
    }
  }

  Future<void> _persist(String userId, Set<String> ids) async {
    try {
      await ref.read(lessonProgressStorageProvider).write(userId, ids);
    } catch (e, st) {
      debugPrint('Lesson progress persist failed: $e\n$st');
    }
  }
}

final lessonProgressProvider =
    AsyncNotifierProvider<LessonProgressNotifier, Set<String>>(
  LessonProgressNotifier.new,
);

/// `(completed, total)` — drives the Profile tile + Academy header.
final lessonProgressSummaryProvider = Provider<(int, int)>((ref) {
  final done = ref.watch(lessonProgressProvider).value ?? const {};
  return (done.length, totalLessonCount);
});
