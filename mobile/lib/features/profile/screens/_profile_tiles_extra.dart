import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/error_mapper.dart';
import '../../../core/money_format.dart';
import '../../../data/models/user.dart';
import '../../academy/lesson_progress.dart';
import '../../academy/screens/academy_screen.dart';
import '../../referral/referral_code.dart';
import '../../referral/referrals_repository.dart';

/// Quick link to the Trading Academy. Displays "X / Y lessons" so the
/// user can see progress at a glance without opening the screen.
class AcademyTile extends ConsumerWidget {
  const AcademyTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final (completed, total) = ref.watch(lessonProgressSummaryProvider);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const AcademyScreen()),
      ),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFF22C55E).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.school_outlined,
                color: Color(0xFF22C55E),
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Trading Academy',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Short lessons on candles, indicators & psychology',
                    style: TextStyle(fontSize: 11.5),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFF22C55E).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$completed / $total',
                style: const TextStyle(
                  color: Color(0xFF22C55E),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right,
              size: 18,
              color: scheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Invite a friend" tile. Now wired end-to-end:
///   * Shows live invite count + lifetime bonus rupees in the chip
///   * Bottom sheet exposes the share path (referrer side) and, while
///     the redemption window is open, a "Redeem a code" entry (referred
///     side). Both call into /referrals.
///   * Promotes the actual reward amounts so users know what they get.
class InviteTile extends ConsumerWidget {
  const InviteTile({super.key, required this.user});
  final AppUser user;

  Future<void> _showInvite(BuildContext context, WidgetRef ref) async {
    // Pull fresh stats every time the sheet opens — count is the
    // primary motivator and stale numbers undersell the feature.
    ref.invalidate(referralStatsProvider);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _InviteSheet(fallbackCode: user.referralCode),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final statsAsync = ref.watch(referralStatsProvider);
    final stats = statsAsync.value;
    // Fallback to the deterministic client hash if /auth/me hasn't
    // arrived yet (offline boot, etc) — same algorithm as the server.
    final code = stats?.code ?? user.referralCode ?? referralCodeFor(user.id);
    final count = stats?.referralCount ?? 0;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _showInvite(context, ref),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFEC4899).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.card_giftcard,
                color: Color(0xFFEC4899),
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Invite friends',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    count > 0
                        ? '$count invited · ${formatInr(stats!.bonusEarned)} earned'
                        : '+₹50,000 for every friend who signs up with your code',
                    style: const TextStyle(fontSize: 11.5),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFEC4899).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                code.split('-').last,
                style: const TextStyle(
                  color: Color(0xFFEC4899),
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  letterSpacing: 0.8,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right,
              size: 18,
              color: scheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _InviteSheet extends ConsumerWidget {
  const _InviteSheet({required this.fallbackCode});

  /// Code from the AppUser if /referrals/stats hasn't loaded yet — keeps
  /// the share button live during the loading flicker.
  final String? fallbackCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(referralStatsProvider);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 4,
          // Lift the sheet above the on-screen keyboard so the redeem field
          // (pinned near the bottom) stays visible while typing.
          bottom: 24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 60),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 28),
            child: Text(
              "Couldn't load referral stats: $e",
              style: TextStyle(
                color: scheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
          ),
          data: (stats) {
            // The code on the stats payload trumps anything we passed
            // through `fallbackCode` since the server is authoritative.
            final code = stats.code ?? fallbackCode ?? 'SV-STOCKV';
            final referrerName = stats.referredByName;
            return SingleChildScrollView(
              child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Header(),
                const SizedBox(height: 14),
                _RewardPill(
                  perReferrerBonus: stats.perReferralBonus,
                  perRedemptionBonus: stats.perRedemptionBonus,
                ),
                const SizedBox(height: 16),
                _CodeBlock(code: code),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    icon: const Icon(Icons.share, size: 18),
                    label: const Text(
                      'Share invite',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => SharePlus.instance.share(
                      ShareParams(
                        text: referralInviteMessage(code),
                        subject: 'Join me on StockVirtue',
                      ),
                    ),
                  ),
                ),
                if (stats.canRedeem) ...[
                  const SizedBox(height: 14),
                  Container(
                    height: 1,
                    color: scheme.outlineVariant.withValues(alpha: 0.3),
                  ),
                  const SizedBox(height: 12),
                  _RedeemBlock(stats: stats),
                ],
                if (referrerName != null) ...[
                  const SizedBox(height: 16),
                  _ReferredByPill(name: referrerName),
                ],
                if (stats.referrals.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text(
                    'Your invites',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  for (final r in stats.referrals.take(5))
                    _InviteRow(entry: r),
                ],
              ],
            ),
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(Icons.card_giftcard, color: scheme.primary, size: 20),
        ),
        const SizedBox(width: 12),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Invite a friend',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 2),
              Text(
                'Both of you earn virtual ₹ when they redeem your code.',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RewardPill extends StatelessWidget {
  const _RewardPill({
    required this.perReferrerBonus,
    required this.perRedemptionBonus,
  });
  final double perReferrerBonus;
  final double perRedemptionBonus;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            const Color(0xFF22C55E).withValues(alpha: 0.18),
            const Color(0xFFEC4899).withValues(alpha: 0.18),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _RewardLeg(
              label: 'You earn',
              value: formatInr(perReferrerBonus),
              icon: Icons.trending_up,
              color: const Color(0xFF22C55E),
            ),
          ),
          Container(
            width: 1,
            height: 28,
            color: scheme.outlineVariant.withValues(alpha: 0.4),
          ),
          Expanded(
            child: _RewardLeg(
              label: 'They earn',
              value: formatInr(perRedemptionBonus),
              icon: Icons.celebration,
              color: const Color(0xFFEC4899),
            ),
          ),
        ],
      ),
    );
  }
}

