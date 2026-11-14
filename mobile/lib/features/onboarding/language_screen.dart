import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/school.dart';

/// First launch: choose Bangla or English. Shown in both languages because none is chosen yet.
class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(School.nameBn, style: Theme.of(context).textTheme.headlineSmall),
              Text(School.name, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 32),
              Text('ভাষা বেছে নিন / Choose your language',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              option('bn', 'বাংলা'),
              option('en', 'English'),
            ],
          ),
        ),
      ),
    );
  }
}
