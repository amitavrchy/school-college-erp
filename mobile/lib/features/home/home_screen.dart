import '../../core/ui/spacing.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';
import '../attendance/attendance_screen.dart';

/// Per child: today's attendance, dues, class and the latest notice.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final dashboard = ref.watch(dashboardProvider);
    final notices = ref.watch(noticesProvider).value?.data as List?;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(dashboardProvider);
        ref.invalidate(noticesProvider);
        await ref.read(dashboardProvider.future);
      },
      child: AsyncView(
        value: dashboard,
        onRetry: () => ref.invalidate(dashboardProvider),
        builder: (data) {
          final students = studentsOf(data);
          if (students.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [Text(t.noChildren)],
            );
          }
          final s = currentStudent(ref, students)!;
          final enrollment = enrollmentOf(s);
          final records = attendanceOf(s);
          final todayKey = DateTime.now().toIso8601String().substring(0, 10);
          final today = records
              .where((r) => (r['date'] as String).startsWith(todayKey))
              .firstOrNull;
          final invoices = [
            for (final i in (s['invoices'] as List? ?? const [])) i as Map,
          ];
          final due = invoices.fold<int>(0, (n, i) => n + outstanding(i));
          invoices.sort(
            (a, b) =>
                (a['dueDate'] as String).compareTo(b['dueDate'] as String),
          );
          return ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              ChildPicker(students: students),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayStudentName(context, s),
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    if (enrollment != null)
                      Text(
                        [
                          t.classSection(
                            localizedField(
                              context,
                              enrollment['section']['schoolClass'] as Map,
                              'name',
                            ),
                            localizedField(
                              context,
                              enrollment['section'] as Map,
                              'name',
                            ),
                          ),
                          if (enrollment['rollNumber'] != null)
                            t.roll(
                              number(
                                context,
                                num.tryParse('${enrollment['rollNumber']}') ??
                                    0,
                              ),
                            ),
                        ].join(' · '),
                      ),
                  ],
                ),
              ),
              _Tile(
                icon: Icons.fact_check_outlined,
                title: t.today,
                value: today == null
                    ? t.notMarked
                    : statusLabel(t, today['status'] as String),
                color: today == null
                    ? null
                    : statusColor(today['status'] as String),
              ),
              _Tile(
                icon: Icons.payments_outlined,
                title: t.totalDue,
                value: due == 0 ? t.nothingDue : taka(context, due),
                subtitle: due == 0 || invoices.isEmpty
                    ? null
                    : t.nextDue(
                        day(context, invoices.first['dueDate'] as String),
                      ),
              ),
              if (notices != null && notices.isNotEmpty)
                _Tile(
                  icon: Icons.campaign_outlined,
                  title: t.notices,
                  value: localizedField(context, notices.first as Map, 'title'),
                  subtitle: day(context, notices.first['createdAt'] as String),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.value,
    this.subtitle,
    this.color,
  });
  final IconData icon;
  final String title, value;
  final String? subtitle;
  final Color? color;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
    child: ListTile(
      leading: Icon(icon, color: color),
      title: Text(title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (subtitle != null) Text(subtitle!),
          Text(
            value,

            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(color: color),
          ),
        ],
      ),
    ),
  );
}
