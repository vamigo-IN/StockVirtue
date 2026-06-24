import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_controller.dart';

/// Mandatory profile completion for first-time users. Triggered by the
/// AuthGate when `user.profileComplete == false`. On save, the AuthController
/// refreshes `state` with the updated user — once `profileComplete` flips to
/// true the gate naturally advances to the next stage.
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
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-fill from any existing email captured during Firebase/Google login.
    final user = ref.read(authControllerProvider).value;
    if (user?.email != null) _emailC.text = user!.email!;
  }

  @override
  void dispose() {
    _nameC.dispose();
    _emailC.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .updateProfile(
            displayName: _nameC.text.trim(),
            email: _emailC.text.trim().isEmpty ? null : _emailC.text.trim(),
          );
      // The AuthGate listens to authControllerProvider; once profileComplete
      // flips to true it pushes the onboarding screen automatically.
    } on DioException catch (e) {
      final body = e.response?.data;
      String msg = e.message ?? 'Failed to save';
      if (body is Map) {
        final m = body['message'];
        if (m is String) msg = m;
        if (m is List && m.isNotEmpty) msg = m.first.toString();
      }
      setState(() => _error = msg);
    } catch (e) {
      setState(() => _error = '$e');
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
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 20),
                        Container(
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
                        const SizedBox(height: 18),
                        const Text(
                          "Let's set up your profile",
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'A name and email help us personalize your portfolio, '
                          'leaderboard and trade exports. You can change these later.',
                          style: TextStyle(
                            fontSize: 13.5,
                            color: scheme.onSurface.withValues(alpha: 0.65),
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 26),
                        _Label(text: 'Your name', required: true),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _nameC,
                          autofocus: true,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(
                            hintText: 'e.g. Asha Patel',
                            prefixIcon: Icon(Icons.person_outline),
                          ),
                          validator: (v) {
                            final t = (v ?? '').trim();
                            if (t.length < 2) {
                              return 'Enter at least 2 characters';
                            }
                            if (t.length > 60) return 'Too long';
                            return null;
                          },
                        ),
                        const SizedBox(height: 18),
                        const _Label(text: 'Email'),
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
                            if (t.isEmpty) return null;
                            final ok = RegExp(
                              r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                            ).hasMatch(t);
                            return ok ? null : 'Invalid email';
                          },
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.redAccent.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                color: Colors.redAccent,
                                fontSize: 12.5,
                              ),
                            ),
                          ),
                        ],
                        const Spacer(),
                        FilledButton(
                          onPressed: _saving ? null : _continue,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: _saving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text(
                                  'Continue',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
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
