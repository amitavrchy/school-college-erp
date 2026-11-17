import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/providers.dart';
import '../../core/widgets.dart';
import '../../l10n/app_localizations.dart';

/// Invoices with what is still owed, and payments with their receipt PDFs.
class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key});

  String _status(AppLocalizations t, String s) => switch (s) {
        'PAID' => t.paid,
        'PARTIAL' => t.partial,
        'WAIVED' => t.waived,
        'VOIDED' => t.voided,
        'SUCCESS' => t.paid,
        _ => t.due,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final students = studentsOf(ref.watch(dashboardProvider).value?.data);
    final s = currentStudent(ref, students);
    final payments = ref.watch(paymentsProvider).value?.data as List?;
    return DefaultTabController(
      length: 2,
      child: Column(children: [
        ChildPicker(students: students),
        TabBar(tabs: [Tab(text: t.invoices), Tab(text: t.payments)]),
        Expanded(
          child: TabBarView(children: [
            AsyncView(
              value: ref.watch(invoicesProvider),
              onRetry: () => ref.invalidate(invoicesProvider),
              builder: (data) {
                final list = [
                  for (final i in (data as List).cast<Map>())
                    if (s == null || i['studentId'] == s['id']) i,
                ]..sort((a, b) => (b['dueDate'] as String).compareTo(a['dueDate'] as String));
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(invoicesProvider),
                  child: ListView(children: [
                    for (final i in list)
                      ListTile(
                        title: Text((i['lines'] as List).map((l) => l['feeHeadName']).join(', ')),
                        subtitle: Text('${day(context, i['dueDate'] as String)} · ${_status(t, i['status'] as String)}'),
                        trailing: Text(
                          taka(context, outstanding(i) > 0 ? outstanding(i) : i['totalMinor'] as num),
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: outstanding(i) > 0 ? Theme.of(context).colorScheme.error : null,
                          ),
                        ),
                      ),
                  ]),
                );
              },
            ),
            ListView(children: [
              for (final p in (payments ?? const []).cast<Map>())
                if (s == null || p['studentId'] == s['id'])
                  ListTile(
                    title: Text(taka(context, p['amountMinor'] as num)),
                    subtitle: Text([
                      if (p['receiptNo'] != null) p['receiptNo'],
                      day(context, (p['paidAt'] ?? p['createdAt']) as String),
                      _status(t, p['status'] as String),
                    ].join(' · ')),
                    trailing: ['SUCCESS', 'VOIDED'].contains(p['status'])
                        ? IconButton(
                            tooltip: t.receipt,
                            icon: const Icon(Icons.receipt_long_outlined),
                            onPressed: () async {
                              try {
                                await ref.read(apiProvider).openPdf(
                                    '/payments/${p['id']}/receipt', 'receipt-${p['receiptNo'] ?? p['id']}.pdf');
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                }
                              }
                            },
                          )
                        : null,
                  ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
