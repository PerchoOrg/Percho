#!/bin/sh
# Renders the app icon and splash mark from the SVGs beside this script into
# apps/mobile/assets/. Needs Google Chrome (headless) and ffmpeg.
#   icon.png        1024x1024, RGB, NO alpha (an alpha channel is an ITMS-90717 rejection)
#   splash-icon.png 1024x1024, RGBA, transparent ground
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../apps/mobile/assets"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp=$(mktemp -d)
render() { # <svg> <png> <background rgba hex>
	printf '<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:1024px;height:1024px}</style><img src="file://%s">' "$1" > "$tmp/page.html"
	"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
		--window-size=1024,1024 --default-background-color="$3" \
		--screenshot="$2" "file://$tmp/page.html" 2>/dev/null
}
render "$here/icon.svg" "$tmp/icon.png" ffffffff
ffmpeg -loglevel error -y -i "$tmp/icon.png" -pix_fmt rgb24 "$out/icon.png"
render "$here/splash-icon.svg" "$tmp/splash.png" 00000000
ffmpeg -loglevel error -y -i "$tmp/splash.png" -pix_fmt rgba "$out/splash-icon.png"
rm -rf "$tmp"
sips -g pixelWidth -g pixelHeight -g hasAlpha "$out/icon.png" "$out/splash-icon.png"
