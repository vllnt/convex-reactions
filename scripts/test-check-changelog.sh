#!/usr/bin/env bash
#
# test-check-changelog.sh — success and failure paths of check-changelog.mjs
# against fixture changelogs in a throwaway directory. CHECK_CHANGELOG points
# at another copy of the checker (for example an older revision) to run the
# same cases against it.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKER="$(realpath "${CHECK_CHANGELOG:-$ROOT/scripts/check-changelog.mjs}")"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

printf '{"name":"fixture","version":"1.0.0"}\n' > "$DIR/package.json"

failures=0
fence='```'

# run <name> <expected exit> <expected output fragment> < changelog
run() {
  local name="$1" expected="$2" fragment="$3" output status
  cat > "$DIR/CHANGELOG.md"
  output="$(cd "$DIR" && node "$CHECKER" 2>&1)"
  status=$?
  if [[ "$status" != "$expected" ]] || ! grep -qF -- "$fragment" <<< "$output"; then
    printf 'FAIL %s: expected exit %s with "%s", got %s\n%s\n' \
      "$name" "$expected" "$fragment" "$status" "$output" >&2
    failures=$((failures + 1))
    return
  fi
  printf 'OK    %s\n' "$name"
}

run "an inner fence line with an info string does not close a block" 0 "CHANGELOG OK (1.0.0, 2 sections)" <<EOF
# Changelog

## [1.0.0] - Unreleased

${fence}md
${fence}js
## [9.9.9]
${fence}

## [0.9.0] - 2026-01-01
EOF

run "two unreleased sections fail" 1 "more than one unreleased section" <<EOF
# Changelog

## [Unreleased]

## [1.0.0] - Unreleased

## [0.9.0] - 2026-01-01
EOF

run "a missing version section fails" 1 'expected one "## [1.0.0]" section, found 0' <<EOF
# Changelog

## [0.9.0] - 2026-01-01
EOF

if [[ "$failures" -ne 0 ]]; then
  echo "FAILED $failures test-check-changelog case(s)" >&2
  exit 1
fi
echo "OK    test-check-changelog.sh"
exit 0
