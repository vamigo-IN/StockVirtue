import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../notifications/notifications_provider.dart';
import '../lesson_definitions.dart';
import '../lesson_progress.dart';

/// Paged lesson reader. Each lesson is a stack of LessonCards; the user
/// swipes (or taps "Next") through Note + Example cards freely and must
/// answer Quiz cards correctly to advance. Lesson completion is recorded
/// once on the way out so a notification fires only the first time.
class LessonScreen extends ConsumerStatefulWidget {
  const LessonScreen({super.key, required this.lesson});
  final Lesson lesson;

  @override
  ConsumerState<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends ConsumerState<LessonScreen> {
  final _pageController = PageController();
  int _index = 0;
  // For quizzes — tracks which option the user selected on the current
  // quiz page. Resets on page-change.
  final Map<int, int> _quizSelections = {};

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Lesson get lesson => widget.lesson;

  bool get _isLast => _index == lesson.cards.length - 1;

  bool get _canAdvance {
    final card = lesson.cards[_index];
    if (card is! LessonQuiz) return true;
    final selected = _quizSelections[_index];
    return selected != null && selected == card.correctIndex;
  }

  Future<void> _next() async {
    if (_isLast) {
      await _complete();
      return;
    }
    _pageController.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  Future<void> _complete() async {
    final already =
        (ref.read(lessonProgressProvider).value ?? const {})
            .contains(lesson.id);
    // Tally the end-of-lesson quiz so the server can record the attempt and
    // award the "quiz ace" (perfect score) badge.
    var quizTotal = 0;
    var quizScore = 0;
    for (var i = 0; i < lesson.cards.length; i++) {
      final c = lesson.cards[i];
      if (c is LessonQuiz) {
        quizTotal++;
        if (_quizSelections[i] == c.correctIndex) quizScore++;
      }
    }
    // Always sync (records the quiz attempt + keeps server progress current);
    // the notifier de-dupes the local completed set.
    await ref.read(lessonProgressProvider.notifier).markCompleted(
          lesson.id,
          score: quizScore,
          total: quizTotal,
        );
    if (!already) {
      // Surface completion through the in-app notification log so the user
      // feels rewarded; server-side achievements hook off the same completion.
      ref.read(notificationsProvider.notifier).push(
            kind: AppNotificationKind.info,
            title: 'Lesson done — ${lesson.title}',
            body: 'Tap Academy in your profile to pick the next one.',
          );
    }
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final progress =
        lesson.cards.isEmpty ? 0.0 : (_index + 1) / lesson.cards.length;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          lesson.title,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 2,
            backgroundColor: scheme.onSurface.withValues(alpha: 0.08),
            valueColor: AlwaysStoppedAnimation<Color>(lesson.tint),
          ),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _index = i),
                itemCount: lesson.cards.length,
                itemBuilder: (_, i) {
                  final card = lesson.cards[i];
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                    child: switch (card) {
                      LessonNote() => _NoteCard(card: card),
                      LessonExample() => _ExampleCard(card: card),
                      LessonQuiz() => _QuizCard(
                          card: card,
                          selected: _quizSelections[i],
                          onSelect: (idx) =>
                              setState(() => _quizSelections[i] = idx),
                        ),
                    },
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Row(
                children: [
                  Text(
                    '${_index + 1} / ${lesson.cards.length}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _canAdvance ? _next : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: lesson.tint,
                      foregroundColor: Colors.black,
                      minimumSize: const Size(140, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _isLast ? 'Finish' : 'Next',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({required this.card});
  final LessonNote card;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Text(
          card.heading,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
            height: 1.2,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          card.body,
          style: TextStyle(
            fontSize: 15,
            height: 1.55,
            color: scheme.onSurface.withValues(alpha: 0.85),
          ),
        ),
      ],
    );
  }
}

class _ExampleCard extends StatelessWidget {
  const _ExampleCard({required this.card});
  final LessonExample card;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                card.tint.withValues(alpha: 0.3),
                card.tint.withValues(alpha: 0.08),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: card.tint.withValues(alpha: 0.35),
              width: 1.2,
            ),
          ),
          child: Icon(card.icon, color: card.tint, size: 28),
        ),
        const SizedBox(height: 18),
        Text(
          card.heading,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          card.body,
          style: TextStyle(
            fontSize: 14.5,
            height: 1.5,
            color: scheme.onSurface.withValues(alpha: 0.85),
          ),
        ),
      ],
    );
  }
}

class _QuizCard extends StatelessWidget {
  const _QuizCard({
    required this.card,
    required this.selected,
    required this.onSelect,
  });
  final LessonQuiz card;
  final int? selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text(
            'QUICK QUIZ',
            style: TextStyle(
              color: scheme.primary,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          card.question,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < card.options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _QuizOption(
              text: card.options[i],
              state: selected == null
                  ? _OptionState.idle
                  : i == card.correctIndex && selected == i
                      ? _OptionState.correct
                      : i == card.correctIndex && selected != i
                          ? _OptionState.revealed
                          : i == selected
                              ? _OptionState.wrong
                              : _OptionState.idle,
              onTap: selected == null ? () => onSelect(i) : null,
            ),
          ),
        if (selected != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: (selected == card.correctIndex
                      ? const Color(0xFF22C55E)
                      : const Color(0xFFEF4444))
                  .withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: (selected == card.correctIndex
                        ? const Color(0xFF22C55E)
                        : const Color(0xFFEF4444))
                    .withValues(alpha: 0.35),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  selected == card.correctIndex
                      ? Icons.check_circle_outline
                      : Icons.info_outline,
                  size: 16,
                  color: selected == card.correctIndex
                      ? const Color(0xFF22C55E)
                      : const Color(0xFFEF4444),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    card.explanation,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: scheme.onSurface.withValues(alpha: 0.8),
                      height: 1.45,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

enum _OptionState { idle, correct, wrong, revealed }

class _QuizOption extends StatelessWidget {
  const _QuizOption({
    required this.text,
    required this.state,
    required this.onTap,
  });
  final String text;
  final _OptionState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, border, fg, icon) = switch (state) {
      _OptionState.idle => (
          scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          scheme.outlineVariant.withValues(alpha: 0.4),
          scheme.onSurface,
          null,
        ),
      _OptionState.correct => (
          const Color(0xFF22C55E).withValues(alpha: 0.15),
          const Color(0xFF22C55E).withValues(alpha: 0.5),
          scheme.onSurface,
          Icons.check_circle,
        ),
      _OptionState.wrong => (
          const Color(0xFFEF4444).withValues(alpha: 0.15),
          const Color(0xFFEF4444).withValues(alpha: 0.5),
          scheme.onSurface,
          Icons.cancel,
        ),
      _OptionState.revealed => (
          const Color(0xFF22C55E).withValues(alpha: 0.08),
          const Color(0xFF22C55E).withValues(alpha: 0.35),
          scheme.onSurface,
          Icons.check_circle_outline,
        ),
    };
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                  height: 1.4,
                ),
              ),
            ),
            if (icon != null) ...[
              const SizedBox(width: 8),
              Icon(
                icon,
                size: 18,
                color: state == _OptionState.wrong
                    ? const Color(0xFFEF4444)
                    : const Color(0xFF22C55E),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
