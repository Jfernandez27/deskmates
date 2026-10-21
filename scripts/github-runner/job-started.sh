#!/bin/sh
# GitHub Actions self-hosted runner hook (ACTIONS_RUNNER_HOOK_JOB_STARTED). Puts the job in the deskmates office.
# Must never fail the job: everything is best effort and it always exits 0.
dir=$(dirname "$0")
# installed next to remote-agent.sh, or run from the repository (scripts/github-runner/)
ra="$dir/remote-agent.sh"; [ -x "$ra" ] || ra="$dir/../remote-agent.sh"
repo=${GITHUB_REPOSITORY##*/}
"$ra" start ci "${GITHUB_RUN_ID:-run}-${GITHUB_JOB:-job}" "${GITHUB_JOB:-ci}" "/ci/${repo:-repo}" >/dev/null 2>&1
"$ra" tool ci "${GITHUB_RUN_ID:-run}-${GITHUB_JOB:-job}" "${GITHUB_JOB:-ci}" "/ci/${repo:-repo}" "workflow" "${GITHUB_WORKFLOW:-}" >/dev/null 2>&1
exit 0
