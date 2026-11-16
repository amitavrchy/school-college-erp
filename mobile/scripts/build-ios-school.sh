#!/usr/bin/env bash
# Prepare and build an unsigned iOS release using a school profile.
set -euo pipefail
cd "$(dirname "$0")/.."
slug="${1:?usage: scripts/build-ios-school.sh <slug>}"
case "$slug" in *[!a-z0-9-]*|'') echo "Invalid school slug" >&2; exit 1;; esac
profile="schools/$slug.json"
python3 - "$profile" <<'PY'
import json, re, sys
from pathlib import Path
from urllib.parse import urlsplit
p = json.load(open(sys.argv[1]))
u = urlsplit(p['API_URL'])
if u.scheme != 'https' or not u.hostname or u.username or u.password:
    sys.exit('Release API_URL must be an HTTPS URL without credentials')
if not re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', p['APP_ID_IOS']):
    sys.exit('Invalid APP_ID_IOS')
if any(c in p['APP_NAME'] for c in '\r\n/#$'):
    sys.exit('Unsupported character in APP_NAME')
Path('ios/Flutter/School.xcconfig').write_text('APP_ID_IOS = ' + p['APP_ID_IOS'] + '\nAPP_DISPLAY_NAME = ' + p['APP_NAME'] + '\n')
PY
trap 'rm -f ios/Flutter/School.xcconfig .launcher-icons-school.yaml' EXIT
icon="schools/$slug/icon.png"
[ -f "$icon" ] || icon="assets/branding/icon.png"
flutter pub get
cat > .launcher-icons-school.yaml <<YAML
flutter_launcher_icons:
  android: true
  ios: true
  image_path: "$icon"
  adaptive_icon_background: "#22644F"
  adaptive_icon_foreground: "$icon"
  remove_alpha_ios: true
YAML
dart run flutter_launcher_icons -f .launcher-icons-school.yaml
(cd ios && pod install)
flutter build ios --release --no-codesign --dart-define-from-file="$profile"
