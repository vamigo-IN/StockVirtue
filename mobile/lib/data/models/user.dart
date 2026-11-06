/// What changed in the current privacy notice, in English and Hindi (the
/// API's `noticeChangeSummary`). The API sends null while the current notice
/// isn't announced (the first notice, 2026-11).
class NoticeChangeSummary {
  const NoticeChangeSummary({required this.en, required this.hi});

  final String en;
  final String hi;

  /// Tolerant: anything but a map with some text is null.
  static NoticeChangeSummary? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final en = raw['en'];
    final hi = raw['hi'];
    final enText = en is String ? en.trim() : '';
    final hiText = hi is String ? hi.trim() : '';
    if (enText.isEmpty && hiText.isEmpty) return null;
    return NoticeChangeSummary(en: enText, hi: hiText);
  }
}

/// The account's privacy-notice state, as the API sends it: `user.privacy`
/// in /auth/me and the sign-in answers, and the top level of
/// GET /v1/privacy/me and of the consent answer.
///
/// Every field is optional, so an older server keeps working: no privacy
/// block means nothing to ask, and a missing `analyticsReask` means "ask
/// afresh" (the unticked analytics box every version before 1.4.1 shows).
class NoticeState {
  const NoticeState({
    this.needsNotice = false,
    this.analytics = false,
    this.acceptedVersion,
    this.currentVersion,
    this.updatedAt,
    this.changeSummary,
    this.analyticsReask = true,
  });

  /// The account must read and accept the current notice (and confirm being
  /// 18 or older) before using the app.
  final bool needsNotice;

  /// App usage analytics allowed.
  final bool analytics;

  /// The notice version the person accepted (`noticeVersion`); null when they
  /// never accepted one.
  final String? acceptedVersion;

  /// The server's current notice version (`currentNoticeVersion`).
  final String? currentVersion;

  /// When the current notice last changed materially (`noticeUpdatedAt`).
  final DateTime? updatedAt;

  /// What changed (`noticeChangeSummary`); null while nothing was announced.
  final NoticeChangeSummary? changeSummary;

  /// The analytics question must be asked afresh: the person never accepted
  /// a notice, or a version since theirs changes app analytics.
  final bool analyticsReask;

  factory NoticeState.fromJson(Object? raw) {
    if (raw is! Map) return const NoticeState();
    return NoticeState(
      needsNotice: _bool(raw['needsNotice']) ?? false,
      analytics: _bool(raw['analytics']) ?? false,
      acceptedVersion: _text(raw['noticeVersion']),
      currentVersion: _text(raw['currentNoticeVersion']),
      updatedAt: _date(raw['noticeUpdatedAt']),
      changeSummary: NoticeChangeSummary.fromJson(raw['noticeChangeSummary']),
      analyticsReask: _bool(raw['analyticsReask']) ?? true,
    );
  }

  static bool? _bool(Object? value) => value is bool ? value : null;

