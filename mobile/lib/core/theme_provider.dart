import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kThemeKey = 'stockvirtue.theme';

class ThemeController extends AsyncNotifier<ThemeMode> {
  late final FlutterSecureStorage _storage;

  @override
  Future<ThemeMode> build() async {
    _storage = const FlutterSecureStorage();
    final raw = await _storage.read(key: _kThemeKey);
    return _decode(raw);
  }

  Future<void> setMode(ThemeMode mode) async {
    state = AsyncData(mode);
    await _storage.write(key: _kThemeKey, value: _encode(mode));
  }

  Future<void> toggle() async {
    final current = state.value ?? ThemeMode.dark;
    await setMode(
      current == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark,
    );
  }

  static ThemeMode _decode(String? raw) {
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'system':
        return ThemeMode.system;
      case 'dark':
      default:
        return ThemeMode.dark;
    }
  }

  static String _encode(ThemeMode m) {
    switch (m) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.system:
        return 'system';
      case ThemeMode.dark:
        return 'dark';
    }
  }
}

final themeControllerProvider =
    AsyncNotifierProvider<ThemeController, ThemeMode>(ThemeController.new);