class _RewardLeg extends StatelessWidget {
  const _RewardLeg({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.55),
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  color: color,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'YOUR CODE',
                  style: TextStyle(
                    fontSize: 10,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  code,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy_outlined),
            tooltip: 'Copy code',
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: code));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Code copied'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _RedeemBlock extends ConsumerStatefulWidget {
  const _RedeemBlock({required this.stats});
  final ReferralStats stats;

  @override
  ConsumerState<_RedeemBlock> createState() => _RedeemBlockState();
}

class _RedeemBlockState extends ConsumerState<_RedeemBlock> {
  final _codeC = TextEditingController();
  bool _redeeming = false;
  String? _error;

  @override
  void dispose() {
    _codeC.dispose();
    super.dispose();
  }

  Future<void> _redeem() async {
    // The field shows a fixed "SV-" prefix; the user types only the 6 chars.
    final entry = _codeC.text.trim().toUpperCase();
    if (!RegExp(r'^[A-F0-9]{6}$').hasMatch(entry)) {
      setState(() => _error = 'Enter the 6 characters after “SV-” (A–F, 0–9).');
      return;
    }
    final code = 'SV-$entry';
    setState(() {
      _redeeming = true;
      _error = null;
    });
    try {
      final result =
          await ref.read(referralsRepositoryProvider).redeem(code);
      // Both the user's wallet bonus and the referral linkage just
      // changed server-side. Bust all the caches that depend on them so
      // the UI repaints with fresh numbers.
      ref.invalidate(referralStatsProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "🎉 You earned ${formatInr(result.bonusEarned)} via "
              "${result.referrerName}'s invite!",
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      setState(() => _error = friendlyError(e, context: 'referral'));
    } finally {
      if (mounted) setState(() => _redeeming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.qr_code_2,
              size: 18,
              color: scheme.primary,
            ),
            const SizedBox(width: 8),
            const Text(
              'Have an invite code?',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Redeem within ${widget.stats.redeemWindowDays} days of signup to '
          'add ${formatInr(widget.stats.perRedemptionBonus)} to your wallet.',
          style: TextStyle(
            fontSize: 11.5,
            color: scheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _codeC,
          textCapitalization: TextCapitalization.characters,
          maxLength: 6, // the 6 chars after the fixed "SV-" prefix
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[A-Fa-f0-9]')),
            _UppercaseFormatter(),
          ],
          decoration: const InputDecoration(
            prefixText: 'SV-',
            prefixStyle: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              letterSpacing: 2,
            ),
            hintText: 'XXXXXX',
            counterText: '',
            prefixIcon: Icon(Icons.qr_code_2),
          ),
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            letterSpacing: 2,
          ),
          onSubmitted: (_) => _redeem(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.tonal(
            onPressed: _redeeming ? null : _redeem,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
            ),
            child: _redeeming
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    'Redeem & earn ${formatInr(widget.stats.perRedemptionBonus)}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ),
      ],
    );
  }
}

class _ReferredByPill extends StatelessWidget {
  const _ReferredByPill({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: const Color(0xFF22C55E).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFF22C55E).withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: Color(0xFF22C55E), size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Invited by $name',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: scheme.onSurface.withValues(alpha: 0.85),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InviteRow extends StatelessWidget {
  const _InviteRow({required this.entry});
  final ReferralEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              entry.displayName.isNotEmpty
                  ? entry.displayName[0].toUpperCase()
                  : 'T',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 11,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              entry.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            _fmtRelative(entry.joinedAt),
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _UppercaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

String _fmtRelative(DateTime d) {
  final delta = DateTime.now().difference(d);
  if (delta.inDays > 30) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day} ${months[d.month - 1]}';
  }
  if (delta.inDays > 0) return '${delta.inDays}d ago';
  if (delta.inHours > 0) return '${delta.inHours}h ago';
  if (delta.inMinutes > 0) return '${delta.inMinutes}m ago';
  return 'Just now';
}
