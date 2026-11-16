import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/providers.dart';
import '../../core/school.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final session = ref.watch(sessionProvider);
    final config = ref.watch(appConfigProvider).value;
    final support = config?['support'] as Map?;
    return Scaffold(
      appBar: AppBar(title: Text(t.profile)),
      body: ListView(
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text(localizedField(context, session.me ?? {}, 'fullName')),
            subtitle: Text(School.displayName(Localizations.localeOf(context))),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.translate),
            title: Text(t.language),
            trailing: TextButton(
              onPressed: () => ref
                  .read(localeProvider.notifier)
                  .set(
                    Localizations.localeOf(context).languageCode == 'bn'
                        ? 'en'
                        : 'bn',
                  ),
              child: Text(
                Localizations.localeOf(context).languageCode == 'bn'
                    ? t.languageNameEn
                    : t.languageNameBn,
              ),
            ),
          ),
          if (support?['phone'] != null || support?['email'] != null)
            ListTile(
              leading: const Icon(Icons.support_agent),
              title: Text(t.contactSchool),
              subtitle: Text(
                [
                  support?['phone'],
                  support?['email'],
                ].whereType<String>().join(' · '),
              ),
            ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(t.signOut),
            onTap: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (c) => AlertDialog(
                  content: Text(t.signOutConfirm),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: Text(
                        MaterialLocalizations.of(c).cancelButtonLabel,
                      ),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: Text(t.signOut),
                    ),
                  ],
                ),
              );
              if (ok == true) {
                await ref.read(sessionProvider.notifier).signOut();
              }
            },
          ),
          FutureBuilder(
            future: PackageInfo.fromPlatform(),
            builder: (context, snap) => snap.hasData
                ? ListTile(
                    dense: true,
                    title: Text(t.appVersion(snap.data!.version)),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}
