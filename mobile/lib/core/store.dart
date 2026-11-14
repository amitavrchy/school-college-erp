import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Refresh token, chosen campus and the offline cache live in the Android Keystore-backed secure
/// storage (iOS Keychain). Only the language choice is kept in plain preferences.
class Store {
  Store(this._prefs);
  final SharedPreferences _prefs;
  static const _secure = FlutterSecureStorage();

  static Future<Store> open() async => Store(await SharedPreferences.getInstance());

  String? get language => _prefs.getString('language');
  Future<void> setLanguage(String code) => _prefs.setString('language', code);

  Future<String?> get refreshToken => _secure.read(key: 'refresh_token');
  Future<void> setRefreshToken(String? value) => value == null
      ? _secure.delete(key: 'refresh_token')
      : _secure.write(key: 'refresh_token', value: value);

  Future<String?> read(String key) => _secure.read(key: key);
  Future<void> write(String key, String? value) =>
      value == null ? _secure.delete(key: key) : _secure.write(key: key, value: value);

  /// Saves a response for offline reading, with the time it was fetched.
  Future<void> cache(String key, Object? data) => _secure.write(
        key: 'cache:$key',
        value: jsonEncode({'at': DateTime.now().toIso8601String(), 'data': data}),
      );

  Future<({DateTime at, dynamic data})?> cached(String key) async {
    final raw = await _secure.read(key: 'cache:$key');
    if (raw == null) return null;
    final json = jsonDecode(raw) as Map<String, dynamic>;
    return (at: DateTime.parse(json['at'] as String), data: json['data']);
  }

  /// Sign-out removes everything about the family from this phone, keeping only the language.
  Future<void> clearAccount() async {
    final language = this.language;
    await _secure.deleteAll();
    if (language != null) await setLanguage(language);
  }
}
