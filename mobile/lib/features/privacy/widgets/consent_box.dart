import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../privacy_repository.dart';

/// Opens a page of the website (the privacy notice, the terms) in the
/// in-app browser.
Future<void> openWebPage(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  final ok = await launchUrl(
    Uri.parse(url),
    mode: LaunchMode.inAppBrowserView,
  );
  if (!ok) {
    messenger.showSnackBar(
      const SnackBar(content: Text("Couldn't open the page.")),
    );
  }
}

/// "I'm 18 or older and I agree to the Privacy notice and Terms of use",
/// with both linked. Unticked by default: consent is something the person
/// does, never something we assume.
class ConsentBox extends StatefulWidget {
  const ConsentBox({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.highlight = false,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final bool enabled;

  /// Draws attention to the box (they tried to continue without ticking it).
  final bool highlight;

  @override
  State<ConsentBox> createState() => _ConsentBoxState();
}

class _ConsentBoxState extends State<ConsentBox> {
  late final TapGestureRecognizer _notice;
  late final TapGestureRecognizer _hindi;
  late final TapGestureRecognizer _terms;

  @override
  void initState() {
    super.initState();
    _notice = TapGestureRecognizer()
      ..onTap = () => openWebPage(context, privacyNoticeUrl);
    _hindi = TapGestureRecognizer()
      ..onTap = () => openWebPage(context, privacyNoticeHindiUrl);
    _terms = TapGestureRecognizer()
      ..onTap = () => openWebPage(context, termsUrl);
  }

  @override
  void dispose() {
    _notice.dispose();
    _hindi.dispose();
    _terms.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final link = TextStyle(
      color: scheme.primary,
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
    );
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: widget.highlight
              ? Colors.redAccent.withValues(alpha: 0.6)
              : Colors.transparent,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(
            value: widget.value,
            onChanged: widget.enabled
                ? (v) => widget.onChanged(v ?? false)
                : null,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 12, right: 4),
              child: GestureDetector(
                onTap: widget.enabled
                    ? () => widget.onChanged(!widget.value)
                    : null,
                child: Text.rich(
                  TextSpan(
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.4,
                      color: scheme.onSurface.withValues(alpha: 0.75),
                    ),
                    children: [
                      const TextSpan(
                        text: 'I am 18 or older, and I agree to the ',
                      ),
                      TextSpan(
                        text: 'Privacy notice',
                        style: link,
                        recognizer: _notice,
                      ),
                      const TextSpan(text: ' ('),
                      TextSpan(text: 'हिंदी', style: link, recognizer: _hindi),
                      const TextSpan(text: ') and the '),
                      TextSpan(
                        text: 'Terms of use',
                        style: link,
                        recognizer: _terms,
                      ),
                      const TextSpan(
                        text:
                            '. We use your email, phone and name to run your account, and show your display name on leaderboards.',
                      ),
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
