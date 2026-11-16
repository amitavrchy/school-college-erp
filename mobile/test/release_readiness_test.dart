import 'dart:convert';

import 'package:campus_one/core/api.dart';
import 'package:campus_one/core/providers.dart';
import 'package:campus_one/core/store.dart';
import 'package:campus_one/core/update_gate.dart';
import 'package:campus_one/core/widgets.dart';
import 'package:campus_one/l10n/app_localizations.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Adapter implements HttpClientAdapter {
  Adapter(this.handle);
  final Future<ResponseBody> Function(RequestOptions) handle;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) => handle(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody response(int status, Object data) => ResponseBody.fromString(
  jsonEncode(data),
  status,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
  },
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('compares release version components and ignores build metadata', () {
    expect(isBelowMinimum('1.9.9', '1.10.0'), isTrue);
    expect(isBelowMinimum('2.0.0', '1.10.0'), isFalse);
    expect(isBelowMinimum('1.0.0+5', '1.0.0'), isFalse);
    expect(isBelowMinimum('invalid', '1.0.0'), isFalse);
  });

  testWidgets('minimum version blocks app; current version allows it', (
    tester,
  ) async {
    Future<void> show(String version) async {
      await tester.pumpWidget(
        ProviderScope(
          key: ValueKey(version),
          overrides: [
            appConfigProvider.overrideWith(
              (ref) async => {'minimumVersion': '1.2.0'},
            ),
            installedVersionProvider.overrideWith((ref) async => version),
          ],
          child: const MaterialApp(
            home: UpdateGate(child: Text('App content')),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await show('1.1.9');
    expect(find.text('Update required'), findsOneWidget);
    expect(find.text('Open app store'), findsOneWidget);
    expect(find.text('App content'), findsNothing);
    await show('1.2.0');
    expect(find.text('App content'), findsOneWidget);
  });

  test(
    'migrates preference tokens once and preserves existing secure tokens',
    () async {
      SharedPreferences.setMockInitialValues({
        'access_token': 'old-access',
        'refreshToken': 'old-refresh',
      });
      final store = await Store.open();
      expect(await store.accessToken, 'old-access');
      expect(await store.refreshToken, 'old-refresh');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.containsKey('access_token'), isFalse);
      expect(prefs.containsKey('refreshToken'), isFalse);
      await prefs.setString('access_token', 'stale');
      await store.migrateTokens();
      expect(await store.accessToken, 'old-access');
      expect(prefs.containsKey('access_token'), isFalse);
    },
  );

  for (final status in [0, 500, 401]) {
    test('restore handles refresh status $status', () async {
      final store = await Store.open();
      await store.setRefreshToken('refresh');
      await store.setAccessToken('access');
      await store.write('campus_id', 'a');
      await store.cache('session_me', {
        'roles': [
          {'campusId': 'a', 'role': 'GUARDIAN'},
        ],
      });
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.httpClientAdapter = Adapter((options) async {
        if (status == 0) {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
          );
        }
        return response(status, {'message': 'error'});
      });
      final api = Api(store, dio: dio);
      final container = ProviderContainer(
        overrides: [
          storeProvider.overrideWithValue(store),
          apiProvider.overrideWithValue(api),
        ],
      );
      addTearDown(container.dispose);
      container.read(sessionProvider);
      await container.read(sessionProvider.notifier).restore();
      final session = container.read(sessionProvider);
      expect(
        session.status,
        status == 401 ? SessionStatus.signedOut : SessionStatus.signedIn,
      );
      expect(await store.refreshToken, status == 401 ? null : 'refresh');
      if (status != 401) expect(session.isFamily, isTrue);
    });
  }

  test('401 followed by temporary refresh failure preserves session; rejected refresh ends it', () async {
    final store = await Store.open();
    await store.setRefreshToken('refresh');
    var refreshStatus = 500;
    var ended = 0;
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.httpClientAdapter = Adapter(
      (options) async => response(
        options.path == '/auth/refresh' ? refreshStatus : 401,
        {'message': 'failed'},
      ),
    );
    final api = Api(store, dio: dio)
      ..onSessionEnded = () async {
        ended++;
      };
    await expectLater(api.get('/private'), throwsA(isA<ApiException>()));
    expect(ended, 0);
    refreshStatus = 401;
    await expectLater(api.get('/private'), throwsA(isA<ApiException>()));
    expect(ended, 1);
  });

  test('cachedGet returns saved data for network and server errors', () async {
    final store = await Store.open();
    await store.cache('campus-a:dashboard', {'name': 'saved'});
    var status = 0;
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.httpClientAdapter = Adapter((options) async {
      if (status == 0) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      }
      return response(status, {'message': 'error'});
    });
    final api = Api(store, dio: dio);
    api.campusId = 'campus-a';
    final provider = FutureProvider(
      (ref) => cachedGet(ref, 'dashboard', '/dashboard'),
    );
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        storeProvider.overrideWithValue(store),
        apiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(container.dispose);
    for (final code in [0, 500]) {
      status = code;
      container.invalidate(provider);
      final result = await container.read(provider.future);
      expect(result.data['name'], 'saved');
      expect(result.stale, isTrue);
    }
    api.campusId = 'campus-b';
    container.invalidate(provider);
    await expectLater(container.read(provider.future), throwsA(isA<ApiException>()));
  });

  testWidgets('cached data appears with offline banner', (tester) async {
    final saved = DateTime(2026, 1, 1, 12);
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AsyncView(
            value: AsyncValue.data(Loaded('Saved content', savedAt: saved)),
            onRetry: () {},
            builder: (data) => Text(data as String),
          ),
        ),
      ),
    );
    expect(find.text('Saved content'), findsOneWidget);
    expect(find.textContaining('Offline'), findsOneWidget);
  });
}
