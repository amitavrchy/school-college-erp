import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/school.dart';
import '../../l10n/app_localizations.dart';
import '../../core/ui/spacing.dart';

/// First launch: choose Bangla or English. Shown in both languages because none is chosen yet.
class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    Widget option(String code, String label) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: FilledButton.tonal(
          onPressed: () => ref.read(localeProvider.notifier).set(code),
          child: Text(label, style: const TextStyle(fontSize: 18)),
        ),
      ),
    );
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: AppSpacing.pagePadding,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                School.nameBn,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(School.name, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.xl),
              Text(
                lookupAppLocalizations(const Locale('bn')).chooseLanguage,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                lookupAppLocalizations(const Locale('en')).chooseLanguage,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.page),
              option('bn', t.languageNameBn),
              option('en', t.languageNameEn),
            ],
          ),
        ),
      ),
    );
  }
}
