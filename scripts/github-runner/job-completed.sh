#!/bin/sh
# GitHub Actions self-hosted runner hook (ACTIONS_RUNNER_HOOK_JOB_COMPLETED). The job's character leaves the office.
dir=$(dirname "$0")
# installed next to remote-agent.sh, or run from the repository (scripts/github-runner/)
ra="$dir/remote-agent.sh"; [ -x "$ra" ] || ra="$dir/../remote-agent.sh"
"$ra" end ci "${GITHUB_RUN_ID:-run}-${GITHUB_JOB:-job}" >/dev/null 2>&1
exit 0
