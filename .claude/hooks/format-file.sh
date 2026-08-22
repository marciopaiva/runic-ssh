#!/usr/bin/env bash
# Formats the file that a Write or Edit just touched.
#
# Reads the hook payload on stdin and formats by extension. Every branch is a
# silent no-op when the formatter is not installed, so this stays harmless
# before `pnpm install` has ever run in a fresh clone.
set -uo pipefail

file=$(python3 -c 'import sys, json
d = json.load(sys.stdin)
r = d.get("tool_response") or {}
print(r.get("filePath") or d.get("tool_input", {}).get("file_path") or "")' 2>/dev/null)

[ -n "$file" ] && [ -f "$file" ] || exit 0

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
prettier="$repo_root/node_modules/.bin/prettier"

case "$file" in
  *.rs)
    if command -v rustfmt >/dev/null 2>&1; then
      rustfmt --edition 2021 "$file" >/dev/null 2>&1
    fi
    ;;
  *.ts | *.tsx | *.js | *.jsx | *.css | *.json)
    if [ -x "$prettier" ]; then
      "$prettier" --write "$file" >/dev/null 2>&1
    fi
    ;;
esac

exit 0
