#!/bin/sh
# Sends one event to a deskmates office on another machine. Never fails and never takes more than ~1 s,
# so it is safe inside CI jobs and deploy scripts.
#
#   DESKMATES_URL=http://192.168.1.20:47821  (office running with `deskmates serve --lan`)
#   DESKMATES_TOKEN=...                       (or DESKMATES_TOKEN_FILE, default ~/.config/deskmates/token)
#   remote-agent.sh <kind> <source> <session> [agent] [cwd] [tool] [detail]
#   kind: start | tool | waiting | idle | end
kind=$1 source=$2 session=$3 agent=${4:-} cwd=${5:-} tool=${6:-} detail=${7:-}
url=${DESKMATES_URL:-}
token=${DESKMATES_TOKEN:-$(cat "${DESKMATES_TOKEN_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/deskmates/token}" 2>/dev/null)}
[ -n "$url" ] && [ -n "$token" ] && [ -n "$kind" ] && [ -n "$source" ] && [ -n "$session" ] || exit 0
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r' | cut -c1-200; }
field() { [ -n "$2" ] && printf ',"%s":"%s"' "$1" "$(esc "$2")"; }
body=$(printf '{"kind":"%s","source":"%s","session":"%s"%s%s%s%s}' "$(esc "$kind")" "$(esc "$source")" "$(esc "$session")" \
  "$(field agent "$agent")" "$(field cwd "$cwd")" "$(field tool "$tool")" "$(field detail "$(printf '%s' "$detail" | cut -c1-120)")")
curl -s -m 1 -o /dev/null -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  --data-binary "$body" "$url/v1/events" >/dev/null 2>&1
exit 0
