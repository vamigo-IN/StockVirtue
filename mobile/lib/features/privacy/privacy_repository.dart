import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../data/api_client.dart';
import '../../data/models/user.dart';

/// The full privacy notice, in English and Hindi, on the website.
String get privacyNoticeUrl => '$kWebsiteUrl/privacy';
String get privacyNoticeHindiUrl => '$kWebsiteUrl/privacy/hi';
String get termsUrl => '$kWebsiteUrl/terms';
String get privacyRequestsUrl => '$kWebsiteUrl/privacy/requests';

/// Who answers for personal data, and the current notice (public).
class PrivacyInfo {
  const PrivacyInfo({
    required this.noticeVersion,
    required this.legalName,
    required this.officerName,
    required this.officerEmail,
    required this.officerPhone,
    required this.responseDays,
    this.noticeUpdatedAt,
    this.noticeChangeSummary,
  });

  /// The server's current notice version. Null when the server didn't say
  /// (then the app sends no consent: it never makes a version up).
  final String? noticeVersion;
  final String legalName;
  final String? officerName;
  final String officerEmail;
  final String? officerPhone;
  final int responseDays;

  /// When the current notice last changed materially.
  final DateTime? noticeUpdatedAt;

  /// What changed, in English and Hindi; null while nothing was announced.
  final NoticeChangeSummary? noticeChangeSummary;

  factory PrivacyInfo.fromJson(Map<String, dynamic> j) {
    final officer = (j['grievanceOfficer'] as Map?)?.cast<String, dynamic>();
    final version = j['noticeVersion'];
    final updatedAt = j['noticeUpdatedAt'];
    return PrivacyInfo(
      noticeVersion:
          version is String && version.trim().isNotEmpty ? version.trim() : null,
      noticeUpdatedAt: updatedAt is String ? DateTime.tryParse(updatedAt) : null,
      noticeChangeSummary:
          NoticeChangeSummary.fromJson(j['noticeChangeSummary']),
      legalName: j['legalName'] as String? ?? 'Vamigo Media (OPC) Pvt. Ltd.',
      officerName: officer?['name'] as String?,
      officerEmail:
          officer?['email'] as String? ?? 'support@stockvirtue.com',
      officerPhone: officer?['phone'] as String?,
      responseDays: (j['responseDays'] as num?)?.toInt() ?? 30,
    );
  }
}

class Nominee {
  const Nominee({
    required this.name,
    this.email,
    this.phone,
    this.relationship,
  });

  final String name;
  final String? email;
  final String? phone;
  final String? relationship;

  static Nominee? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final name = raw['name'];
    if (name is! String || name.isEmpty) return null;
    return Nominee(
      name: name,
      email: raw['email'] as String?,
      phone: raw['phone'] as String?,
      relationship: raw['relationship'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        if (email != null && email!.isNotEmpty) 'email': email,
        if (phone != null && phone!.isNotEmpty) 'phone': phone,
        if (relationship != null && relationship!.isNotEmpty)
          'relationship': relationship,
      };
}

/// The account's privacy settings (GET /v1/privacy/me, and the answer to
/// accepting the notice or changing the analytics choice).
class PrivacyStatus {
  const PrivacyStatus({
    required this.needsNotice,
    required this.analytics,
    required this.nominee,
    required this.openRequests,
    required this.info,
    this.notice = const NoticeState(),
  });

  final bool needsNotice;
  final bool analytics;
  final Nominee? nominee;
  final int openRequests;
  final PrivacyInfo info;

  /// The notice fields: accepted and current version, date, summary and
  /// whether analytics must be asked afresh.
  final NoticeState notice;

