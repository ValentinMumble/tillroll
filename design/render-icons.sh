#!/bin/sh
# Renders design/app-icon.svg to the app icons in public/ with headless Chrome (macOS): the iPhone home screen icon
# (180px) and the web app one (512px). Run it after changing the SVG.
set -e
here=$(cd "$(dirname "$0")" && pwd)
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
work=$(mktemp -d)
for size in 180 512; do
  printf '<html><body style="margin:0"><img src="file://%s/app-icon.svg" width="%s" height="%s"></body></html>' \
    "$here" "$size" "$size" >"$work/icon.html"
  "$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$size,$size" --screenshot="$work/$size.png" "file://$work/icon.html" 2>/dev/null
done
mv "$work/180.png" "$here/../public/apple-touch-icon.png"
mv "$work/512.png" "$here/../public/icon.png"
rm -r "$work"
