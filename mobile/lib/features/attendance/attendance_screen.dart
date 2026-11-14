import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';

Map? enrollmentOf(Map s) {
  final list = (s['enrollments'] as List? ?? const []).cast<Map>();
  return list.where((e) => e['status'] == 'ACTIVE').firstOrNull ?? list.firstOrNull;
}

/// Daily attendance (period 0) of the active enrolment, newest first, as the dashboard returns it.
List<Map> attendanceOf(Map s) => [for (final r in (enrollmentOf(s)?['attendance'] as List? ?? const [])) r as Map];

String statusLabel(AppLocalizations t, String status) => switch (status) {
      'PRESENT' => t.present,
      'ABSENT' => t.absent,
      'LATE' => t.late,
      'LEAVE' => t.leave,
      _ => status,
    };

Color statusColor(String status) => switch (status) {
      'PRESENT' => const Color(0xFF2E7D4F),
      'ABSENT' => const Color(0xFFC0392B),
      'LATE' => const Color(0xFFB7791F),
      _ => const Color(0xFF557ED6),
    };

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(dashboardProvider);
        await ref.read(dashboardProvider.future);
      },
      child: AsyncView(
        value: ref.watch(dashboardProvider),
        onRetry: () => ref.invalidate(dashboardProvider),
        builder: (data) {
          final students = studentsOf(data);
          final s = currentStudent(ref, students);
          if (s == null) return ListView(padding: const EdgeInsets.all(24), children: [Text(t.noChildren)]);
          final records = attendanceOf(s);
          final present = records.where((r) => r['status'] == 'PRESENT' || r['status'] == 'LATE').length;
          return ListView(children: [
            ChildPicker(students: students),
            if (records.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  t.attendanceRate((present * 100 / records.length).round(), records.length),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            for (final r in records)
              ListTile(
                leading: CircleAvatar(radius: 8, backgroundColor: statusColor(r['status'] as String)),
                title: Text(day(context, r['date'] as String)),
                trailing: Text(statusLabel(t, r['status'] as String),
                    style: TextStyle(color: statusColor(r['status'] as String), fontWeight: FontWeight.w600)),
              ),
          ]);
        },
      ),
    );
  }
}
