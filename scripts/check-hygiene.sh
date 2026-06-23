#!/usr/bin/env bash
# full tracked-tree hygiene scan, used by the pre-push hook and CI
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

paths='(^|/)(CLAUDE\.md|plan\.md|PLAN\.md)$|(^|/)\.claude/|(^|/)tasks/|(^|/)\.env$|(^|/)\.env\..*local$|(^|/)server/data/|\.db($|-shm$|-wal$)'
attrib='co-authored-by|generated (with|by) (claude|ai)|generated using claude|claude code|🤖|noreply@anthropic\.com'

failed=0
note() { echo "hygiene: $1" >&2; failed=1; }

bad="$(git ls-files | grep -iE "$paths" || true)"
[ -z "$bad" ] || note "forbidden tracked paths:
$bad"

hits="$(git ls-files -- . ':(exclude).githooks/' ':(exclude).github/' ':(exclude)scripts/' | xargs -d '\n' -r grep -inE "$attrib" 2>/dev/null || true)"
[ -z "$hits" ] || note "ai-attribution in tracked files:
$hits"

if git ls-files --error-unmatch README.md >/dev/null 2>&1; then
  em="$(grep -nF '—' README.md || true)"
  [ -z "$em" ] || note "em dash in README.md:
$em"
fi

[ "$failed" -eq 0 ] || { echo "hygiene check failed" >&2; exit 1; }
echo "hygiene check passed"
