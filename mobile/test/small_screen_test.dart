import 'package:campus_one/core/providers.dart';
import 'package:campus_one/core/store.dart';
import 'package:campus_one/features/auth/login_screen.dart';
import 'package:campus_one/features/onboarding/language_screen.dart';
import 'package:campus_one/features/home/home_screen.dart';
import 'package:campus_one/features/attendance/attendance_screen.dart';
import 'package:campus_one/features/results/results_screen.dart';
import 'package:campus_one/features/fees/fees_screen.dart';
import 'package:campus_one/features/notices/notices_screen.dart';
import 'package:campus_one/features/profile/profile_screen.dart';
import 'package:campus_one/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final language in ['en', 'bn']) {
    testWidgets('screens fit a narrow display at 1.4 scale in $language', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      await initializeDateFormatting(language);
      final store = await Store.open();
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final student = {
        'id': '1',
        'fullName': 'A long student name',
        'fullNameBn': 'একটি দীর্ঘ শিক্ষার্থীর নাম',
        'enrollments': <Map>[],
        'invoices': <Map>[],
      };
      final dashboard = {
        'students': [
          student,
          {...student, 'id': '2'},
        ],
      };
      final screens = <Widget>[
        const LanguageScreen(),
        const LoginScreen(),
        const HomeScreen(),
        const AttendanceScreen(),
        const ResultsScreen(),
        const FeesScreen(),
        const NoticesScreen(),
        const ProfileScreen(),
      ];
      for (final screen in screens) {
        await tester.pumpWidget(
          ProviderScope(
            key: UniqueKey(),
            overrides: [
              storeProvider.overrideWithValue(store),
              dashboardProvider.overrideWith((ref) async => Loaded(dashboard)),
              noticesProvider.overrideWith((ref) async => Loaded(<Map>[])),
              invoicesProvider.overrideWith((ref) async => Loaded(<Map>[])),
              paymentsProvider.overrideWith((ref) async => Loaded(<Map>[])),
              resultsProvider('1').overrideWith((ref) async => Loaded(<Map>[])),
              appConfigProvider.overrideWith((ref) async => null),
            ],
            child: MaterialApp(
              locale: Locale(language),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: const TextScaler.linear(1.4)),
                child: child!,
              ),
              home: Scaffold(body: screen),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          tester.takeException(),
          isNull,
          reason: '${screen.runtimeType} in $language',
        );
        if (screen is LoginScreen) {
          final t = lookupAppLocalizations(Locale(language));
          await tester.tap(find.text(t.staffSignIn));
          await tester.pump();
          expect(
            tester.takeException(),
            isNull,
            reason: 'Staff sign in in $language',
          );
        }
      }
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
