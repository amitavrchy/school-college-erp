// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bengali Bangla (`bn`).
class AppLocalizationsBn extends AppLocalizations {
  AppLocalizationsBn([String locale = 'bn']) : super(locale);

  @override
  String get chooseLanguage => 'আপনার ভাষা বেছে নিন';

  @override
  String get continueLabel => 'এগিয়ে যান';

  @override
  String get signInTitle => 'সাইন ইন';

  @override
  String get signInSubtitle => 'স্কুলে দেওয়া আপনার মোবাইল নম্বর ব্যবহার করুন।';

  @override
  String get mobileNumber => 'মোবাইল নম্বর';

  @override
  String get sendCode => 'কোড পাঠান';

  @override
  String codeSentTo(String phone) {
    return '$phone নম্বরে ৬ সংখ্যার কোড পাঠানো হয়েছে।';
  }

  @override
  String get enterCode => '৬ সংখ্যার কোড';

  @override
  String get verify => 'যাচাই করে সাইন ইন';

  @override
  String get changeNumber => 'নম্বর বদলান';

  @override
  String get staffSignIn => 'শিক্ষক/কর্মী ইমেইল দিয়ে সাইন ইন';

  @override
  String get familySignIn => 'অভিভাবক মোবাইল দিয়ে সাইন ইন';

  @override
  String get email => 'ইমেইল';

  @override
  String get password => 'পাসওয়ার্ড';

  @override
  String get signIn => 'সাইন ইন';

  @override
  String get authCode => 'যাচাই কোড';

  @override
  String get home => 'হোম';

  @override
  String get attendance => 'উপস্থিতি';

  @override
  String get results => 'ফলাফল';

  @override
  String get fees => 'ফি';

  @override
  String get notices => 'নোটিশ';

  @override
  String get profile => 'প্রোফাইল';

  @override
  String get today => 'আজ';

  @override
  String get present => 'উপস্থিত';

  @override
  String get absent => 'অনুপস্থিত';

  @override
  String get late => 'দেরি';

  @override
  String get leave => 'ছুটি';

  @override
  String get notMarked => 'এখনো হাজিরা হয়নি';

  @override
  String get totalDue => 'মোট বকেয়া';

  @override
  String get nothingDue => 'কোনো বকেয়া নেই';

  @override
  String nextDue(String date) {
    return 'পরবর্তী তারিখ $date';
  }

  @override
  String attendanceRate(int percent, int days) {
    return '$percent% উপস্থিত (গত $days স্কুল দিবস)';
  }

  @override
  String get noResults => 'এখনো কোনো ফলাফল প্রকাশিত হয়নি';

  @override
  String get gpa => 'জিপিএ';

  @override
  String get reportCard => 'রিপোর্ট কার্ড';

  @override
  String get invoices => 'বিল';

  @override
  String get payments => 'পরিশোধ';

  @override
  String get receipt => 'রসিদ';

  @override
  String get paid => 'পরিশোধিত';

  @override
  String get due => 'বকেয়া';

  @override
  String get partial => 'আংশিক পরিশোধিত';

  @override
  String get waived => 'মওকুফ';

  @override
  String get voided => 'বাতিল';

  @override
  String get noNotices => 'এখনো কোনো নোটিশ নেই';

  @override
  String get language => 'ভাষা';

  @override
  String get signOut => 'সাইন আউট';

  @override
  String get signOutConfirm => 'এই ফোন থেকে সাইন আউট করবেন?';

  @override
  String offline(String time) {
    return 'অফলাইন · $time এ সংরক্ষিত তথ্য দেখানো হচ্ছে';
  }

  @override
  String get retry => 'আবার চেষ্টা করুন';

  @override
  String get somethingWrong => 'কিছু একটা সমস্যা হয়েছে';

  @override
  String get updateRequired => 'চালিয়ে যেতে অ্যাপটি আপডেট করুন।';

  @override
  String get schoolInactive =>
      'স্কুলের সাবস্ক্রিপশন চালু নেই। স্কুল অফিসে যোগাযোগ করুন।';

  @override
  String get children => 'সন্তান';

  @override
  String classSection(String name, String section) {
    return 'শ্রেণি $name, শাখা $section';
  }

  @override
  String roll(String roll) {
    return 'রোল $roll';
  }

  @override
  String get noChildren =>
      'আপনার অ্যাকাউন্টে এখনো কোনো শিক্ষার্থী যুক্ত নেই। স্কুল অফিসে যোগাযোগ করুন।';

  @override
  String get contactSchool => 'স্কুলে যোগাযোগ';

  @override
  String appVersion(String version) {
    return 'অ্যাপ সংস্করণ $version';
  }

  @override
  String get devices => 'সাইন ইন করা ফোন';

  @override
  String get staffNotYet =>
      'শিক্ষক/কর্মীদের ফিচার পরের সংস্করণে আসছে। আপাতত ওয়েব অ্যাপ ব্যবহার করুন।';
}
