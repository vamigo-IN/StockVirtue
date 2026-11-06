import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error_mapper.dart';
import '../../../data/models/user.dart';
import '../../auth/auth_controller.dart';
import '../privacy_repository.dart';
import '../widgets/consent_box.dart';
import 'delete_account_screen.dart';

/// Which version of the notice screen an account sees.
enum NoticeMode {
  /// They never accepted a notice: the short notice.
  firstTime,

  /// They accepted an earlier version: when it changed, and what changed.
  updated,
}

/// How the notice screen sets itself up for an account. It is fixed when the
/// screen draws a version, so what the person accepts is what they read.
class NoticeSetup {
  const NoticeSetup({
    required this.mode,
    required this.version,
    required this.updatedAt,
    required this.summary,
    required this.analyticsStart,
    required this.prefilled,
    required this.hadAllowed,
  });

  factory NoticeSetup.of(AppUser? user) {
    if (user == null) {
      return const NoticeSetup(
        mode: NoticeMode.firstTime,
        version: null,
        updatedAt: null,
        summary: null,
        analyticsStart: false,
        prefilled: false,
        hadAllowed: false,
      );
    }
    final accepted = user.acceptedNoticeVersion;
    final updated = user.needsPrivacyNotice &&
        accepted != null &&
        accepted != user.currentNoticeVersion;
    // The person's choice carries over only when the server says it still
    // holds. An older server doesn't say, so the box starts unticked there,
    // as it always did.
    final keep = updated && !user.analyticsReask;
    return NoticeSetup(
      mode: updated ? NoticeMode.updated : NoticeMode.firstTime,
      version: user.currentNoticeVersion,
      updatedAt: user.noticeUpdatedAt,
      summary: user.noticeChangeSummary,
      analyticsStart: keep && user.analyticsConsent,
      prefilled: keep,
      hadAllowed: updated && !keep && user.analyticsConsent,
    );
  }

  final NoticeMode mode;

  /// The notice version shown, which accepting sends.
  final String? version;

  /// When the notice changed (updated mode).
  final DateTime? updatedAt;

  /// What changed (updated mode).
  final NoticeChangeSummary? summary;

  /// The analytics box's starting value.
  final bool analyticsStart;

  /// The box was set to the person's current choice, so accepting tells the
  /// API which value it showed (`analyticsPrefilled`).
  final bool prefilled;

  /// Analytics was on, but this change asks about it afresh: the box starts
  /// unticked with "You had allowed this before."
  final bool hadAllowed;

  /// Whether [other] draws the same screen: the same version, date, summary
  /// and analytics box. A 409 `notice_outdated` can keep the version and
  /// change only the analytics question (it is now asked afresh), so the
  /// whole setup is compared, never the version alone.
  bool sameAs(NoticeSetup other) =>
      mode == other.mode &&
      version == other.version &&
      updatedAt == other.updatedAt &&
      summary?.en == other.summary?.en &&
      summary?.hi == other.summary?.hi &&
      analyticsStart == other.analyticsStart &&
      prefilled == other.prefilled &&
      hadAllowed == other.hadAllowed;
}

const _months = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// "14 September 2027": the day in India.
String noticeDate(DateTime at) {
  final ist = at.toUtc().add(const Duration(hours: 5, minutes: 30));
  return '${ist.day} ${_months[ist.month - 1]} ${ist.year}';
}

/// Shown before anything else when the account hasn't accepted the current
/// privacy notice (DPDP Act 2023 s.5: notice, and consent, before use).
///
/// First time (accounts from before notices were recorded): a short version
/// of the notice. After a change: "We updated our privacy notice", the date
/// and what changed (in English, Hindi a tap away), with the analytics box
/// set to the person's current choice unless the change concerns analytics.
/// Both: the full notice a tap away (English or Hindi), the 18+ confirmation,
/// the optional analytics choice, and the ways out (sign out, delete the
/// account, ask for a copy of the data).
class PrivacyNoticeScreen extends ConsumerStatefulWidget {
  const PrivacyNoticeScreen({super.key});

  @override
  ConsumerState<PrivacyNoticeScreen> createState() =>
      _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends ConsumerState<PrivacyNoticeScreen> {
  late NoticeSetup _setup;
  bool _adult = false;
  bool _analytics = false;
  bool _showHindi = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _setUp(ref.read(authControllerProvider).value);
  }

