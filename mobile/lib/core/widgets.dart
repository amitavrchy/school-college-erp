import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import 'format.dart';
import 'providers.dart';

/// Shows loading, an error with retry, or the data — with an offline line when it is cached.
class AsyncView extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.onRetry, required this.builder});
  final AsyncValue<Loaded<dynamic>> value;
  final VoidCallback onRetry;
  final Widget Function(dynamic data) builder;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return value.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('$error', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: onRetry, child: Text(t.retry)),
          ]),
        ),
      ),
      data: (loaded) => Column(children: [
        if (loaded.stale)
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.secondaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(t.offline(time(context, loaded.savedAt!)),
                style: Theme.of(context).textTheme.bodySmall),
          ),
        Expanded(child: builder(loaded.data)),
      ]),
    );
  }
}

/// The children linked to this guardian (or the student themself), from the dashboard.
List<Map<String, dynamic>> studentsOf(dynamic dashboard) => [
      for (final s in (dashboard?['students'] as List? ?? const [])) Map<String, dynamic>.from(s as Map),
    ];

/// Chip row to switch between children; hidden when there is only one.
class ChildPicker extends ConsumerWidget {
  const ChildPicker({super.key, required this.students});
  final List<Map<String, dynamic>> students;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (students.length < 2) return const SizedBox.shrink();
    final selected = ref.watch(selectedStudentProvider) ?? students.first['id'];
    return SizedBox(
      height: 56,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        children: [
          for (final s in students)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(displayStudentName(context, s)),
                selected: s['id'] == selected,
                onSelected: (_) => ref.read(selectedStudentProvider.notifier).select(s['id'] as String),
              ),
            ),
        ],
      ),
    );
  }
}

String displayStudentName(BuildContext context, Map s) =>
    Localizations.localeOf(context).languageCode == 'bn' && (s['fullNameBn'] as String?)?.isNotEmpty == true
        ? s['fullNameBn'] as String
        : s['fullName'] as String;

/// The selected child, falling back to the first.
Map<String, dynamic>? currentStudent(WidgetRef ref, List<Map<String, dynamic>> students) {
  if (students.isEmpty) return null;
  final id = ref.watch(selectedStudentProvider);
  return students.firstWhere((s) => s['id'] == id, orElse: () => students.first);
}
