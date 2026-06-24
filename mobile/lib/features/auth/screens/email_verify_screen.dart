import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_controller.dart';
import '../auth_errors.dart';

/// Email-OTP step for server email/password sign-up (and for logging into an
/// unverified account). Verifies the 6-digit code emailed by the backend.
class EmailVerifyScreen extends ConsumerStatefulWidget {
  const EmailVerifyScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<EmailVerifyScreen> createState() => _EmailVerifyScreenState();
}

class _EmailVerifyScreenState extends ConsumerState<EmailVerifyScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  bool _resending = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (code.length < 6) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .verifyEmailOtp(widget.email, code);
      if (!mounted) return;
      // verifyEmailOtp wraps the work in AsyncValue.guard; inspect the
      // post-await state to surface an error or pop to the AuthGate (which
      // has rebuilt with the next screen underneath us).
      final result = ref.read(authControllerProvider);
      if (result.hasError) {
        setState(() => _error = friendlyAuthError(result.error));
      } else if (result.value != null) {
        Navigator.of(context).popUntil((route) => route.isFirst);
        return;
      } else {
        setState(() => _error = 'Verification failed. Please try again.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .resendEmailOtp(widget.email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('A new code has been sent.')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your email')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Text('Enter the 6-digit code we emailed to ${widget.email}.'),
              const SizedBox(height: 24),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(fontSize: 24, letterSpacing: 4),
                textAlign: TextAlign.center,
                decoration: const InputDecoration(hintText: '••••••'),
                autofocus: true,
                onSubmitted: (_) => _busy ? null : _verify(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _busy ? null : _verify,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Verify & continue'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _resending ? null : _resend,
                child: Text(_resending ? 'Sending…' : "Didn't get it? Resend code"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
