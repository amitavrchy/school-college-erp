import '../../core/ui/spacing.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';

/// School notices; the Bangla text is shown when the school wrote one and the app is in Bangla.
class NoticesScreen extends ConsumerWidget {
  const NoticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    return AsyncView(
      value: ref.watch(noticesProvider),
      onRetry: () => ref.invalidate(noticesProvider),
      builder: (data) {
        final notices = (data as List).cast<Map>();
        if (notices.isEmpty) return Center(child: Text(t.noNotices));
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(noticesProvider),
          child: ListView.separated(
            padding: const EdgeInsets.all(AppSpacing.page),
            itemCount: notices.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, i) {
              final n = notices[i];
              final body = localizedField(context, n, 'body');
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.page),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        localizedField(context, n, 'title'),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        day(context, n['createdAt'] as String),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      Text(body),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}
