#!/usr/bin/env bash
# one-time local setup: activate versioned hooks and pin the commit identity
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath .githooks
git config user.name "Anmol Gaur"
git config user.email "30744879+anmolgaur45@users.noreply.github.com"
chmod +x .githooks/* scripts/*.sh 2>/dev/null || true

echo "hooks active (core.hooksPath=.githooks)"
echo "identity set to Anmol Gaur <30744879+anmolgaur45@users.noreply.github.com>"
echo "run scripts/check-hygiene.sh to scan the tracked tree"
