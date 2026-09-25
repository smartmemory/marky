#!/usr/bin/env bash
# Build and publish Marky's manual macOS universal release.
# Usage: npm run release [-- --dry-run]
set -euo pipefail

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

DRY_RUN=false
case "$#" in
  0) ;;
  1) [ "$1" = '--dry-run' ] || fail 'Usage: npm run release [-- --dry-run]'
     DRY_RUN=true ;;
  *) fail 'Usage: npm run release [-- --dry-run]' ;;
esac

# Prefer rustup's toolchain: Homebrew's rustc ships only the host target, not x86_64.
[ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
REPO='smartmemory/marky'
ACCOUNT='smartmem-dev'
NOTES=''
PREVIOUS_ACCOUNT=''
RESTORE_ACCOUNT=false
KEEP_NOTES=false

cleanup() {
  local status=$?
  trap - EXIT
  if [ "$RESTORE_ACCOUNT" = true ]; then
    if ! gh auth switch --hostname github.com --user "$PREVIOUS_ACCOUNT" >/dev/null; then
      printf 'Error: could not restore gh account %s; run gh auth switch --hostname github.com --user %q\n' "$PREVIOUS_ACCOUNT" "$PREVIOUS_ACCOUNT" >&2
      status=1
    fi
  fi
  if [ -n "$NOTES" ] && [ "$KEEP_NOTES" = false ]; then
    rm -f "$NOTES"
  fi
  exit "$status"
}
trap cleanup EXIT

command -v node >/dev/null 2>&1 || fail 'node is required.'
VERSION="$(node -p "require('./package.json').version" 2>/dev/null)" || fail 'Cannot read package.json version.'
TAURI_VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version" 2>/dev/null)" || fail 'Cannot read tauri.conf.json version.'
[ "$VERSION" = "$TAURI_VERSION" ] || fail 'Versions in package.json and tauri.conf.json do not match.'
TAG="v$VERSION"
BRANCH="$(git branch --show-current)" || fail 'Cannot read current branch.'
[ "$BRANCH" = main ] || fail 'Current branch must be main.'
TRACKED_CHANGES="$(git status --porcelain --untracked-files=no)" || fail 'Cannot read tracked working tree status.'
[ -z "$TRACKED_CHANGES" ] || fail 'Tracked changes exist; commit and push before releasing.'
git fetch origin || fail 'git fetch origin failed.'
SHA="$(git rev-parse HEAD)" || fail 'Cannot resolve HEAD.'
REMOTE_SHA="$(git rev-parse origin/main)" || fail 'Cannot resolve origin/main.'
[ "$SHA" = "$REMOTE_SHA" ] || fail 'HEAD must match origin/main; push main before releasing.'
if git show-ref --verify --quiet "refs/tags/$TAG"; then
  fail "Tag $TAG already exists locally."
fi
REMOTE_TAGS="$(git ls-remote --tags origin)" || fail 'Cannot read tags on origin.'
if printf '%s\n' "$REMOTE_TAGS" | awk -v tag="refs/tags/$TAG" '
  $2 == tag || $2 == tag "^{}" { found = 1 }
  END { exit !found }
'; then
  fail "Tag $TAG already exists on origin."
fi

NOTES="$(mktemp "${TMPDIR:-/tmp}/marky-release.XXXXXX")" || fail 'Cannot create temporary release notes.'
awk -v heading="## $TAG" '
  { sub(/\r$/, "") }
  /^## / {
    if (section) exit
    line = $0
    sub(/[ \t]+$/, "", line)
    if (line == heading) section = 1
    next
  }
  section { print }
' CHANGELOG.md > "$NOTES" || fail 'Cannot extract CHANGELOG.md release notes.'
grep -q '[^[:space:]]' "$NOTES" || fail "CHANGELOG.md must contain a nonempty ## $TAG section."
printf '\nmacOS universal build (Apple Silicon and Intel). Download-only; no in-app auto-update.\n' >> "$NOTES"

command -v gh >/dev/null 2>&1 || fail 'gh is required.'
ACCOUNTS="$(gh auth status --hostname github.com --json hosts --jq '.hosts[][] | .login' 2>/dev/null)" || fail 'Cannot read gh authentication status.'
printf '%s\n' "$ACCOUNTS" | grep -Fxq "$ACCOUNT" || fail 'smartmem-dev must be present in gh auth status.'

# Manual releases can't sign updater artifacts (key is CI-only), so skip them.
npm run tauri build -- --target universal-apple-darwin --config '{"bundle":{"createUpdaterArtifacts":false}}' || fail 'Universal macOS build failed.'
DMG="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Marky_${VERSION}_universal.dmg"
[ -f "$DMG" ] || fail "Expected DMG does not exist: $DMG"
SIZE="$(wc -c < "$DMG" | tr -d '[:space:]')"
printf '\nVersion: %s\nSHA: %s\nDMG: %s (%s bytes)\n\nRelease notes:\n' "$VERSION" "$SHA" "$DMG" "$SIZE"
cat "$NOTES"
if [ "$DRY_RUN" = true ]; then
  printf '\nDry run complete; nothing tagged or published.\n'
  exit 0
fi

printf '\nPublish %s? [y/N] ' "$TAG"
ANSWER=''
if ! read -r ANSWER < /dev/tty; then
  fail 'Cannot read confirmation from /dev/tty; nothing tagged.'
fi
case "$ANSWER" in
  y|Y) ;;
  *) printf 'Aborted; nothing tagged.\n'; exit 1 ;;
esac

# Do not publish if the checkout changed during the build or confirmation.
[ "$(git branch --show-current)" = main ] || fail 'Branch changed during release.'
[ "$(git rev-parse HEAD)" = "$SHA" ] || fail 'HEAD changed during release.'
TRACKED_CHANGES="$(git status --porcelain --untracked-files=no)" || fail 'Cannot recheck tracked changes.'
[ -z "$TRACKED_CHANGES" ] || fail 'Tracked changes appeared during release.'
PREVIOUS_ACCOUNT="$(gh auth status --hostname github.com --json hosts --jq '.hosts[][] | select(.active == true) | .login' 2>/dev/null)" || fail 'Cannot determine the active gh account.'
[ -n "$PREVIOUS_ACCOUNT" ] || fail 'No active GitHub account to restore.'
RESTORE_ACCOUNT=true
gh auth switch --hostname github.com --user "$ACCOUNT" || fail 'Cannot switch gh to smartmem-dev.'
git tag -a "$TAG" "$SHA" -m "Marky $TAG" || fail "Cannot create annotated tag $TAG."
git push origin "$TAG" || fail "Cannot push $TAG; local tag remains. Inspect origin before retrying."
if ! RELEASE_URL="$(gh release create "$TAG" -R "$REPO" --target "$SHA" --title "Marky $TAG" --notes-file "$NOTES" "$DMG")"; then
  KEEP_NOTES=true
  printf 'Error: release creation failed after pushing %s; tag and notes retained.\n' "$TAG" >&2
  printf 'Retry from this checkout (switch back to %q afterwards):\n' "$PREVIOUS_ACCOUNT" >&2
  printf 'gh auth switch --hostname github.com --user %q\n' "$ACCOUNT" >&2
  printf 'gh release create %q -R %q --target %q --title %q --notes-file %q %q\n' "$TAG" "$REPO" "$SHA" "Marky $TAG" "$NOTES" "$DMG" >&2
  printf 'Or delete the tag after inspecting the release state:\n' >&2
  printf 'git push origin --delete %q\ngit tag -d %q\n' "$TAG" "$TAG" >&2
  exit 1
fi
printf '\n%s\n' "$RELEASE_URL"
