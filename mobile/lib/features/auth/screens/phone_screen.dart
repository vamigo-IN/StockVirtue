import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_controller.dart';
import 'otp_screen.dart';

/// Phone step of the auth flow: collects a number and kicks off Firebase Phone
/// verification, then pushes [OtpScreen] for the SMS code.
class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _normalize(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.startsWith('91') && digits.length == 12) return '+$digits';
    if (digits.length == 10) return '+91$digits';
    if (raw.startsWith('+')) return raw;
    return '+91$digits';
  }

  Future<void> _submit() async {
    final phone = _normalize(_controller.text.trim());
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final verificationId = await ref
          .read(authControllerProvider.notifier)
          .sendFirebaseOtp(phone);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              OtpScreen(phone: phone, firebaseVerificationId: verificationId),
        ),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in with phone')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              const Text('Enter your mobile number'),
              const SizedBox(height: 8),
              TextField(
                controller: _controller,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                  LengthLimitingTextInputFormatter(15),
                ],
                decoration: const InputDecoration(
                  prefixText: '+91 ',
                  hintText: '98765 43210',
                ),
                autofocus: true,
                onSubmitted: (_) => _busy ? null : _submit(),
              ),
              const SizedBox(height: 8),
              Text(
                "We'll send a one-time code by SMS.",
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Send OTP'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
