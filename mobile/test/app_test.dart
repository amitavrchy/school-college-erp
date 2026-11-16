import 'package:campus_one/core/format.dart';
import 'package:campus_one/core/providers.dart';
import 'package:campus_one/core/school.dart';
import 'package:campus_one/features/attendance/attendance_screen.dart';
import 'package:campus_one/features/onboarding/language_screen.dart';
import 'package:flutter/material.dart';
import 'package:campus_one/l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('release API URLs require HTTPS and a host without credentials', () {
    expect(validReleaseApiUrl('https://school.example/api'), isTrue);
    expect(validReleaseApiUrl('http://10.0.2.2:4000/api'), isFalse);
    expect(validReleaseApiUrl('https:///api'), isFalse);
    expect(validReleaseApiUrl('https://user:pass@school.example/api'), isFalse);
  });

  test('outstanding never goes below zero and counts fines and waivers', () {
    expect(
      outstanding({
        'totalMinor': 10000,
        'fineMinor': 500,
        'waivedMinor': 1000,
        'paidMinor': 2000,
      }),
      7500,
    );
    expect(
      outstanding({
        'totalMinor': 1000,
        'fineMinor': 0,
        'waivedMinor': 0,
        'paidMinor': 3000,
      }),
      0,
    );
  });

  test('session roles are those of the chosen campus only', () {
    const session = Session(
      SessionStatus.signedIn,
      campusId: 'a',
      me: {
        'roles': [
          {'campusId': 'a', 'role': 'GUARDIAN'},
          {'campusId': 'b', 'role': 'TEACHER'},
        ],
      },
    );
    expect(session.roles, ['GUARDIAN']);
    expect(session.isFamily, isTrue);
  });

  test('attendance uses the active enrolment', () {
    final student = {
      'enrollments': [
        {
          'status': 'PROMOTED',
          'attendance': [
            {'date': '2025-12-01', 'status': 'ABSENT'},
          ],
        },
        {
          'status': 'ACTIVE',
          'attendance': [
            {'date': '2026-11-13', 'status': 'PRESENT'},
          ],
        },
      ],
    };
    expect(attendanceOf(student).single['status'], 'PRESENT');
  });

  testWidgets('first launch offers Bangla and English', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: LanguageScreen(),
        ),
      ),
    );
    expect(find.text('বাংলা'), findsOneWidget);
    expect(find.text('English'), findsOneWidget);
  });
}