  /// Starts the boxes for [user]'s current notice: agreement unticked (the
  /// person agrees to what this version says), analytics per [NoticeSetup].
  void _setUp(AppUser? user) {
    _setup = NoticeSetup.of(user);
    _adult = false;
    _analytics = _setup.analyticsStart;
    _showHindi = false;
  }

  Future<void> _accept() async {
    if (!_adult) {
      setState(
        () => _error = 'Tick the first box to confirm you are 18 or older.',
      );
      return;
    }
    final setup = _setup;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).acceptPrivacyNotice(
            noticeVersion: setup.version,
            analytics: _analytics,
            analyticsPrefilled: setup.prefilled ? setup.analyticsStart : null,
          );
    } catch (e) {
      if (mounted) setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // A newer notice, or a fresh analytics question, arrived while the screen
    // was open (accepting answered 409, or a refresh found it): start again
    // with what it says, so the person accepts what they now read.
    ref.listen<AsyncValue<AppUser?>>(authControllerProvider, (_, next) {
      final user = next.value;
      if (user == null || !user.needsPrivacyNotice) return;
      if (!NoticeSetup.of(user).sameAs(_setup)) setState(() => _setUp(user));
    });

    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.7);
    final updated = _setup.mode == NoticeMode.updated;
    final headline = theme.textTheme.headlineSmall?.copyWith(
      fontWeight: FontWeight.w800,
    );

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            Icon(Icons.privacy_tip_outlined, size: 40, color: scheme.primary),
            const SizedBox(height: 12),
            if (updated)
              ..._updatedIntro(headline, muted, scheme)
            else
              ..._firstTimeIntro(headline, muted, scheme),
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
              title: Text(
                updated
                    ? 'I am 18 or older, and I agree to the updated privacy '
                        'notice and the terms of use.'
                    : 'I am 18 or older, and I agree to the privacy notice and '
                        'the terms of use.',
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                ),
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
              subtitle: _setup.hadAllowed
                  ? Text(
                      'You had allowed this before.',
                      style: TextStyle(fontSize: 12.5, color: muted),
                    )
                  : null,
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
            // The app's own Privacy & your data screen is behind this gate,
            // so the request form on the website.
            Center(
              child: TextButton.icon(
                onPressed: () => openWebPage(context, privacyRequestsUrl),
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Ask for a copy of your data'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// First time: what we do with the data, in five points.
  List<Widget> _firstTimeIntro(
    TextStyle? headline,
    Color muted,
    ColorScheme scheme,
  ) {
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
    return [
      Text('Your privacy', style: headline),
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
    ];
  }

  /// After a change: when, and what changed (Hindi a tap away).
  List<Widget> _updatedIntro(
    TextStyle? headline,
    Color muted,
    ColorScheme scheme,
  ) {
    final date = _setup.updatedAt;
    final summary = _setup.summary;
    final en = summary?.en ?? '';
    final hi = summary?.hi ?? '';
    return [
      Text('We updated our privacy notice', style: headline),
      if (date != null) ...[
        const SizedBox(height: 6),
        Text(
          'On ${noticeDate(date)} we changed our privacy notice.',
          style: TextStyle(color: muted, height: 1.4),
        ),
      ],
      if (en.isNotEmpty || hi.isNotEmpty) ...[
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (en.isNotEmpty)
                Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'What changed: ',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: en),
                    ],
                  ),
                  style: const TextStyle(fontSize: 13.5, height: 1.4),
                ),
              if (hi.isNotEmpty) ...[
                Semantics(
                  expanded: _showHindi,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _showHindi = !_showHindi),
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    ),
                    icon: Icon(
                      _showHindi ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                    ),
                    label: const Text('हिंदी में पढ़ें'),
                  ),
                ),
                if (_showHindi)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      hi,
                      locale: const Locale('hi', 'IN'),
                      style: const TextStyle(fontSize: 13.5, height: 1.5),
                    ),
                  ),
              ] else
                const SizedBox(height: 8),
            ],
          ),
        ),
      ],
      const SizedBox(height: 12),
    ];
  }
}
