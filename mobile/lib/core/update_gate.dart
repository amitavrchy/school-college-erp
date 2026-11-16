import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'providers.dart';
import '../l10n/app_localizations.dart';
import 'ui/spacing.dart';

/// Compares numeric release versions; build metadata does not affect precedence.
bool isBelowMinimum(String installed, String minimum) {
  List<int>? parse(String value) {
    final match = RegExp(r'^(\d+)\.(\d+)\.(\d+)(?:\+.*)?$').firstMatch(value);
    return match == null
        ? null
        : [for (var i = 1; i <= 3; i++) int.parse(match[i]!)];
  }

  final current = parse(installed);
  final required = parse(minimum);
  if (current == null || required == null) return false;
  for (var i = 0; i < 3; i++) {
    if (current[i] != required[i]) return current[i] < required[i];
  }
  return false;
}

final installedVersionProvider = FutureProvider<String>(
  (ref) async => (await PackageInfo.fromPlatform()).version,
);

/// This can be replaced at build time once the store listing is available.
const storeUrl = String.fromEnvironment(
  'APP_STORE_URL',
  defaultValue: 'https://play.google.com/store/apps',
);

class UpdateGate extends ConsumerWidget {
  const UpdateGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final version = ref.watch(installedVersionProvider);
    if (config.isLoading || version.isLoading) {
      return const Scaffold(
        body: SafeArea(child: Center(child: CircularProgressIndicator())),
      );
    }
    final minimum = config.value?['minimumVersion'];
    final current = version.value;
    if (minimum is String &&
        current != null &&
        isBelowMinimum(current, minimum)) {
      final t = AppLocalizations.of(context);
      return PopScope(
        canPop: false,
        child: Scaffold(
          body: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      t.updateTitle,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 12),
                    Text(t.updateRequired, textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () => launchUrl(
                        Uri.parse(storeUrl),
                        mode: LaunchMode.externalApplication,
                      ),
                      child: Text(t.openStore),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }
    return child;
  }
}
