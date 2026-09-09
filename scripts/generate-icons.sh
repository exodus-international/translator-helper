#!/usr/bin/env bash
# Regenerates every raster icon from src/app/icon.svg, the one source of truth.
#
# Nothing here upscales a PNG: each size is rasterized from vector, so a 512
# icon is as sharp as a 16 one. See docs/BRANDING.md.
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in rsvg-convert magick; do
  command -v "$tool" >/dev/null || {
    echo "error: $tool not found. brew install librsvg imagemagick" >&2
    exit 1
  }
done

icon=src/app/icon.svg
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Tab icon. An .ico holds one image per size.
for s in 16 32 48; do
  rsvg-convert -w "$s" -h "$s" "$icon" -o "$tmp/$s.png"
done
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" src/app/favicon.ico

# iOS paints transparency black, so the touch icon is flattened onto white.
# iOS rounds the corners itself; no radius here.
rsvg-convert -w 180 -h 180 "$icon" -o "$tmp/apple.png"
magick "$tmp/apple.png" -background white -alpha remove -alpha off src/app/apple-icon.png

# Manifest icons, also flattened so they do not disappear on a dark launcher.
for s in 192 512; do
  rsvg-convert -w "$s" -h "$s" "$icon" -o "$tmp/m$s.png"
  magick "$tmp/m$s.png" -background white -alpha remove -alpha off "public/icon-$s.png"
done

# Maskable: Android crops to whatever shape the launcher uses. Only a circle of
# 80% diameter is guaranteed visible, and a square fits inside that circle only
# up to 512 * 0.8 / sqrt(2) = 289px. Hence 288, not the 410 that "80%" suggests.
rsvg-convert -w 288 -h 288 "$icon" -o "$tmp/mask.png"
magick -size 512x512 xc:white "$tmp/mask.png" -gravity center -composite \
  -alpha off public/icon-maskable-512.png

echo "wrote:"
for f in src/app/favicon.ico src/app/apple-icon.png \
         public/icon-192.png public/icon-512.png public/icon-maskable-512.png; do
  printf '  %-34s %s\n' "$f" "$(du -h "$f" | cut -f1 | tr -d ' ')"
done

# The mark is detailed, and 16px is where that bites. Blow the smallest slice up
# with nearest-neighbour so a human can check the real pixels after any change.
out=${TMPDIR:-/tmp}icon-check-16px.png
magick "$tmp/16.png" -filter point -resize 192x192 "$out"
echo
echo "16px slice magnified for inspection: $out"
