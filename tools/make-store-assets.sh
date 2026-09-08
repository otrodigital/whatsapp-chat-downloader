#!/usr/bin/env bash
#
# Renders store artwork with headless Chrome into store/.
#   - promo-440x280.png     small promotional tile (optional in the dashboard)
#   - marquee-1400x560.png  marquee tile (optional)
#   - popup-1280x800.png    the real popup UI on a backdrop, at screenshot size
#
# Screenshots of an actual export must be captured by hand; see STORE.md.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME" >&2; exit 1; }

shoot() { # shoot <html> <out> <w> <h>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="$3,$4" \
    --screenshot="$2" "file://$PWD/$1" >/dev/null 2>&1
  echo "    $2  ($3x$4 @2x)"
}

echo "==> Rendering store assets"
shoot store/src/promo.html      store/promo-440x280.png    440  280
shoot store/src/marquee.html    store/marquee-1400x560.png 1400 560
shoot store/src/popup-shot.html store/popup-1280x800.png   1280 800

echo "==> Rendering microsite product shot"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1240,880 --screenshot=site/browser.png \
  "file://$PWD/site/src/browser-shot.html" >/dev/null 2>&1
echo "    site/browser.png  (1240x880 @2x)"

echo "==> Rendering microsite Open Graph image"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 \
  --screenshot=site/og-image.png "file://$PWD/site/src/og.html" >/dev/null 2>&1
echo "    site/og-image.png  (1200x630)"
echo "==> Done"
