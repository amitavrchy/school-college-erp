import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/school.dart';
import '../../l10n/app_localizations.dart';

/// Guardians and students sign in with their mobile number and a one-time code; staff can switch
/// to email and password (plus a two-step code when they have one).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _staff = false, _busy = false, _codeSent = false;
  String? _error, _challenge;

  @override
  void dispose() {
    for (final c in [_phone, _code, _email, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  SessionNotifier get _session => ref.read(sessionProvider.notifier);

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final field = <Widget>[];
    if (!_staff && !_codeSent) {
      field.addAll([
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: InputDecoration(labelText: t.mobileNumber, hintText: '01XXXXXXXXX'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    await _session.requestCode(_phone.text.trim());
                    setState(() => _codeSent = true);
                  }),
          child: Text(t.sendCode),
        ),
      ]);
    } else if (!_staff) {
      field.addAll([
        Text(t.codeSentTo(_phone.text.trim())),
        const SizedBox(height: 12),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
          decoration: InputDecoration(labelText: t.enterCode),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy
              ? null
              : () => _run(() => _session.signInWithCode(_phone.text.trim(), _code.text.trim())),
          child: Text(t.verify),
        ),
        TextButton(onPressed: () => setState(() => _codeSent = false), child: Text(t.changeNumber)),
      ]);
    } else if (_challenge == null) {
      field.addAll([
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: InputDecoration(labelText: t.email),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(labelText: t.password),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy
              ? null
              : () => _run(() async {
                    final challenge =
                        await _session.signInWithPassword(_email.text.trim(), _password.text);
                    if (challenge != null) setState(() => _challenge = challenge);
                  }),
          child: Text(t.signIn),
        ),
      ]);
    } else {
      field.addAll([
        TextField(
          controller: _code,
          decoration: InputDecoration(labelText: t.authCode),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : () => _run(() => _session.signInWithMfa(_challenge!, _code.text.trim())),
          child: Text(t.verify),
        ),
      ]);
    }
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 32),
            CircleAvatar(
              radius: 32,
              backgroundColor: School.accent,
              child: const Icon(Icons.school, color: Colors.white, size: 32),
            ),
            const SizedBox(height: 16),
            Text(School.displayName(locale), style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(t.signInSubtitle),
            const SizedBox(height: 24),
            ...field,
            if (_busy) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => setState(() {
                _staff = !_staff;
                _challenge = null;
                _code.clear();
                _error = null;
              }),
              child: Text(_staff ? t.familySignIn : t.staffSignIn),
            ),
          ],
        ),
      ),
    );
  }
}
