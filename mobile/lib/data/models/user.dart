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
      );

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
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
        // Older servers send no privacy block: nothing to ask then.
        needsPrivacyNotice:
            (json['privacy'] as Map?)?['needsNotice'] as bool? ?? false,
        analyticsConsent:
            (json['privacy'] as Map?)?['analytics'] as bool? ?? false,
      );

  static DateTime? _parseDate(Object? value) {
    if (value is String) return DateTime.tryParse(value);
    return null;
  }
}
