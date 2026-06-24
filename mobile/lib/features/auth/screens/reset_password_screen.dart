import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth_controller.dart';
import '../auth_errors.dart';

/// Step 2 of forgot-password: enter the emailed code + a new password. On
/// success the controller signs the user in and we pop to the AuthGate.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _resending = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.trim();
    final password = _password.text;
    if (code.length < 6) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    if (password.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .resetPassword(widget.email, code, password);
      if (!mounted) return;
      final result = ref.read(authControllerProvider);
      if (result.hasError) {
        setState(() => _error = friendlyAuthError(result.error));
      } else if (result.value != null) {
        Navigator.of(context).popUntil((route) => route.isFirst);
        return;
      } else {
        setState(() => _error = 'Reset failed. Please try again.');
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
          .requestPasswordReset(widget.email);
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
      appBar: AppBar(title: const Text('Set a new password')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ListView(
            children: [
              const SizedBox(height: 8),
              Text('Enter the code we emailed to ${widget.email} and choose a '
                  'new password.'),
              const SizedBox(height: 20),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(fontSize: 22, letterSpacing: 4),
                textAlign: TextAlign.center,
                decoration: const InputDecoration(
                  labelText: 'Code',
                  hintText: '••••••',
                ),
                autofocus: true,
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _password,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: 'New password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscure ? Icons.visibility_off : Icons.visibility,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                onSubmitted: (_) => _busy ? null : _submit(),
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
                    : const Text('Reset password & sign in'),
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
