#!/usr/bin/env bash
# Builds one school's Android app for Google Play.
#   scripts/build-school.sh <slug> [apk|appbundle]
# Reads schools/<slug>.json (SCHOOL_SLUG, APP_NAME, APP_NAME_BN, API_URL, ACCENT, ANDROID_APP_ID).
set -euo pipefail
cd "$(dirname "$0")/.."
slug="${1:?usage: scripts/build-school.sh <slug> [apk|appbundle]}"
kind="${2:-appbundle}"
profile="schools/${slug}.json"
[ -f "$profile" ] || { echo "Missing $profile" >&2; exit 1; }
field() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$profile" "$1"; }
app_id="$(field ANDROID_APP_ID)"
app_name="$(field APP_NAME)"
case "$app_id" in *[!a-z0-9._]*|'') echo "ANDROID_APP_ID must be lower-case letters, digits and dots" >&2; exit 1;; esac
flutter pub get
flutter build "$kind" --release \
  --dart-define-from-file="$profile" \
  -PappId="$app_id" -PappName="$app_name"
echo "Built $kind for $app_name ($app_id)"
