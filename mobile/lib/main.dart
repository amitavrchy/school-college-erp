import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/providers.dart';
import 'core/push.dart';
import 'core/school.dart';
import 'core/store.dart';
import 'l10n/app_localizations.dart';
import 'router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([initializeDateFormatting('bn'), initializeDateFormatting('en')]);
  final store = await Store.open();
  runApp(ProviderScope(
    overrides: [storeProvider.overrideWithValue(store)],
    child: const CampusApp(),
  ));
}

class CampusApp extends ConsumerWidget {
  const CampusApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Registers this phone for push once signed in (no-op until Firebase is configured).
    ref.listen(sessionProvider, (_, session) {
      if (session.status == SessionStatus.signedIn) ref.read(pushProvider).register(ref);
    });
    final locale = ref.watch(localeProvider);
    ThemeData theme(Brightness b) => ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: School.accent, brightness: b),
          useMaterial3: true,
          // Bangla glyphs come from the bundled Noto Sans Bengali; Latin from the system font.
          fontFamilyFallback: const ['NotoSansBengali'],
        );
    return MaterialApp.router(
      title: School.name,
      debugShowCheckedModeBanner: false,
      theme: theme(Brightness.light),
      darkTheme: theme(Brightness.dark),
      locale: locale ?? const Locale('bn'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: ref.watch(routerProvider),
    );
  }
}
