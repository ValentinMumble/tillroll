#!/bin/sh
# Renders design/app-icon.svg to the app icons in public/ with headless Chrome (macOS): the iPhone home screen icon
# (180px) and the web app one (512px). Run it after changing the SVG. It also renders design/launch.html to the iOS
# launch images, light and dark, at the iPhone 16 Pro's size (402 x 874 points at 3x).
set -e
here=$(cd "$(dirname "$0")" && pwd)
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
work=$(mktemp -d)
for size in 180 512; do
  printf '<html><body style="margin:0"><img src="file://%s/app-icon.svg" width="%s" height="%s"></body></html>' \
    "$here" "$size" "$size" >"$work/icon.html"
  "$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --user-data-dir="$work/profile" \
    --window-size="$size,$size" --screenshot="$work/$size.png" "file://$work/icon.html" 2>/dev/null
done
for theme in light dark; do
  "$chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=3 --user-data-dir="$work/profile" \
    --window-size=402,874 --screenshot="$work/launch-$theme.png" "file://$here/launch.html#$theme" 2>/dev/null
done
mv "$work/180.png" "$here/../public/apple-touch-icon.png"
mv "$work/512.png" "$here/../public/icon.png"
mv "$work/launch-light.png" "$work/launch-dark.png" "$here/../public/"
rm -r "$work"
