#!/bin/sh
# Install a `marky` CLI shim that opens files in the installed Marky.app.
# Usage: marky [--new] [--wait] file1.md [file2.md ...]
#
# Run this once after installing Marky.app:
#   sudo sh scripts/install-cli.sh

set -e

DEST="${MARKY_CLI_DEST:-/usr/local/bin/marky}"
DEST_DIR="$(dirname "$DEST")"

if [ ! -d "$DEST_DIR" ]; then
  mkdir -p "$DEST_DIR"
fi

cat > "$DEST" <<'SH'
#!/bin/sh
# Marky CLI shim — dispatches through Launch Services so file-association
# and single-instance behavior match a Finder double-click.
if [ $# -eq 0 ]; then
  exec open -a Marky
fi

args=""
files=""
for a in "$@"; do
  case "$a" in
    -n|--new)  args="$args -n" ;;
    -w|--wait) args="$args -W" ;;
    -h|--help)
      cat <<EOF
marky — open Markdown files in Marky.app

Usage:
  marky                    Launch Marky (no file)
  marky FILE [FILE ...]    Open files in Marky
  marky -n FILE            Open in a new window/tab
  marky -w FILE            Block until Marky exits

EOF
      exit 0
      ;;
    *) files="$files \"$(printf '%s' "$a" | sed 's/"/\\"/g')\"" ;;
  esac
done

eval "exec open -a Marky $args $files"
SH

chmod +x "$DEST"
echo "Installed: $DEST"
echo "Try: marky README.md"
