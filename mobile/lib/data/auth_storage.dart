import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/secure_storage.dart';
import 'models/tokens.dart';

const _kTokensKey = 'stockvirtue.auth.tokens';

class AuthStorage {
  AuthStorage(this._storage);
  final FlutterSecureStorage _storage;

  Future<AuthTokens?> read() async {
    final raw = await _storage.read(key: _kTokensKey);
    if (raw == null) return null;
    try {
      return AuthTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<void> write(AuthTokens tokens) async {
    await _storage.write(key: _kTokensKey, value: jsonEncode(tokens.toJson()));
  }

  Future<void> clear() => _storage.delete(key: _kTokensKey);
}

final authStorageProvider = Provider<AuthStorage>((ref) {
  return AuthStorage(appSecureStorage);
});
