class AuthTokens {
  final String accessToken;
  final String refreshToken;
  final int accessTokenExpiresIn;
  final int refreshTokenExpiresIn;

  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
    required this.refreshTokenExpiresIn,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        accessTokenExpiresIn: (json['accessTokenExpiresIn'] as num).toInt(),
        refreshTokenExpiresIn: (json['refreshTokenExpiresIn'] as num).toInt(),
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessTokenExpiresIn': accessTokenExpiresIn,
        'refreshTokenExpiresIn': refreshTokenExpiresIn,
      };
}
