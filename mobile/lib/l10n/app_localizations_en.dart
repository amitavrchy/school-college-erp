// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get chooseLanguage => 'Choose your language';

  @override
  String get continueLabel => 'Continue';

  @override
  String get signInTitle => 'Sign in';

  @override
  String get signInSubtitle => 'Use the mobile number the school has for you.';

  @override
  String get mobileNumber => 'Mobile number';

  @override
  String get sendCode => 'Send code';

  @override
  String codeSentTo(String phone) {
    return 'We sent a 6-digit code to $phone.';
  }

  @override
  String get enterCode => '6-digit code';

  @override
  String get verify => 'Verify and sign in';

  @override
  String get changeNumber => 'Change number';

  @override
  String get staffSignIn => 'Staff sign-in with email';

  @override
  String get familySignIn => 'Guardian sign-in with mobile';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign in';

  @override
  String get authCode => 'Authentication code';

  @override
  String get home => 'Home';

  @override
  String get attendance => 'Attendance';

  @override
  String get results => 'Results';

  @override
  String get fees => 'Fees';

  @override
  String get notices => 'Notices';

  @override
  String get profile => 'Profile';

  @override
  String get today => 'Today';

  @override
  String get present => 'Present';

  @override
  String get absent => 'Absent';

  @override
  String get late => 'Late';

  @override
  String get leave => 'Leave';

  @override
  String get notMarked => 'Not marked yet';

  @override
  String get totalDue => 'Total due';

  @override
  String get nothingDue => 'No dues';

  @override
  String nextDue(String date) {
    return 'Next due $date';
  }

  @override
  String attendanceRate(int percent, int days) {
    return '$percent% present (last $days school days)';
  }

  @override
  String get noResults => 'No published results yet';

  @override
  String get gpa => 'GPA';

  @override
  String get reportCard => 'Report card';

  @override
  String get invoices => 'Invoices';

  @override
  String get payments => 'Payments';

  @override
  String get receipt => 'Receipt';

  @override
  String get paid => 'Paid';

  @override
  String get due => 'Due';

  @override
  String get partial => 'Partly paid';

  @override
  String get waived => 'Waived';

  @override
  String get voided => 'Voided';

  @override
  String get noNotices => 'No notices yet';

  @override
  String get language => 'Language';

  @override
  String get signOut => 'Sign out';

  @override
  String get signOutConfirm => 'Sign out of this phone?';

  @override
  String offline(String time) {
    return 'Offline · showing what was saved at $time';
  }

  @override
  String get retry => 'Try again';

  @override
  String get somethingWrong => 'Something went wrong';

  @override
  String get updateRequired => 'Please update the app to continue.';

  @override
  String get schoolInactive =>
      'The school\'s subscription is not active. Please contact the school office.';

  @override
  String get children => 'Children';

  @override
  String classSection(String name, String section) {
    return 'Class $name, section $section';
  }

  @override
  String roll(String roll) {
    return 'Roll $roll';
  }

  @override
  String get noChildren =>
      'No students are linked to your account yet. Please contact the school office.';

  @override
  String get contactSchool => 'Contact school';

  @override
  String appVersion(String version) {
    return 'App version $version';
  }

  @override
  String get devices => 'Signed-in phones';

  @override
  String get staffNotYet =>
      'Staff features are coming in the next release. Please use the web app for now.';
}
