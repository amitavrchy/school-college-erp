# Campus One school app (Flutter)

One codebase, one Android app per school on Google Play. Release 1 is for guardians and
students: attendance, results and report cards, fees and receipts, notices. Staff can sign in
but are pointed to the web app until release 2. Plan: the "Campus One mobile app plan" doc.

## Run locally

```sh
# API on http://localhost:4000 (backend/README.md); the Android emulator reaches it at 10.0.2.2
flutter pub get
flutter run --dart-define-from-file=schools/demo.json
```

`schools/demo.json` points at the seeded demo school (`scholars`). Guardians sign in with their
mobile number; with `OTP_DEBUG=true` on the API the code is printed in the API log.

## Add a school

1. In the web app, the school's guardians need a mobile number: import students with a
   guardian phone column, then **Invite guardians** (`POST students/invite-guardians`).
2. Copy `schools/demo.json` to `schools/<slug>.json` and set:
   - `SCHOOL_SLUG` — the school's slug in Campus One
   - `APP_NAME`, `APP_NAME_BN` — store and launcher name
   - `API_URL` — production API, e.g. `https://api.example.com/api`
   - `ACCENT` — the school's colour
   - `ANDROID_APP_ID` — unique and permanent, e.g. `com.campusone.dhakamodel`
3. Launcher icon: put the school's 1024×1024 PNG at `schools/<slug>/icon.png` and run
   `dart run flutter_launcher_icons` with that path (to be scripted).
4. Build: `scripts/build-school.sh <slug>` → `build/app/outputs/bundle/release/app-release.aab`.
5. Create the app in Google Play Console under the school's name, upload the bundle to Internal
   testing first, then Production.

## Signing

Create one upload key per school app (or one shared upload key with Play App Signing) and keep it
out of git. `android/key.properties`:

```
storeFile=/secure/path/upload-<slug>.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

## Push notifications

The API already sends pushes through Firebase Cloud Messaging when `FCM_SERVICE_ACCOUNT` is set.
To turn them on in the app:

1. Create one Firebase project for Campus One; add each school's Android app (its
   `ANDROID_APP_ID`) and download its `google-services.json`.
2. Add `firebase_core` and `firebase_messaging`, the Google services Gradle plugin, and replace
   `NoPush` in `lib/core/push.dart` with an FCM implementation that calls `POST devices`
   (platform, pushToken, appVersion, locale) after sign-in and opens the matching tab on tap.

Until then the app works without push (`NoPush`).

## Privacy

- The refresh token, chosen campus and the offline copy of the last screens are kept in Android
  Keystore-backed secure storage and wiped on sign-out.
- Pushes from the API carry no names, marks or amounts.
- The Play Console Data safety form must declare: contact details, children's education records,
  payment history; not sold, not used for tracking.

## Checks

```sh
flutter analyze
flutter test
```
