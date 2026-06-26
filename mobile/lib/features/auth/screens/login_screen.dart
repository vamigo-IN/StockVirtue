import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_controller.dart';
import '../auth_errors.dart';
import '../auth_repository.dart';
import 'email_verify_screen.dart';
import 'forgot_password_screen.dart';
import 'phone_screen.dart';

/// Entry auth screen. Email/password is server-managed (with email-OTP
/// verification); Google and Phone go through Firebase. The phone option is
/// gated on the admin-controlled `mobileOtpEnabled` flag from /auth/config.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _referral = TextEditingController();
  bool _isSignUp = false;
  bool _busy = false;
  bool _googleBusy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _referral.dispose();
    super.dispose();
  }

  void _toVerify(String email) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EmailVerifyScreen(email: email)),
    );
  }

  Future<void> _submitEmail() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final controller = ref.read(authControllerProvider.notifier);
      if (_isSignUp) {
        // Stash any referral code now; it's redeemed at profile-completion
        // once the account exists and is authenticated.
        final code = _referral.text.trim().toUpperCase();
        controller.pendingReferralCode = code.isEmpty ? null : code;
        // Creates the account + emails an OTP; finish on the verify screen.
        await controller.registerWithEmail(email, password);
        if (!mounted) return;
        _toVerify(email);
      } else {
        final needsVerification =
            await controller.loginWithEmail(email, password);
        if (!mounted) return;
        if (needsVerification) {
          _toVerify(email);
        }
        // Otherwise we're signed in and the AuthGate routes us onward.
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _googleBusy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).signInWithGoogle();
      if (!mounted) return;
      final result = ref.read(authControllerProvider);
      if (result.hasError) {
        setState(() => _error = friendlyAuthError(result.error));
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  void _goToPhone() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const PhoneScreen()),
    );
  }

  void _goToForgotPassword() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final busy = _busy || _googleBusy;
    final showPhone = ref.watch(authConfigProvider).maybeWhen(
      data: (c) => c.mobileOtpEnabled,
      orElse: () => false,
    );
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: scheme.primary.withValues(alpha: 0.28),
                            blurRadius: 34,
                            spreadRadius: -10,
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(24),
                        child: Image.asset(
                          'assets/logo.png',
                          width: 96,
                          height: 96,
                          filterQuality: FilterQuality.medium,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'StockVirtue',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Trade Indian markets with ₹10,00,000 of virtual money.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                  const SizedBox(height: 26),
                  _ModeToggle(
                    isSignUp: _isSignUp,
                    onChanged: busy
                        ? null
                        : (v) => setState(() {
                            _isSignUp = v;
                            _error = null;
                          }),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    textInputAction: TextInputAction.next,
                    enabled: !busy,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.password],
                    textInputAction:
                        _isSignUp ? TextInputAction.next : TextInputAction.done,
                    enabled: !busy,
                    onSubmitted: (_) =>
                        busy || _isSignUp ? null : _submitEmail(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure ? Icons.visibility_off : Icons.visibility,
                        ),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                  ),
                  // Referral code — sign-up only; redeemed after the account
                  // is created (carried through to the complete-profile step).
                  if (_isSignUp) ...[
                    const SizedBox(height: 14),
                    TextField(
                      controller: _referral,
                      enabled: !busy,
                      textCapitalization: TextCapitalization.characters,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[A-Za-z0-9\-]'),
                        ),
                        _UpperCaseFormatter(),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Referral code (optional)',
                        hintText: 'SV-XXXXXX',
                        prefixIcon: Icon(Icons.card_giftcard_outlined),
                        helperText: 'Got a friend’s code? Add it for a bonus.',
                      ),
                    ),
                  ],
                  if (!_isSignUp)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: busy ? null : _goToForgotPassword,
                        child: const Text('Forgot password?'),
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
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
                  ],
                  SizedBox(height: _isSignUp ? 20 : 12),
                  FilledButton(
                    onPressed: busy ? null : _submitEmail,
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
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(_isSignUp ? 'Create account' : 'Sign in'),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          'or',
                          style: TextStyle(
                            color: scheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    icon: _googleBusy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.account_circle_outlined, size: 20),
                    label: const Text('Continue with Google'),
                    onPressed: busy ? null : _signInWithGoogle,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      side: BorderSide(
                        color: scheme.outlineVariant.withValues(alpha: 0.6),
                      ),
                      textStyle: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (showPhone) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.phone_outlined, size: 20),
                      label: const Text('Continue with phone number'),
                      onPressed: busy ? null : _goToPhone,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        side: BorderSide(
                          color: scheme.outlineVariant.withValues(alpha: 0.6),
                        ),
                        textStyle: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Segmented Sign in / Sign up switch. Two equal halves keep it within bounds
/// even at large text scales.
class _ModeToggle extends StatelessWidget {
  const _ModeToggle({required this.isSignUp, required this.onChanged});
  final bool isSignUp;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          _seg(context, 'Sign in', !isSignUp, () => onChanged?.call(false)),
          _seg(context, 'Sign up', isSignUp, () => onChanged?.call(true)),
        ],
      ),
    );
  }

  Widget _seg(
    BuildContext context,
    String label,
    bool selected,
    VoidCallback onTap,
  ) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: GestureDetector(
        onTap: onChanged == null ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? scheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: selected
                  ? scheme.onPrimary
                  : scheme.onSurface.withValues(alpha: 0.7),
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
