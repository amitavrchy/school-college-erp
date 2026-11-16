#!/usr/bin/env bash
# Build a signed Android release for one school: build-school.sh <slug> [apk|appbundle]
set -euo pipefail
cd "$(dirname "$0")/.."
slug="${1:?usage: scripts/build-school.sh <slug> [apk|appbundle]}"
kind="${2:-appbundle}"
case "$slug" in *[!a-z0-9-]*|'') echo "Invalid school slug" >&2; exit 1;; esac
case "$kind" in apk|appbundle) ;; *) echo "Expected apk or appbundle" >&2; exit 1;; esac
profile="schools/${slug}.json"
[ -f "$profile" ] || { echo "Missing $profile" >&2; exit 1; }
[ -f android/key.properties ] || { echo "Release signing requires android/key.properties" >&2; exit 1; }
field() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$profile" "$1"; }
app_id="$(field ANDROID_APP_ID)"
app_name="$(field APP_NAME)"
python3 - "$profile" <<'PY'
import json, sys
from urllib.parse import urlsplit
p = json.load(open(sys.argv[1]))
u = urlsplit(p['API_URL'])
if u.scheme != 'https' or not u.hostname or u.username or u.password:
    sys.exit('Release API_URL must be an HTTPS URL without credentials')
PY
case "$app_id" in *[!a-z0-9._]*|'') echo "Invalid ANDROID_APP_ID" >&2; exit 1;; esac
icon="schools/$slug/icon.png"
[ -f "$icon" ] || icon="assets/branding/icon.png"
flutter pub get
# Generate native icons for the selected school. Run again when switching schools.
cat > .launcher-icons-school.yaml <<YAML
flutter_launcher_icons:
  android: true
  ios: true
  image_path: "$icon"
  adaptive_icon_background: "#22644F"
  adaptive_icon_foreground: "$icon"
  remove_alpha_ios: true
YAML
trap 'rm -f .launcher-icons-school.yaml' EXIT
flutter pub run flutter_launcher_icons -f .launcher-icons-school.yaml
flutter build "$kind" --release --dart-define-from-file="$profile" -PappId="$app_id" -PappName="$app_name"
echo "Built $kind for $app_name ($app_id)"
