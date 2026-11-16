import 'dart:convert';

import 'package:campus_one/core/api.dart';
import 'package:campus_one/core/providers.dart';
import 'package:campus_one/core/store.dart';
import 'package:campus_one/features/auth/login_screen.dart';
import 'package:campus_one/features/onboarding/language_screen.dart';
import 'package:campus_one/l10n/app_localizations.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CodeAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? body,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode({}),
    200,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
  @override
  void close({bool force = false}) {}
}

// Only the first-launch picker may show a prompt in the inactive locale.
const bilingualTextAllowlist = <Type, Set<String>>{
  LanguageScreen: {'আপনার ভাষা বেছে নিন', 'Choose your language'},
};

void expectOtherLanguageText(Type screen, String text) {
  expect(
    find.text(text),
    bilingualTextAllowlist[screen]?.contains(text) == true
        ? findsOneWidget
        : findsNothing,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final language in ['bn', 'en']) {
    testWidgets('picker prompts in both languages in $language', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            locale: Locale(language),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const LanguageScreen(),
          ),
        ),
      );
      final active = lookupAppLocalizations(Locale(language));
      final other = lookupAppLocalizations(
        Locale(language == 'bn' ? 'en' : 'bn'),
      );
      expect(find.text(active.chooseLanguage), findsOneWidget);
      expectOtherLanguageText(LanguageScreen, other.chooseLanguage);
    });

    testWidgets('sign in spacing and localization in $language', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      final store = await Store.open();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
        ..httpClientAdapter = CodeAdapter();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            storeProvider.overrideWithValue(store),
            apiProvider.overrideWithValue(Api(store, dio: dio)),
          ],
          child: MaterialApp(
            locale: Locale(language),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const LoginScreen(),
          ),
        ),
      );
      final t = lookupAppLocalizations(Locale(language));
      final other = lookupAppLocalizations(
        Locale(language == 'bn' ? 'en' : 'bn'),
      );
      final subtitle = find.text(t.signInSubtitle);
      expect(subtitle, findsOneWidget);
      expectOtherLanguageText(LoginScreen, other.signInSubtitle);
      final text = tester.widget<Text>(subtitle);
      expect(
        text.style!.fontSize,
        Theme.of(tester.element(subtitle)).textTheme.bodyMedium!.fontSize,
      );
      expect(text.style!.height, greaterThanOrEqualTo(1.4));
      final title = find.byType(
        CircleAvatar,
      ); // School name follows the avatar.
      final titleText = find
          .descendant(of: find.byType(ListView), matching: find.byType(Text))
          .first;
      expect(title, findsOneWidget);
      expect(
        tester.getTopLeft(subtitle).dy - tester.getBottomLeft(titleText).dy,
        8,
      );
      void checkForm(String button, String link, {Finder? beforeField}) {
        final first = beforeField ?? find.byType(TextField).first;
        expect(
          tester.getTopLeft(first).dy - tester.getBottomLeft(subtitle).dy,
          24,
        );
        final field = find.byType(TextField).last;
        final primary = find.widgetWithText(FilledButton, button);
        expect(
          tester.getTopLeft(primary).dy - tester.getBottomLeft(field).dy,
          16,
        );
        expect(
          tester.getTopLeft(find.widgetWithText(TextButton, link)).dy -
              tester.getBottomLeft(primary).dy,
          12,
        );
      }

      checkForm(t.sendCode, t.staffSignIn);
      await tester.enterText(find.byType(TextField), '01700000000');
      await tester.tap(find.text(t.sendCode));
      await tester.pumpAndSettle();
      checkForm(
        t.verify,
        t.changeNumber,
        beforeField: find.text(t.codeSentTo('01700000000')),
      );
      await tester.tap(find.text(t.staffSignIn));
      await tester.pumpAndSettle();
      checkForm(t.signIn, t.familySignIn);
    });
  }
}
