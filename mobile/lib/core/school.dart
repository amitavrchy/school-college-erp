import 'package:flutter/material.dart';

/// The school this build belongs to. Each school's app is built with its own values via
/// `--dart-define-from-file=schools/<slug>.json` (see scripts/build-school.sh).
class School {
  static const slug = String.fromEnvironment('SCHOOL_SLUG', defaultValue: 'scholars');
  static const name = String.fromEnvironment('APP_NAME', defaultValue: 'Campus One');
  static const nameBn = String.fromEnvironment('APP_NAME_BN', defaultValue: 'ক্যাম্পাস ওয়ান');
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000/api');
  static const _accent = String.fromEnvironment('ACCENT', defaultValue: '#22644F');

  static Color get accent {
    final hex = _accent.replaceFirst('#', '');
    return Color(int.tryParse('FF$hex', radix: 16) ?? 0xFF22644F);
  }

  static String displayName(Locale locale) => locale.languageCode == 'bn' ? nameBn : name;
}