  factory PrivacyStatus.fromJson(Map<String, dynamic> j) {
    final notice = NoticeState.fromJson(j);
    return PrivacyStatus(
      needsNotice: notice.needsNotice,
      analytics: notice.analytics,
      nominee: Nominee.fromJson(j['nominee']),
      openRequests: (j['openRequests'] as num?)?.toInt() ?? 0,
      info: PrivacyInfo.fromJson(
        (j['contact'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
      notice: notice,
    );
  }
}

/// What a person can ask for, in the words the app shows.
const Map<String, String> kRequestTypes = {
  'ACCESS': 'A summary of my data',
  'CORRECTION': 'Correct or update my data',
  'WITHDRAW_CONSENT': 'Withdraw my consent',
  'NOMINATION': 'About my nominee',
  'GRIEVANCE': 'A complaint',
  'OTHER': 'Something else',
};

const Map<String, String> kRequestStatuses = {
  'OPEN': 'Received',
  'IN_PROGRESS': 'In progress',
  'RESOLVED': 'Done',
  'REJECTED': 'Answered',
};

class PrivacyRequestItem {
  const PrivacyRequestItem({
    required this.reference,
    required this.type,
    required this.status,
    required this.details,
    required this.createdAt,
    required this.dueAt,
    this.response,
  });

  final String reference;
  final String type;
  final String status;
  final String details;
  final DateTime? createdAt;
  final DateTime? dueAt;
  final String? response;

  factory PrivacyRequestItem.fromJson(Map<String, dynamic> j) =>
      PrivacyRequestItem(
        reference: j['reference'] as String? ?? '',
        type: j['type'] as String? ?? 'OTHER',
        status: j['status'] as String? ?? 'OPEN',
        details: j['details'] as String? ?? '',
        createdAt: DateTime.tryParse(j['createdAt'] as String? ?? ''),
        dueAt: DateTime.tryParse(j['dueAt'] as String? ?? ''),
        response: j['response'] as String?,
      );
}

/// The privacy API (DPDP Act 2023): the notice, consent, the data download,
/// the nominee, requests and grievances, and deleting the account.
class PrivacyRepository {
  PrivacyRepository(this._dio);
  final Dio _dio;

  Future<PrivacyInfo> info() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/privacy');
    return PrivacyInfo.fromJson(res.data!);
  }

  Future<PrivacyStatus> status() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/privacy/me');
    return PrivacyStatus.fromJson(res.data!);
  }

  /// Accepts the notice [noticeVersion] (the one the screen showed); [adult]
  /// must be true (the API checks too). [analyticsPrefilled] is the value the
  /// analytics box started at, sent only when the screen set the box to the
  /// person's current choice: the API then treats a box left as shown as no
  /// decision. A newer notice, or a prefilled box where the analytics
  /// question had to be asked afresh, answers 409 `notice_outdated`.
  Future<PrivacyStatus> acceptNotice({
    required String noticeVersion,
    required bool adult,
    bool? analytics,
    bool? analyticsPrefilled,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/privacy/me/consent',
      data: {
        'noticeVersion': noticeVersion,
        'adult': adult,
        'analytics': ?analytics,
        'analyticsPrefilled': ?analyticsPrefilled,
      },
    );
    return PrivacyStatus.fromJson(res.data!);
  }

  Future<PrivacyStatus> setAnalytics(bool enabled) async {
    final res = await _dio.put<Map<String, dynamic>>(
      '/v1/privacy/me/analytics',
      data: {'enabled': enabled},
    );
    return PrivacyStatus.fromJson(res.data!);
  }

  /// Everything we hold about the account, as a JSON file's bytes.
  Future<Uint8List> exportData() async {
    final res = await _dio.get<dynamic>('/v1/privacy/me/export');
    final pretty = const JsonEncoder.withIndent('  ').convert(res.data);
    return Uint8List.fromList(utf8.encode(pretty));
  }

  Future<Nominee?> saveNominee(Nominee n) async {
    final res = await _dio.put<Map<String, dynamic>>(
      '/v1/privacy/me/nominee',
      data: n.toJson(),
    );
    return Nominee.fromJson(res.data?['nominee']);
  }

  Future<void> removeNominee() async {
    await _dio.delete('/v1/privacy/me/nominee');
  }

  Future<List<PrivacyRequestItem>> requests() async {
    final res = await _dio.get<List<dynamic>>('/v1/privacy/me/requests');
    return [
      for (final r in res.data ?? const [])
        if (r is Map) PrivacyRequestItem.fromJson(r.cast<String, dynamic>()),
    ];
  }

  Future<PrivacyRequestItem> raise(String type, String details) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/privacy/me/requests',
      data: {'type': type, 'details': details},
    );
    return PrivacyRequestItem.fromJson({
      ...res.data!,
      'details': details,
    });
  }

  /// Deletes the account (the person typed DELETE).
  Future<DateTime?> deleteAccount({String? reason}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/v1/privacy/me/delete',
      data: {
        'confirm': 'DELETE',
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    return DateTime.tryParse(res.data?['eraseAfter'] as String? ?? '');
  }
}

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) {
  return PrivacyRepository(ref.watch(apiClientProvider).dio);
});

/// The public notice details (works signed out). Auto-disposed, so nothing
/// keeps an old version: signing up reads the notice afresh anyway
/// (`AuthController._consent`).
final privacyInfoProvider = FutureProvider.autoDispose<PrivacyInfo>((ref) {
  return ref.watch(privacyRepositoryProvider).info();
});

/// The signed-in account's privacy settings.
final privacyStatusProvider = FutureProvider.autoDispose<PrivacyStatus>((ref) {
  return ref.watch(privacyRepositoryProvider).status();
});

final privacyRequestsProvider =
    FutureProvider.autoDispose<List<PrivacyRequestItem>>((ref) {
  return ref.watch(privacyRepositoryProvider).requests();
});
