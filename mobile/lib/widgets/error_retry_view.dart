import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../core/error_mapper.dart';

/// Reusable, friendly error state with a Retry button — the standard thing to
/// render in an `AsyncValue.when(error:)` block instead of dumping the raw
/// exception (`Text('$e')`). Shows the code-free message from [friendlyError]
/// and a Retry action, which the caller wires to re-run the failed load
/// (typically `ref.invalidate(theProvider)`).
///
/// Use [compact] inside cards / carousels where the full centered layout would
/// be too tall.
class ErrorRetryView extends StatelessWidget {
  const ErrorRetryView({
    super.key,
    required this.error,
    required this.onRetry,
    this.errorContext,
    this.compact = false,
    this.retryLabel = 'Try again',
  });

  final Object? error;
  final VoidCallback onRetry;

  /// Forwarded to [friendlyError] so the same status can read differently per
  /// screen (e.g. a 401 on login vs. elsewhere).
  final String? errorContext;
  final bool compact;
  final String retryLabel;

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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.6);
    final message = friendlyError(error, context: errorContext);
    final icon =
        _isConnectivity ? Icons.wifi_off_rounded : Icons.error_outline_rounded;

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
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 15),
                label: Text(retryLabel),
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52, color: muted.withValues(alpha: 0.7)),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(color: muted, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: Text(retryLabel),
            ),
          ],
        ),
      ),
    );
  }
}