  static String? _text(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  static DateTime? _date(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;
}

class AppUser {
  final String id;
  final String? phone;
  final String? email;
  final String? displayName;
  /// Profile photo URL from a federated provider (e.g. Google). Null otherwise.
  final String? avatarUrl;
  /// Whether the user opted in to a per-trade email on every order fill.
  final bool tradeEmailsOptIn;
  final String status;
  final bool profileComplete;
  /// How the account signs in: 'email', 'google', or 'phone'. Determines which
  /// identity field is locked in profile editing (the login credential).
  final String authProvider;
  final DateTime? createdAt;
  final DateTime? lastLoginAt;
  /// Server-issued invite code, format "SV-XXXXXX". The client used to
  /// derive this locally via FNV-1a; we now read it from the backend so
  /// `/referrals/redeem` can resolve codes back to their owners.
  final String? referralCode;
  /// Non-null once this user has redeemed someone else's invite. Used by
  /// the InviteTile to hide the "redeem" CTA after a successful claim.
  final String? referredById;
  /// The account still has to read and accept the current privacy notice
  /// (and confirm being 18 or older) before using the app.
  final bool needsPrivacyNotice;
  /// App usage analytics allowed. Off unless the person said yes.
  final bool analyticsConsent;
  /// The privacy notice version the person accepted; null when they never
  /// accepted one (the notice screen's first-time mode).
  final String? acceptedNoticeVersion;
  /// The server's current notice version: the one the notice screen shows
  /// and the person accepts.
  final String? currentNoticeVersion;
  /// When the current notice last changed materially.
  final DateTime? noticeUpdatedAt;
  /// What changed in the current notice, in English and Hindi.
  final NoticeChangeSummary? noticeChangeSummary;
  /// The analytics box must start unticked (asked afresh). False only when
  /// the server says the person's current choice still holds; true against
  /// an older server that doesn't say.
  final bool analyticsReask;

  const AppUser({
    required this.id,
    required this.phone,
    required this.email,
    required this.displayName,
    required this.avatarUrl,
    required this.tradeEmailsOptIn,
    required this.status,
    required this.profileComplete,
    required this.authProvider,
    required this.createdAt,
    required this.lastLoginAt,
    required this.referralCode,
    required this.referredById,
    this.needsPrivacyNotice = false,
    this.analyticsConsent = false,
    this.acceptedNoticeVersion,
    this.currentNoticeVersion,
    this.noticeUpdatedAt,
    this.noticeChangeSummary,
    this.analyticsReask = true,
  });

  AppUser copyWith({
    String? displayName,
    String? email,
    String? avatarUrl,
    bool? tradeEmailsOptIn,
    bool? profileComplete,
    String? referredById,
    bool? needsPrivacyNotice,
    bool? analyticsConsent,
    String? acceptedNoticeVersion,
    String? currentNoticeVersion,
    DateTime? noticeUpdatedAt,
    NoticeChangeSummary? noticeChangeSummary,
    bool? analyticsReask,
  }) =>
      AppUser(
        id: id,
        phone: phone,
        email: email ?? this.email,
        displayName: displayName ?? this.displayName,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        tradeEmailsOptIn: tradeEmailsOptIn ?? this.tradeEmailsOptIn,
        status: status,
        profileComplete: profileComplete ?? this.profileComplete,
        authProvider: authProvider,
        createdAt: createdAt,
        lastLoginAt: lastLoginAt,
        referralCode: referralCode,
        referredById: referredById ?? this.referredById,
        needsPrivacyNotice: needsPrivacyNotice ?? this.needsPrivacyNotice,
        analyticsConsent: analyticsConsent ?? this.analyticsConsent,
        acceptedNoticeVersion:
            acceptedNoticeVersion ?? this.acceptedNoticeVersion,
        currentNoticeVersion: currentNoticeVersion ?? this.currentNoticeVersion,
        noticeUpdatedAt: noticeUpdatedAt ?? this.noticeUpdatedAt,
        noticeChangeSummary: noticeChangeSummary ?? this.noticeChangeSummary,
        analyticsReask: analyticsReask ?? this.analyticsReask,
      );

  /// This account with the privacy-notice state the server just sent, every
  /// field replaced (a summary or a date can go back to null).
  AppUser withNotice(NoticeState notice) => AppUser(
        id: id,
        phone: phone,
        email: email,
        displayName: displayName,
        avatarUrl: avatarUrl,
        tradeEmailsOptIn: tradeEmailsOptIn,
        status: status,
        profileComplete: profileComplete,
        authProvider: authProvider,
        createdAt: createdAt,
        lastLoginAt: lastLoginAt,
        referralCode: referralCode,
        referredById: referredById,
        needsPrivacyNotice: notice.needsNotice,
        analyticsConsent: notice.analytics,
        acceptedNoticeVersion: notice.acceptedVersion,
        currentNoticeVersion: notice.currentVersion,
        noticeUpdatedAt: notice.updatedAt,
        noticeChangeSummary: notice.changeSummary,
        analyticsReask: notice.analyticsReask,
      );

  factory AppUser.fromJson(Map<String, dynamic> json) {
    // Older servers send no privacy block: nothing to ask then.
    final notice = NoticeState.fromJson(json['privacy']);
    return AppUser(
      id: json['id'] as String,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      displayName: json['displayName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      tradeEmailsOptIn: json['tradeEmailsOptIn'] as bool? ?? false,
      status: json['status'] as String? ?? 'ACTIVE',
      profileComplete: json['profileComplete'] as bool? ?? false,
      authProvider: json['authProvider'] as String? ?? 'phone',
      createdAt: _parseDate(json['createdAt']),
      lastLoginAt: _parseDate(json['lastLoginAt']),
      referralCode: json['referralCode'] as String?,
      referredById: json['referredById'] as String?,
      needsPrivacyNotice: notice.needsNotice,
      analyticsConsent: notice.analytics,
      acceptedNoticeVersion: notice.acceptedVersion,
      currentNoticeVersion: notice.currentVersion,
      noticeUpdatedAt: notice.updatedAt,
      noticeChangeSummary: notice.changeSummary,
      analyticsReask: notice.analyticsReask,
    );
  }

  static DateTime? _parseDate(Object? value) {
    if (value is String) return DateTime.tryParse(value);
    return null;
  }
}
