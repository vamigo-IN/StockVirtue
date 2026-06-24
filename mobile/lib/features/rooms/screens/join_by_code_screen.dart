import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/room.dart';
import '../rooms_repository.dart';

/// 6-character invite code entry. The owner of a private room shares the
/// code (`/rooms POST` returns it); anyone with the code can join via
/// this screen. The input is uppercase-monospaced and rejects anything
/// outside the 32-char unambiguous alphabet used by the backend.
class JoinByCodeScreen extends ConsumerStatefulWidget {
  const JoinByCodeScreen({super.key});

  @override
  ConsumerState<JoinByCodeScreen> createState() => _JoinByCodeScreenState();
}

class _JoinByCodeScreenState extends ConsumerState<JoinByCodeScreen> {
  final _codeC = TextEditingController();
  bool _joining = false;
  String? _error;

  @override
  void dispose() {
    _codeC.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final code = _codeC.text.trim().toUpperCase();
    if (code.length != 6) {
      setState(() => _error = 'Code must be exactly 6 characters');
      return;
    }
    setState(() {
      _joining = true;
      _error = null;
    });
    try {
      final joined = await ref.read(roomsRepositoryProvider).joinByCode(code);
      if (mounted) Navigator.of(context).pop<RoomSummary>(joined);
    } on DioException catch (e) {
      setState(() => _error = _extractError(e));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Join by code',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.qr_code_2,
                size: 56,
                color: scheme.primary.withValues(alpha: 0.7),
              ),
              const SizedBox(height: 12),
              const Text(
                'Enter the 6-character invite code',
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
              const SizedBox(height: 6),
              Text(
                'Ask the room owner — codes are case-insensitive but skip '
                'lookalike characters (no zero or capital I).',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _codeC,
                autofocus: true,
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.characters,
                maxLength: 6,
                inputFormatters: [
                  // Server's confusables-free alphabet (ABCDEFGHJKMNPQRSTUVWXYZ
                  // + 2-9) — excludes I, L, O and 0/1. Reject lookalikes before
                  // the user submits so a mistyped "L" doesn't 404.
                  FilteringTextInputFormatter.allow(
                    RegExp(r'[A-HJKMNP-Za-hjkmnp-z2-9]'),
                  ),
                  _UppercaseFormatter(),
                ],
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 12,
                ),
                decoration: const InputDecoration(
                  counterText: '',
                  hintText: 'ABCDEF',
                ),
                onSubmitted: (_) => _join(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.redAccent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.redAccent,
                      fontSize: 12.5,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _joining ? null : _join,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _joining
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(
                        'Join room',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UppercaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

String _extractError(DioException e) {
  final body = e.response?.data;
  if (body is Map) {
    final m = body['message'];
    if (m is String) return m;
    if (m is List && m.isNotEmpty) return m.first.toString();
  }
  return e.message ?? 'Failed to join room';
}
