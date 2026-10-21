#!/bin/sh
# Forwards one Claude Code hook payload (stdin) to the local deskmates service.
# It must never slow down or block an agent: 50 ms ceiling, output discarded, always exit 0.
# x-deskmates-ppid lets the service find the agent's terminal (VS Code panel: click to focus).
# x-deskmates-name carries DESKMATES_NAME, the name this session goes by in the office (curl drops it when empty).
curl -s -m 0.05 -o /dev/null -X POST -H 'content-type: application/json' -H "x-deskmates-ppid: $PPID" \
  -H "x-deskmates-name: ${DESKMATES_NAME:-}" \
  --data-binary @- "http://127.0.0.1:${DESKMATES_PORT:-47821}/v1/hook/claude" >/dev/null 2>&1
exit 0
