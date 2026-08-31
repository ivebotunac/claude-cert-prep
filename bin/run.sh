#!/bin/sh
# One command from a fresh clone to the app in a browser.
#
# Opening dist/index.html by double-clicking cannot work, and no build flag
# fixes it: a module script loaded from file:// has the origin "null" and the
# browser blocks it. The worker, the content database fetch and OPFS all need a
# real origin too. So the app is served, and this script is the whole ceremony.
set -e
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"

[ -d node_modules ] || { echo "installing dependencies"; npm install --silent; }
[ -f dist/index.html ] || { echo "building"; npm run build; }

URL="http://localhost:$PORT"
echo "CCAR-F Prep on $URL"

# Give the server a moment, then open a browser if the platform has one.
( sleep 1
  if command -v open > /dev/null 2>&1; then open "$URL"
  elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$URL"
  fi ) &

exec npx vite preview --port "$PORT" --strictPort
