import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'school.dart';
import 'store.dart';

/// Overridden in main() once storage is open.
final storeProvider = Provider<Store>((ref) => throw UnimplementedError());
final apiProvider = Provider<Api>((ref) => Api(ref.watch(storeProvider)));

class LocaleNotifier extends Notifier<Locale?> {
  @override
  Locale? build() {
    final code = ref.read(storeProvider).language;
    return code == null ? null : Locale(code);
  }

  Future<void> set(String code) async {
    await ref.read(storeProvider).setLanguage(code);
    state = Locale(code);
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale?>(LocaleNotifier.new);

enum SessionStatus { loading, signedOut, signedIn }

class Session {
  const Session(this.status, {this.me, this.campusId});
  final SessionStatus status;
  final Map<String, dynamic>? me;
  final String? campusId;

  List<String> get roles => [
        for (final r in (me?['roles'] as List? ?? const []))
          if (r['campusId'] == campusId) r['role'] as String,
      ];
  bool get isFamily => roles.any((r) => r == 'GUARDIAN' || r == 'STUDENT');
  String get fullName => (me?['fullName'] as String?) ?? '';
}

/// Signs in and out, and restores the session at start using the stored refresh token.
class SessionNotifier extends Notifier<Session> {
  Api get _api => ref.read(apiProvider);
  Store get _store => ref.read(storeProvider);

  @override
  Session build() {
    _api.onSessionEnded = () async {
      await _store.clearAccount();
      _api.accessToken = null;
      state = const Session(SessionStatus.signedOut);
    };
    Future.microtask(restore);
    return const Session(SessionStatus.loading);
  }

  Future<void> restore() async {
    if (await _store.refreshToken == null || !await _api.renew()) {
      state = const Session(SessionStatus.signedOut);
      return;
    }
    await _load(await _store.read('campus_id'));
  }

  Future<void> _load(String? preferredCampus) async {
    try {
      _api.campusId = preferredCampus;
      final me = Map<String, dynamic>.from(await _api.get('/auth/me') as Map);
      final campuses = [for (final r in (me['roles'] as List)) r['campusId'] as String];
      final campus = campuses.contains(preferredCampus) ? preferredCampus : campuses.firstOrNull;
      _api.campusId = campus;
      await _store.write('campus_id', campus);
      state = Session(SessionStatus.signedIn, me: me, campusId: campus);
    } on ApiException catch (e) {
      // Offline at start: stay signed in and let screens show cached data.
      if (e.offline) {
        state = Session(SessionStatus.signedIn, campusId: preferredCampus);
      } else {
        state = const Session(SessionStatus.signedOut);
      }
    }
  }

  Future<void> requestCode(String phone) => _api.post(
        '/auth/codes',
        {'purpose': 'GUARDIAN_LOGIN', 'contact': phone, 'school': School.slug},
        false,
      );

  Future<void> signInWithCode(String phone, String code) async {
    final tokens = await _api.post('/auth/token/otp',
        {'school': School.slug, 'contact': phone, 'code': code, 'deviceName': 'Android phone'}, false);
    await _finish(Map<String, dynamic>.from(tokens as Map));
  }

  /// Returns a two-step challenge when the account has an authenticator app, else signs in.
  Future<String?> signInWithPassword(String email, String password) async {
    final result = Map<String, dynamic>.from(await _api.post('/auth/token',
        {'school': School.slug, 'email': email, 'password': password, 'deviceName': 'Android phone'},
        false) as Map);
    if (result['mfaRequired'] == true) return result['challenge'] as String;
    await _finish(result);
    return null;
  }

  Future<void> signInWithMfa(String challenge, String code) async {
    final tokens = await _api.post('/auth/token/mfa', {'challenge': challenge, 'code': code}, false);
    await _finish(Map<String, dynamic>.from(tokens as Map));
  }

  Future<void> _finish(Map<String, dynamic> tokens) async {
    await _api.useTokens(tokens);
    final campuses = tokens['campuses'] as List? ?? const [];
    await _load(campuses.isEmpty ? null : campuses.first['id'] as String);
  }

  Future<void> switchCampus(String campusId) => _load(campusId);

  Future<void> signOut() async {
    final token = await _store.refreshToken;
    if (token != null) {
      try {
        await _api.post('/auth/token/revoke', {'refreshToken': token}, false);
      } catch (_) {
        // Signing out locally still works offline; the server session expires on its own.
      }
    }
    await _store.clearAccount();
    _api.accessToken = null;
    _api.campusId = null;
    state = const Session(SessionStatus.signedOut);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, Session>(SessionNotifier.new);

/// The child whose data the family screens show.
class SelectedStudent extends Notifier<String?> {
  @override
  String? build() {
    ref.read(storeProvider).read('student_id').then((id) {
      if (id != null && state == null) state = id;
    });
    return null;
  }

  Future<void> select(String id) async {
    state = id;
    await ref.read(storeProvider).write('student_id', id);
  }
}

final selectedStudentProvider = NotifierProvider<SelectedStudent, String?>(SelectedStudent.new);

/// API data with an offline fallback: the last good response is kept in secure storage.
class Loaded<T> {
  Loaded(this.data, {this.savedAt});
  final T data;
  final DateTime? savedAt;
  bool get stale => savedAt != null;
}

Future<Loaded<dynamic>> cachedGet(Ref ref, String key, String path) async {
  final api = ref.read(apiProvider);
  final store = ref.read(storeProvider);
  try {
    final data = await api.get(path);
    await store.cache(key, data);
    return Loaded(data);
  } on ApiException catch (e) {
    if (!e.offline) rethrow;
    final saved = await store.cached(key);
    if (saved == null) rethrow;
    return Loaded(saved.data, savedAt: saved.at);
  }
}

final dashboardProvider = FutureProvider.autoDispose<Loaded<dynamic>>(
    (ref) => cachedGet(ref, 'dashboard', '/guardians/me/dashboard'));
final noticesProvider =
    FutureProvider.autoDispose<Loaded<dynamic>>((ref) => cachedGet(ref, 'notices', '/notices'));
final invoicesProvider = FutureProvider.autoDispose<Loaded<dynamic>>(
    (ref) => cachedGet(ref, 'invoices', '/fees/invoices'));
final paymentsProvider = FutureProvider.autoDispose<Loaded<dynamic>>(
    (ref) => cachedGet(ref, 'payments', '/payments'));
final resultsProvider = FutureProvider.autoDispose.family<Loaded<dynamic>, String>(
    (ref, studentId) => cachedGet(ref, 'results:$studentId', '/exams/results/$studentId'));
final appConfigProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  try {
    return Map<String, dynamic>.from(
        await ref.read(apiProvider).get('/app/config', query: {'school': School.slug}) as Map);
  } catch (_) {
    return null;
  }
});
