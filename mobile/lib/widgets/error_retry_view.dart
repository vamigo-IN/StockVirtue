import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/error_mapper.dart';
import 'empty_state.dart';

/// Reusable, friendly error state with a Retry button — the standard thing to
/// render in an `AsyncValue.when(error:)` block instead of dumping the raw
/// exception (`Text('$e')`). Shows the code-free message from [friendlyError]
/// and a Retry action, which the caller wires to re-run the failed load
/// (typically `ref.invalidate(theProvider)`).
///
/// Use [compact] inside cards / carousels where the full centered layout would
/// be too tall.
///
/// For a "not found" (HTTP 404) the load can't succeed on retry — the thing
/// genuinely isn't there — so the primary action becomes "Go back" (pops the
/// route) instead of "Try again". [onBack] overrides that pop if the caller
/// needs different behaviour.
class ErrorRetryView extends StatelessWidget {
  const ErrorRetryView({
    super.key,
    required this.error,
    this.onRetry,
    this.onBack,
    this.errorContext,
    this.compact = false,
    this.retryLabel = 'Try again',
    this.backLabel = 'Go back',
  });

  final Object? error;

  /// Re-runs the failed load. Optional — omit for states (e.g. a 404) where a
  /// retry can't help; the widget then shows "Go back" instead.
  final VoidCallback? onRetry;

  /// Overrides the default "Go back" action (which pops the current route).
  final VoidCallback? onBack;

  /// Forwarded to [friendlyError] so the same status can read differently per
  /// screen (e.g. a 401 on login vs. elsewhere).
  final String? errorContext;
  final bool compact;
  final String retryLabel;
  final String backLabel;

  /// Network / timeout failures get a "connection" icon and are exactly the
  /// case a Retry button is most warranted for.
  bool get _isConnectivity {
    final e = error;
    if (e is DioException) {
      return e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError;
    }
    return false;
  }

  /// A 404 means the resource genuinely isn't there — retrying just re-fetches
  /// the same 404, so we offer "Go back" rather than "Try again".
  bool get _isNotFound {
    final e = error;
    return e is DioException && e.response?.statusCode == 404;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.6);
    final message = friendlyError(error, context: errorContext);
    final notFound = _isNotFound;
    final icon = notFound
        ? Icons.search_off_rounded
        : _isConnectivity
            ? Icons.wifi_off_rounded
            : Icons.error_outline_rounded;

    // For a not-found, "Go back" is the useful action; otherwise re-run the
    // load. Fall back to popping the route when no explicit handler is given.
    final VoidCallback? action = notFound
        ? (onBack ?? () => Navigator.of(context).maybePop())
        : onRetry;
    final actionIcon = notFound ? Icons.arrow_back_rounded : Icons.refresh;
    final actionLabel = notFound ? backLabel : retryLabel;

    if (compact) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 26, color: muted),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, fontSize: 12.5),
              ),
              if (action != null) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: action,
                  icon: Icon(actionIcon, size: 15),
                  label: Text(actionLabel),
                  style: OutlinedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }

    final tone = notFound
        ? scheme.onSurfaceVariant
        : _isConnectivity
            ? scheme.tertiary
            : scheme.error;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconDisc(icon: icon, color: tone),
            const SizedBox(height: 18),
            Text(
              notFound
                  ? 'Nothing here'
                  : _isConnectivity
                      ? 'You’re offline'
                      : 'Something didn’t load',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: muted),
            ),
            if (action != null) ...[
              const SizedBox(height: 22),
              FilledButton.icon(
                onPressed: action,
                icon: Icon(actionIcon, size: 18),
                label: Text(actionLabel),
              ),
            ],
          ],
        ),
      ).animate().fadeIn(duration: 250.ms),
    );
  }
}
