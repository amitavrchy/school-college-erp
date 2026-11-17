import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';

/// Published terms with subject marks and GPA; the school's report card PDF.
class ResultsScreen extends ConsumerWidget {
  const ResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final students = studentsOf(ref.watch(dashboardProvider).value?.data);
    final s = currentStudent(ref, students);
    if (s == null) return const Center(child: CircularProgressIndicator());
    final id = s['id'] as String;
    return Column(children: [
      ChildPicker(students: students),
      Expanded(
        child: AsyncView(
          value: ref.watch(resultsProvider(id)),
          onRetry: () => ref.invalidate(resultsProvider(id)),
          builder: (data) {
            final sessions = (data as List).cast<Map>();
            final terms = [
              for (final session in sessions)
                for (final term in (session['terms'] as List).cast<Map>()) term,
            ];
            return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: Text(t.reportCard),
                  onPressed: () async {
                    try {
                      await ref.read(apiProvider).openPdf('/students/$id/report-card', 'report-$id.pdf');
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                ),
              ),
              if (terms.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(t.noResults)),
              for (final term in terms)
                Card(
                  margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(
                          child: Text(term['term']['name'] as String,
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        Text('${t.gpa} ${(term['gpa'] as num).toStringAsFixed(2)}',
                            style: Theme.of(context).textTheme.titleMedium),
                      ]),
                      const Divider(),
                      for (final m in (term['marks'] as List).cast<Map>())
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(children: [
                            Expanded(child: Text(m['subject']['name'] as String)),
                            Text(m['isAbsent'] == true ? t.absent : '${m['marksObtained']}/${m['maxMarks']}'),
                            const SizedBox(width: 16),
                            SizedBox(
                              width: 36,
                              child: Text('${m['grade']['letter']}',
                                  textAlign: TextAlign.end,
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                            ),
                          ]),
                        ),
                    ]),
                  ),
                ),
            ]);
          },
        ),
      ),
    ]);
  }
}
