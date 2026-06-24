import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

/// One row in the caller's "people I've invited" list. Tiny on purpose
/// — we only need a label + when they joined for the InviteTile sheet.
class ReferralEntry {
  final String id;
  final String displayName;
  final DateTime joinedAt;
  const ReferralEntry({
    required this.id,
    required this.displayName,
    required this.joinedAt,
  });

  factory ReferralEntry.fromJson(Map<String, dynamic> json) => ReferralEntry(
        id: json['id'] as String,
        displayName: json['displayName'] as String? ?? 'A StockVirtue trader',
        joinedAt: DateTime.tryParse(json['joinedAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
      );
}

/// Server-side referral picture for the current user. Drives the
/// InviteTile chip ("3 invited · ₹1.5L earned") and the bottom-sheet
/// content (redeem CTA visibility, list of referrals).
class ReferralStats {
  final String? code;
  final String? referredById;
  /// Display name of the user who referred me, if any. Null if I haven't
  /// redeemed anyone's code.
  final String? referredByName;
  final int referralCount;
  final double bonusEarned;
  final double perReferralBonus;
  final double perRedemptionBonus;
  final bool canRedeem;
  final int redeemWindowDays;
  final List<ReferralEntry> referrals;

  const ReferralStats({
    required this.code,
    required this.referredById,
    required this.referredByName,
    required this.referralCount,
    required this.bonusEarned,
    required this.perReferralBonus,
    required this.perRedemptionBonus,
    required this.canRedeem,
    required this.redeemWindowDays,
    required this.referrals,
  });

  factory ReferralStats.fromJson(Map<String, dynamic> json) {
    final by = json['referredBy'] as Map<String, dynamic>?;
    return ReferralStats(
      code: json['code'] as String?,
      referredById: json['referredById'] as String?,
      referredByName: by?['displayName'] as String?,
      referralCount: (json['referralCount'] as num?)?.toInt() ?? 0,
      bonusEarned: (json['bonusEarned'] as num?)?.toDouble() ?? 0,
      perReferralBonus:
          (json['perReferralBonus'] as num?)?.toDouble() ?? 0,
      perRedemptionBonus:
          (json['perRedemptionBonus'] as num?)?.toDouble() ?? 0,
      canRedeem: json['canRedeem'] as bool? ?? false,
      redeemWindowDays:
          (json['redeemWindowDays'] as num?)?.toInt() ?? 7,
      referrals: ((json['referrals'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(ReferralEntry.fromJson)
          .toList(),
    );
  }
}

/// Returned by POST /referrals/redeem when a code lands.
class RedeemResult {
  final String referrerName;
  final double bonusEarned;
  const RedeemResult({
    required this.referrerName,
    required this.bonusEarned,
  });

  factory RedeemResult.fromJson(Map<String, dynamic> json) {
    final r = json['referrer'] as Map<String, dynamic>?;
    return RedeemResult(
      referrerName: r?['displayName'] as String? ?? 'A StockVirtue trader',
      bonusEarned: (json['bonusEarned'] as num?)?.toDouble() ?? 0,
    );
  }
}

class ReferralsRepository {
  ReferralsRepository(this._dio);
  final Dio _dio;

  Future<ReferralStats> getStats() async {
    final res = await _dio.get<Map<String, dynamic>>('/referrals/stats');
    return ReferralStats.fromJson(res.data!);
  }

  Future<RedeemResult> redeem(String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/referrals/redeem',
      data: {'code': code.trim().toUpperCase()},
    );
    return RedeemResult.fromJson(res.data!);
  }
}

final referralsRepositoryProvider = Provider<ReferralsRepository>((ref) {
  return ReferralsRepository(ref.watch(apiClientProvider).dio);
});

/// Lazy-loaded referral stats. Invalidated by InviteTile after a
/// successful redeem so the chip + sheet repaint with the new count.
final referralStatsProvider = FutureProvider<ReferralStats>((ref) {
  return ref.watch(referralsRepositoryProvider).getStats();
});
