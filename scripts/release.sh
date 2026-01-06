#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Build and test first
pnpm -r build
pnpm -r test

# Bump root version (source of truth)
npm version patch --no-git-tag-version

# Get the new version
VERSION=$(node -p "require('./package.json').version")

# Sync version to all packages
pnpm --filter '@std-in/*' exec npm pkg set version="$VERSION"

# Commit and tag
git add -A
git commit -m "v$VERSION"
git tag "v$VERSION"

# Publish to npm
pnpm --filter '@std-in/*' publish

# Push commits and tags
git push -u origin main
git push --tags