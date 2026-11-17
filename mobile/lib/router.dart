import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/providers.dart';
import 'features/attendance/attendance_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/fees/fees_screen.dart';
import 'features/home/home_screen.dart';
import 'features/notices/notices_screen.dart';
import 'features/onboarding/language_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/results/results_screen.dart';
import 'features/shell/shell.dart';

/// Re-evaluates redirects whenever the language or session changes.
class _Refresh extends ChangeNotifier {
  _Refresh(Ref ref) {
    ref.listen(localeProvider, (_, _) => notifyListeners());
    ref.listen(sessionProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _Refresh(ref);
  return GoRouter(
    initialLocation: '/home',
    refreshListenable: refresh,
    redirect: (context, state) {
      final here = state.matchedLocation;
      if (ref.read(localeProvider) == null) return here == '/language' ? null : '/language';
      final session = ref.read(sessionProvider);
      if (session.status == SessionStatus.loading) return here == '/splash' ? null : '/splash';
      if (session.status == SessionStatus.signedOut) return here == '/login' ? null : '/login';
      if (session.me != null && !session.isFamily) return here == '/staff' ? null : '/staff';
      if (['/language', '/login', '/splash', '/staff'].contains(here)) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/language', builder: (_, _) => const LanguageScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/splash',
        builder: (_, _) => const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(path: '/staff', builder: (_, _) => const StaffPlaceholder()),
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => FamilyShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(
              routes: [GoRoute(path: '/attendance', builder: (_, _) => const AttendanceScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/results', builder: (_, _) => const ResultsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/fees', builder: (_, _) => const FeesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/notices', builder: (_, _) => const NoticesScreen())]),
        ],
      ),
    ],
  );
});
