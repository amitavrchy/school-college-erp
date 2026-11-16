import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('both ARB catalogs contain translated values for every key', () {
    Map<String, dynamic> read(String locale) =>
        jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync())
            as Map<String, dynamic>;
    final en = read('en'), bn = read('bn');
    final keys = en.keys.where((k) => !k.startsWith('@')).toSet();
    expect(bn.keys.where((k) => !k.startsWith('@')).toSet(), keys);
    const shared = {'languageNameBn', 'languageNameEn', 'phoneExample'};
    for (final key in keys.difference(shared)) {
      expect(bn[key], isNotEmpty, reason: key);
      expect(bn[key], isNot(en[key]), reason: key);
    }
  });

  test('feature widgets do not embed visible string literals', () {
    final pattern = RegExp(
      r'''(?:Text|labelText|hintText|tooltip|semanticLabel)\s*(?:\(|:)\s*(?:const\s+)?['"]([^'"]+)['"]''',
    );
    final violations = <String>[];
    for (final file
        in Directory('lib/features')
            .listSync(recursive: true)
            .whereType<File>()
            .where((f) => f.path.endsWith('.dart'))) {
      final source = file.readAsStringSync();
      for (final match in pattern.allMatches(source)) {
        // Interpolated values are composed from localized labels or server data.
        if (!match.group(1)!.startsWith(r'$')) {
          violations.add('${file.path}: ${match.group(0)}');
        }
      }
    }
    expect(violations, isEmpty);
  });
}
