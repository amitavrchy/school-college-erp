import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Push notifications. Release 1 ships with Firebase Cloud Messaging once each school's app is
/// registered in the Campus One Firebase project (google-services.json per app). Until then this
/// no-op keeps the rest of the app working; see mobile/README.md "Push notifications".
abstract class PushService {
  Future<void> register(WidgetRef ref);
}

class NoPush implements PushService {
  @override
  Future<void> register(WidgetRef ref) async {}
}

final pushProvider = Provider<PushService>((ref) => NoPush());
