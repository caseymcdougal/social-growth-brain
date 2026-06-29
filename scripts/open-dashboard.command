#!/bin/zsh
set -u

REPO_DIR="/Users/caseymcdougal/dev/personal/social-audit-dashboard"
API_PORT="4174"
WEB_PORT="5175"
DASHBOARD_URL="http://127.0.0.1:${WEB_PORT}/"
LOG_DIR="${TMPDIR:-/tmp}/social-audit-dashboard"
LAUNCHD_DIR="$LOG_DIR/launchd"
USER_ID="$(id -u)"
API_LABEL="com.casey.social-audit-dashboard.api"
WEB_LABEL="com.casey.social-audit-dashboard.web"
API_PLIST="$LAUNCHD_DIR/${API_LABEL}.plist"
WEB_PLIST="$LAUNCHD_DIR/${WEB_LABEL}.plist"
DASHBOARD_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin"

export PATH="$DASHBOARD_PATH"
BROWSER_HARNESS_BIN="$(command -v browser-harness || true)"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR" || exit 1

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-40}"
  local delay="${3:-0.25}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

write_launchd_plists() {
  mkdir -p "$LAUNCHD_DIR"

  cat > "$API_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${API_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>-i</string>
    <string>HOME=${HOME}</string>
    <string>USER=${USER}</string>
    <string>LOGNAME=${USER}</string>
    <string>SHELL=/bin/zsh</string>
    <string>PATH=${DASHBOARD_PATH}</string>
    <string>BROWSER_HARNESS_BIN=${BROWSER_HARNESS_BIN}</string>
    <string>PORT=${API_PORT}</string>
    <string>SOCIAL_AUDIT_DATA_DIR=${REPO_DIR}/data</string>
    <string>npm</string>
    <string>run</string>
    <string>start:api</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/api.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/api.log</string>
</dict>
</plist>
PLIST

  cat > "$WEB_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${WEB_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>-i</string>
    <string>HOME=${HOME}</string>
    <string>USER=${USER}</string>
    <string>LOGNAME=${USER}</string>
    <string>SHELL=/bin/zsh</string>
    <string>PATH=${DASHBOARD_PATH}</string>
    <string>npm</string>
    <string>run</string>
    <string>preview:web</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/web.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/web.log</string>
</dict>
</plist>
PLIST

  chmod 600 "$API_PLIST" "$WEB_PLIST"
  plutil -lint "$API_PLIST" "$WEB_PLIST" >/dev/null || exit 1
}

launchd_service_loaded() {
  launchctl print "gui/${USER_ID}/$1" >/dev/null 2>&1
}

service_or_stable_url_ready() {
  local label="$1"
  local url="$2"

  if ! wait_for_url "$url" 1 0.1; then
    return 1
  fi

  if launchd_service_loaded "$label"; then
    return 0
  fi

  sleep 1
  wait_for_url "$url" 1 0.1
}

start_launchd_service() {
  local label="$1"
  local plist="$2"

  if launchd_service_loaded "$label"; then
    launchctl bootout "gui/${USER_ID}/${label}" >/dev/null 2>&1 || true
  fi

  launchctl bootstrap "gui/${USER_ID}" "$plist"
}

if [ ! -d "$REPO_DIR/node_modules" ]; then
  echo "Installing dashboard dependencies..."
  npm install || exit 1
fi

if ! node -e 'require("better-sqlite3")' > "$LOG_DIR/native-check.log" 2>&1; then
  echo "Rebuilding native dashboard dependencies for $(node -v)..."
  npm rebuild better-sqlite3 || exit 1
fi

if [ ! -f "$REPO_DIR/dist/index.html" ] || find "$REPO_DIR/src" "$REPO_DIR/index.html" "$REPO_DIR/vite.config.ts" "$REPO_DIR/package.json" -type f -newer "$REPO_DIR/dist/index.html" -print -quit | grep -q .; then
  echo "Building the dashboard preview..."
  npm run build || exit 1
fi

write_launchd_plists

if ! service_or_stable_url_ready "$API_LABEL" "http://127.0.0.1:${API_PORT}/api/health"; then
  if port_is_listening "$API_PORT"; then
    echo "Port ${API_PORT} is already in use, but it is not the social audit API."
    echo "Stop that process first, then run this launcher again."
    exit 1
  fi

  echo "Starting social audit API on port ${API_PORT}..."
  start_launchd_service "$API_LABEL" "$API_PLIST" || exit 1
fi

if ! wait_for_url "http://127.0.0.1:${API_PORT}/api/health" 80 0.25; then
  echo "The social audit API did not start. Log: $LOG_DIR/api.log"
  exit 1
fi

if ! service_or_stable_url_ready "$WEB_LABEL" "$DASHBOARD_URL"; then
  if port_is_listening "$WEB_PORT"; then
    echo "Port ${WEB_PORT} is already in use, but the dashboard did not respond."
    echo "Stop that process first, then run this launcher again."
    exit 1
  fi

  echo "Starting dashboard preview on port ${WEB_PORT}..."
  start_launchd_service "$WEB_LABEL" "$WEB_PLIST" || exit 1
fi

if ! wait_for_url "$DASHBOARD_URL" 80 0.25; then
  echo "The dashboard preview did not start. Log: $LOG_DIR/web.log"
  exit 1
fi

echo "Opening Social Audit Dashboard..."
open "$DASHBOARD_URL"
echo "Dashboard: $DASHBOARD_URL"
echo "Logs: $LOG_DIR"
