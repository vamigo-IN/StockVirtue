import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/company_names.dart';
import '../../data/api_client.dart';

/// Tops up the bundled company-name snapshot with the backend's daily NSE
/// list (new listings since the app was built). Watched once from the app
/// root; best-effort — on any failure the bundled names keep serving.
/// Resolves to the number of names known.
final companyDirectorySyncProvider = FutureProvider<int>((ref) async {
  final dio = ref.watch(apiClientProvider).dio;
  final dir = CompanyDirectory.instance;
  try {
    final res = await dio.get<Map<String, dynamic>>(
      '/market/company-names',
      queryParameters: {
        if (dir.serverStamp != null) 'since': dir.serverStamp,
      },
    );
    final data = res.data;
    if (data == null || data['unchanged'] == true) return dir.size;
    final names = data['names'];
    if (names is Map) dir.merge(names.cast<String, dynamic>());
    dir.serverStamp = '${data['updatedAt']}#${data['count']}';
  } catch (_) {
    // Offline / old backend — the bundled snapshot already covers ~all names.
  }
  return dir.size;
});
