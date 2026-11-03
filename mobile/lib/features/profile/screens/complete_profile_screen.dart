import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error_mapper.dart';
import '../../../core/money_format.dart';
import '../../auth/auth_controller.dart';
import '../../notifications/notifications_provider.dart';
import '../../referral/referrals_repository.dart';

/// Mandatory profile completion for first-time users. Triggered by the
/// AuthGate when `user.profileComplete == false`. We collect only the identity
/// fields the user's sign-in method DIDN'T already provide — so a phone-OTP
/// user is asked for name + email, a Google user just for a mobile number, an
/// email/password user for name + mobile. An optional referral code (carried
/// from the sign-up form or entered here) is redeemed on save.
class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  ConsumerState<CompleteProfileScreen> createState() =>
      _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameC = TextEditingController();
  final _emailC = TextEditingController();
  final _phoneC = TextEditingController();
  final _refC = TextEditingController();
  bool _saving = false;
  String? _error;

  late final bool _needName;
  late final bool _needEmail;
  late final bool _needPhone;
  late final bool _canRedeem;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).value;
    final name = user?.displayName?.trim() ?? '';
    final hasRealName =
        name.isNotEmpty && !RegExp(r'^Trader-[A-Z0-9]{4}$').hasMatch(name);
    _needName = !hasRealName;
    _needEmail = (user?.email ?? '').isEmpty;
    _needPhone = (user?.phone ?? '').isEmpty;
    // Hasn't redeemed anyone's code yet → offer the field.
    _canRedeem = user?.referredById == null;
    if (!_needName) _nameC.text = name;
    if (!_needEmail) _emailC.text = user!.email!;
    if (!_needPhone) _phoneC.text = user!.phone!;
    final pending = ref.read(authControllerProvider.notifier).pendingReferralCode;
    if (pending != null && pending.isNotEmpty) {
      _refC.text = pending.toUpperCase();
    }
  }

  @override
  void dispose() {
    _nameC.dispose();
    _emailC.dispose();
    _phoneC.dispose();
    _refC.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final controller = ref.read(authControllerProvider.notifier);
    final notifications = ref.read(notificationsProvider.notifier);
    try {
      // Redeem the referral FIRST (while this screen is still mounted) so its
      // result is visible — updateProfile below flips profileComplete and the
      // AuthGate immediately routes away from here.
      final code = _refC.text.trim().toUpperCase();
      if (_canRedeem && code.isNotEmpty) {
        try {
          final r = await ref.read(referralsRepositoryProvider).redeem(code);
          unawaited(
            notifications.push(
              kind: AppNotificationKind.info,
              title: 'Referral applied 🎉',
              body:
                  "You earned ${formatInr(r.bonusEarned)} from "
                  "${r.referrerName}'s invite.",
            ),
          );
        } catch (e) {
          // Non-blocking — surface the reason but still let them finish setup.
          unawaited(
            notifications.push(
              kind: AppNotificationKind.info,
              title: 'Referral code not applied',
              body: friendlyError(e, context: 'referral'),
            ),
          );
        }
      }
      await controller.updateProfile(
        displayName: _needName ? _nameC.text.trim() : null,
        email: _needEmail ? _emailC.text.trim() : null,
        phone: _needPhone ? _phoneC.text.trim() : null,
      );
      controller.pendingReferralCode = null;
      // AuthGate advances once profileComplete flips to true.
    } catch (e) {
      setState(() => _error = friendlyError(e, context: 'profile'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [scheme.primary, scheme.tertiary],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Icon(
                        Icons.person_add_alt,
                        color: scheme.onPrimary,
                        size: 28,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'Complete your profile',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Just a couple of details to set up your account. '
                    'You can update these later.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13.5,
                      color: scheme.onSurface.withValues(alpha: 0.65),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 26),
                  if (_needName) ...[
                    const _Label(text: 'Your name', required: true),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _nameC,
                      autofocus: true,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        hintText: 'e.g. Asha Patel',
                        prefixIcon: Icon(Icons.person_outline),
                        helperText: 'Other traders see it on leaderboards '
                            'and in rooms. A nickname is fine.',
                      ),
                      validator: (v) {
                        final t = (v ?? '').trim();
                        if (t.length < 2) return 'Enter at least 2 characters';
                        if (t.length > 60) return 'Too long';
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),
                  ],
                  if (_needEmail) ...[
                    const _Label(text: 'Email', required: true),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _emailC,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        hintText: 'name@example.com',
                        prefixIcon: Icon(Icons.mail_outline),
                      ),
                      validator: (v) {
                        final t = (v ?? '').trim();
                        if (t.isEmpty) return 'Email is required';
                        final ok = RegExp(
                          r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                        ).hasMatch(t);
                        return ok ? null : 'Invalid email';
                      },
                    ),
                    const SizedBox(height: 18),
                  ],
                  if (_needPhone) ...[
                    const _Label(text: 'Mobile number', required: true),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _phoneC,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s-]')),
                      ],
                      decoration: const InputDecoration(
                        hintText: '9876543210',
                        prefixIcon: Icon(Icons.phone_outlined),
                        prefixText: '+91 ',
                      ),
                      validator: (v) {
                        final digits = (v ?? '').replaceAll(RegExp(r'[^0-9]'), '');
                        if (digits.length < 10) {
                          return 'Enter a valid 10-digit mobile number';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),
                  ],
                  if (_canRedeem) ...[
                    const _Label(text: 'Referral code (optional)'),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _refC,
                      textCapitalization: TextCapitalization.characters,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[A-Za-z0-9\-]'),
                        ),
                        _UpperCaseFormatter(),
                      ],
                      decoration: const InputDecoration(
                        hintText: 'SV-XXXXXX',
                        prefixIcon: Icon(Icons.card_giftcard_outlined),
                        helperText: 'Have a friend’s code? Add it for a bonus.',
                      ),
                      validator: (v) {
                        final t = (v ?? '').trim().toUpperCase();
                        if (t.isEmpty) return null; // optional
                        return RegExp(r'^SV-[A-F0-9]{6}$').hasMatch(t)
                            ? null
                            : 'Format is SV- then 6 characters (A–F, 0–9)';
                      },
                    ),
                    const SizedBox(height: 18),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.redAccent.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.redAccent.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: Colors.redAccent,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                color: Colors.redAccent,
                                fontSize: 12.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _saving ? null : _continue,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(54),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Continue'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) => newValue.copyWith(text: newValue.text.toUpperCase());
}

class _Label extends StatelessWidget {
  const _Label({required this.text, this.required = false});
  final String text;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.2,
          ),
        ),
        if (required)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              '*',
              style: TextStyle(
                color: scheme.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}
