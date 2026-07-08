import 'dart:math' as math;

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

class _LoginScreenState extends ConsumerState<LoginScreen>
    with TickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _referral = TextEditingController();
  bool _isSignUp = false;
  bool _busy = false;
  bool _googleBusy = false;
  bool _obscure = true;
  String? _error;

  // One-shot staggered entrance; one looping controller for the live
  // background (drifting glow + oscillating candles).
  late final AnimationController _entrance;
  late final AnimationController _ambient;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1150),
    )..forward();
    _ambient = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    )..repeat();
  }

  @override
  void dispose() {
    _entrance.dispose();
    _ambient.dispose();
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

  /// Staggered fade + rise for the card's children, keyed by [index].
  Widget _reveal(int index, Widget child) {
    final start = (0.15 + index * 0.07).clamp(0.0, 0.75);
    final anim = CurvedAnimation(
      parent: _entrance,
      curve: Interval(start, (start + 0.45).clamp(0.0, 1.0),
          curve: Curves.easeOutCubic),
    );
    return AnimatedBuilder(
      animation: anim,
      builder: (_, c) => Opacity(
        opacity: anim.value.clamp(0.0, 1.0),
        child: Transform.translate(
          offset: Offset(0, (1 - anim.value) * 22),
          child: c,
        ),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final dark = theme.brightness == Brightness.dark;
    final busy = _busy || _googleBusy;
    final showPhone = ref.watch(authConfigProvider).maybeWhen(
          data: (c) => c.mobileOtpEnabled,
          orElse: () => false,
        );

    final fields = <Widget>[
      _Logo(entrance: _entrance, scheme: scheme),
      const SizedBox(height: 20),
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
      const SizedBox(height: 24),
      _GlassCard(
        dark: dark,
        scheme: scheme,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
              onSubmitted: (_) => busy || _isSignUp ? null : _submitEmail(),
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
            // Referral code — sign-up only; redeemed after the account is
            // created (carried through to the complete-profile step).
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
            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              child: _error == null
                  ? const SizedBox(width: double.infinity)
                  : Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: Container(
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
                    ),
            ),
            SizedBox(height: _isSignUp ? 20 : 12),
            _PrimaryButton(
              scheme: scheme,
              busy: _busy,
              label: _isSignUp ? 'Create account' : 'Sign in',
              onPressed: busy ? null : _submitEmail,
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
    ];

    return Scaffold(
      body: Stack(
        children: [
          // Live, drifting glow + candlestick backdrop.
          Positioned.fill(
            child: _AnimatedBackground(ambient: _ambient, scheme: scheme),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < fields.length; i++)
                        _reveal(i, fields[i]),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Logo tile with a soft primary glow and a gentle looping breathe.
class _Logo extends StatelessWidget {
  const _Logo({required this.entrance, required this.scheme});
  final AnimationController entrance;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final pop = CurvedAnimation(
      parent: entrance,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
    );
    return Center(
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.7, end: 1.0).animate(pop),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            boxShadow: [
              BoxShadow(
                color: scheme.primary.withValues(alpha: 0.35),
                blurRadius: 40,
                spreadRadius: -8,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: Image.asset(
              'assets/logo.png',
              width: 104,
              height: 104,
              filterQuality: FilterQuality.medium,
            ),
          ),
        ),
      ),
    );
  }
}

/// Translucent, softly-glowing card that floats the form above the backdrop.
class _GlassCard extends StatelessWidget {
  const _GlassCard({
    required this.child,
    required this.dark,
    required this.scheme,
  });
  final Widget child;
  final bool dark;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: dark ? 0.66 : 0.82),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: scheme.primary.withValues(alpha: dark ? 0.22 : 0.16),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? 0.4 : 0.08),
            blurRadius: 30,
            spreadRadius: -6,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// Filled primary CTA with a subtle brand gradient + glow.
class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.scheme,
    required this.busy,
    required this.label,
    required this.onPressed,
  });
  final ColorScheme scheme;
  final bool busy;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: onPressed == null
            ? null
            : LinearGradient(
                colors: [scheme.primary, scheme.tertiary],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
        boxShadow: onPressed == null
            ? null
            : [
                BoxShadow(
                  color: scheme.primary.withValues(alpha: 0.4),
                  blurRadius: 22,
                  spreadRadius: -6,
                  offset: const Offset(0, 8),
                ),
              ],
      ),
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor:
              onPressed == null ? null : Colors.transparent,
          foregroundColor: scheme.onPrimary,
          shadowColor: Colors.transparent,
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
          ),
        ),
        child: busy
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(label),
      ),
    );
  }
}

/// Full-screen animated backdrop: two drifting glow orbs over a soft gradient,
/// with a faint oscillating candlestick strip along the bottom — a quiet nod
/// to the live markets behind the sign-in.
class _AnimatedBackground extends StatelessWidget {
  const _AnimatedBackground({required this.ambient, required this.scheme});
  final AnimationController ambient;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ambient,
      builder: (context, _) {
        final t = ambient.value * 2 * math.pi;
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color.alphaBlend(
                  scheme.primary.withValues(alpha: 0.06),
                  scheme.surface,
                ),
                scheme.surface,
                Color.alphaBlend(
                  scheme.tertiary.withValues(alpha: 0.06),
                  scheme.surface,
                ),
              ],
            ),
          ),
          child: Stack(
            children: [
              _orb(
                align: Alignment(0.7 * math.sin(t), -0.75 + 0.12 * math.cos(t)),
                color: scheme.primary,
                size: 320,
              ),
              _orb(
                align:
                    Alignment(-0.7 * math.cos(t * 0.8), 0.5 + 0.15 * math.sin(t)),
                color: scheme.tertiary,
                size: 280,
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 150,
                child: CustomPaint(
                  painter: _CandlesPainter(
                    phase: t,
                    up: scheme.primary.withValues(alpha: 0.14),
                    down: scheme.tertiary.withValues(alpha: 0.12),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _orb({
    required Alignment align,
    required Color color,
    required double size,
  }) {
    return Align(
      alignment: align,
      child: IgnorePointer(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                color.withValues(alpha: 0.20),
                color.withValues(alpha: 0.0),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A subtle row of candlesticks whose heights breathe with [phase].
class _CandlesPainter extends CustomPainter {
  _CandlesPainter({required this.phase, required this.up, required this.down});
  final double phase;
  final Color up;
  final Color down;

  @override
  void paint(Canvas canvas, Size size) {
    const count = 16;
    final slot = size.width / count;
    final bodyW = slot * 0.38;
    for (var i = 0; i < count; i++) {
      final cx = slot * (i + 0.5);
      // Deterministic per-candle oscillation.
      final wave = math.sin(phase + i * 0.7);
      final wave2 = math.cos(phase * 0.6 + i * 1.3);
      final h = 26 + 34 * (0.5 + 0.5 * wave);
      final mid = size.height - 30 - 18 * (0.5 + 0.5 * wave2);
      final rising = wave >= 0;
      final paint = Paint()..color = rising ? up : down;
      final wickPaint = Paint()
        ..color = (rising ? up : down)
        ..strokeWidth = 1.4;
      // Wick.
      canvas.drawLine(
        Offset(cx, mid - h / 2 - 8),
        Offset(cx, mid + h / 2 + 8),
        wickPaint,
      );
      // Body.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset(cx, mid), width: bodyW, height: h),
          const Radius.circular(2),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_CandlesPainter old) => old.phase != phase;
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
