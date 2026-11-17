import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/school.dart';
import '../../l10n/app_localizations.dart';

/// Bottom tabs for guardians and students.
class FamilyShell extends ConsumerWidget {
  const FamilyShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final config = ref.watch(appConfigProvider).value;
    return Scaffold(
      appBar: AppBar(
        title: Text(School.displayName(Localizations.localeOf(context))),
        actions: [
          IconButton(
            tooltip: t.profile,
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      body: Column(children: [
        if (config != null && config['active'] == false)
          MaterialBanner(content: Text(t.schoolInactive), actions: const [SizedBox.shrink()]),
        Expanded(child: shell),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), label: t.home),
          NavigationDestination(icon: const Icon(Icons.fact_check_outlined), label: t.attendance),
          NavigationDestination(icon: const Icon(Icons.school_outlined), label: t.results),
          NavigationDestination(icon: const Icon(Icons.payments_outlined), label: t.fees),
          NavigationDestination(icon: const Icon(Icons.campaign_outlined), label: t.notices),
        ],
      ),
    );
  }
}

/// Staff accounts can sign in, but their screens arrive in release 2.
class StaffPlaceholder extends ConsumerWidget {
  const StaffPlaceholder({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(School.displayName(Localizations.localeOf(context)))),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.staffNotYet),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: () => ref.read(sessionProvider.notifier).signOut(), child: Text(t.signOut)),
        ]),
      ),
    );
  }
}
