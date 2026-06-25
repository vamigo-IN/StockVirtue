import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_controller.dart';
import '../auth_errors.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({
    super.key,
    required this.phone,
    required this.firebaseVerificationId,
  });

  final String phone;

  /// The verificationId returned by Firebase Phone Auth, paired with the
  /// user-entered SMS code in `verifyFirebaseOtp`.
  final String firebaseVerificationId;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _controller.text.trim();
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
          .verifyFirebaseOtp(widget.firebaseVerificationId, code);
      if (!mounted) return;
      // verifyFirebaseOtp wraps the work in AsyncValue.guard so failures land
      // on the state instead of throwing. Inspect the post-await state to
      // decide whether to surface an error or pop back to the AuthGate (which
      // has already rebuilt with the ShellScreen/Onboarding underneath us).
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
      // Defensive: anything escaping the guard (shouldn't happen, but…).
      if (mounted) setState(() => _error = friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify OTP')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Text('Enter the code sent by SMS to ${widget.phone}'),
              const SizedBox(height: 24),
              TextField(
                controller: _controller,
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
            ],
          ),
        ),
      ),
    );
  }
}
