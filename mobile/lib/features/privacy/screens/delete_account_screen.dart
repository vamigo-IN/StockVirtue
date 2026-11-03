import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error_mapper.dart';
import '../../auth/auth_controller.dart';

/// Deleting the account (the right to erasure, DPDP Act 2023 s.12): what
/// happens, then the word DELETE to confirm. Signs out of this phone and
/// clears it afterwards.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _confirm = TextEditingController();
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _confirm.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .deleteAccount(reason: _reason.text);
      navigator.popUntil((route) => route.isFirst);
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Your account is deleted. We emailed you the details.',
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = friendlyError(e);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.7);
    Widget bullet(String text) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Icon(Icons.circle, size: 6),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(text, style: TextStyle(color: muted, height: 1.4)),
              ),
            ],
          ),
        );
    final typed = _confirm.text.trim() == 'DELETE';
    return Scaffold(
      appBar: AppBar(title: const Text('Delete my account')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            'What happens',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          bullet(
            'Your account closes at once. You are signed out on every device '
            'and your name, email and phone are no longer used or shown, on '
            'leaderboards, in rooms or anywhere else.',
          ),
          bullet(
            'Your virtual wallet, portfolio, badges, saved stories and '
            'everything else in the account go with it.',
          ),
          bullet(
            'The law asks us to keep a locked copy of the account and its '
            'records for one year, only for security incidents or legal '
            'requests. Then it is erased for good.',
          ),
          bullet(
            'You can sign up again with the same email or number, and start '
            'afresh.',
          ),
          bullet(
            'Want a copy first? Go back and use “Download my data”.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            enabled: !_busy,
            maxLength: 1000,
            maxLines: 3,
            minLines: 1,
            decoration: const InputDecoration(
              labelText: 'Why are you leaving? (optional)',
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _confirm,
            enabled: !_busy,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Type DELETE to confirm',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy || !typed ? null : _delete,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.redAccent,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(50),
            ),
            child: Text(_busy ? 'Deleting…' : 'Delete my account'),
          ),
        ],
      ),
    );
  }
}
