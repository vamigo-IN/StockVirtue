import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error_mapper.dart';
import '../../auth/auth_controller.dart';
import '../privacy_repository.dart';
import '../widgets/consent_box.dart';
import 'delete_account_screen.dart';

/// Shown before anything else when the account hasn't accepted the current
/// privacy notice: accounts from before notices were recorded, or after the
/// notice changed (DPDP Act 2023 s.5: notice, and consent, before use). A
/// short version of the notice, the full one a tap away (English or Hindi),
/// the 18+ confirmation, and the optional analytics choice.
class PrivacyNoticeScreen extends ConsumerStatefulWidget {
  const PrivacyNoticeScreen({super.key});

  @override
  ConsumerState<PrivacyNoticeScreen> createState() =>
      _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends ConsumerState<PrivacyNoticeScreen> {
  bool _adult = false;
  bool _analytics = false;
  bool _busy = false;
  String? _error;

  Future<void> _accept() async {
    if (!_adult) {
      setState(
        () => _error = 'Tick the first box to confirm you are 18 or older.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .acceptPrivacyNotice(analytics: _analytics);
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.7);
    Widget point(IconData icon, String title, String body) => Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: scheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '$title ',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: body, style: TextStyle(color: muted)),
                    ],
                  ),
                  style: const TextStyle(fontSize: 13.5, height: 1.4),
                ),
              ),
            ],
          ),
        );
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            Icon(Icons.privacy_tip_outlined, size: 40, color: scheme.primary),
            const SizedBox(height: 12),
            Text(
              'Your privacy',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Before you carry on, here is what we do with your data, under '
              'India’s Digital Personal Data Protection Act, 2023.',
              style: TextStyle(color: muted, height: 1.4),
            ),
            const SizedBox(height: 20),
            point(
              Icons.person_outline,
              'Your account:',
              'your email, phone and name, to sign you in and keep your '
                  'account safe.',
            ),
            point(
              Icons.candlestick_chart_outlined,
              'Your practice trading:',
              'virtual wallet, orders, portfolio and watchlists. Virtual '
                  'money only; we never ask for bank, card, PAN or Aadhaar.',
            ),
            point(
              Icons.emoji_events_outlined,
              'Leaderboards and rooms:',
              'other traders see your display name and returns. Use a '
                  'nickname if you prefer.',
            ),
            point(
              Icons.shield_outlined,
              'Security:',
              'IP address and device details, kept a year as the law '
                  'requires.',
            ),
            point(
              Icons.tune,
              'Your rights:',
              'download your data, correct it, name a nominee, complain, or '
                  'delete your account any time from Profile → Privacy & your '
                  'data.',
            ),
            Wrap(
              spacing: 8,
              children: [
                TextButton.icon(
                  onPressed: () => openWebPage(context, privacyNoticeUrl),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Full privacy notice'),
                ),
                TextButton(
                  onPressed: () => openWebPage(context, privacyNoticeHindiUrl),
                  child: const Text('हिंदी में पढ़ें'),
                ),
              ],
            ),
            const Divider(height: 28),
            CheckboxListTile(
              value: _adult,
              onChanged: _busy ? null : (v) => setState(() => _adult = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'I am 18 or older, and I agree to the privacy notice and '
                'the terms of use.',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
              ),
            ),
            CheckboxListTile(
              value: _analytics,
              onChanged:
                  _busy ? null : (v) => setState(() => _analytics = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Optional: help improve the app by sharing which screens I '
                'use (Google Analytics for Firebase). Never my trades or my '
                'identity.',
                style: TextStyle(fontSize: 13),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _accept,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
              child: Text(_busy ? 'Saving…' : 'Agree and continue'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: _busy
                        ? null
                        : () => ref
                            .read(authControllerProvider.notifier)
                            .logout(),
                    child: const Text('Sign out'),
                  ),
                ),
                Expanded(
                  child: TextButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const DeleteAccountScreen(),
                              ),
                            ),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.redAccent,
                    ),
                    child: const Text('Delete my account'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
