#!/bin/sh
# Creates a temporary git repo with a merge conflict in README.md.
# Usage: TMP=$(mktemp -d) && sh setup.sh "$TMP"
set -e

DEST="${1:-$(mktemp -d)}"
echo "Creating fixture at $DEST"

git init -b main "$DEST"
cd "$DEST"

git config user.email "test@example.com"
git config user.name "Test User"

echo "base" > README.md
git add README.md
git commit -m "base"

git checkout -b feature
echo "feature" > README.md
git commit -am "feature change"

git checkout main
echo "main-update" > README.md
git commit -am "main update"

git merge feature --no-edit || true
# Expected to fail with a conflict in README.md

echo "Fixture ready at $DEST"
echo "README.md should have conflict markers"
