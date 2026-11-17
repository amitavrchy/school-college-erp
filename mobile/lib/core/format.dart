import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

String _tag(BuildContext context) => Localizations.localeOf(context).languageCode == 'bn' ? 'bn' : 'en';

/// Money is stored in paisa; shown as Taka with the locale's digits.
String taka(BuildContext context, num minor) =>
    '৳${NumberFormat.decimalPattern(_tag(context)).format(minor / 100)}';

/// Dates from the API are calendar dates (Asia/Dhaka), sent as ISO strings.
String day(BuildContext context, String iso) =>
    DateFormat.yMMMd(_tag(context)).format(DateTime.parse(iso.substring(0, 10)));

String time(BuildContext context, DateTime t) => DateFormat.jm(_tag(context)).format(t.toLocal());

int outstanding(Map invoice) {
  final n = (invoice['totalMinor'] as num) +
      (invoice['fineMinor'] as num) -
      (invoice['waivedMinor'] as num) -
      (invoice['paidMinor'] as num);
  return n < 0 ? 0 : n.toInt();
}
