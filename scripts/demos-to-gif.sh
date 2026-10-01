#!/usr/bin/env bash
#
# demos-to-gif.sh — turn recorded demos into GIFs for the release notes.
#
# Usage: pnpm demos:gif <vX.Y.Z> [name ...]
#
# Reads demos/output/<name>.webm and the trim point in <name>.json (written by
# the scene when its action starts), and writes public/release-notes/<version>/
# <name>.gif. With no names, converts every recording in demos/output.
#
# Two-pass ffmpeg: a palette generated from the clip itself, then mapped
# onto it without dithering: flat UI colours need none, and dither noise is
# what makes a screen recording GIF large.

set -euo pipefail

VERSION="${1:-}"
if ! [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: pnpm demos:gif <vX.Y.Z> [name ...]" >&2
  exit 1
fi
shift

command -v ffmpeg >/dev/null || { echo "✗ ffmpeg is required (brew install ffmpeg)." >&2; exit 1; }

WIDTH="${GIF_WIDTH:-1080}"
FPS="${GIF_FPS:-10}"
SRC="demos/output"
OUT="public/release-notes/${VERSION}"
mkdir -p "$OUT"

names=("$@")
if [[ ${#names[@]} -eq 0 ]]; then
  for f in "$SRC"/*.webm; do names+=("$(basename "$f" .webm)"); done
fi

for name in "${names[@]}"; do
  video="$SRC/$name.webm"
  [[ -f "$video" ]] || { echo "✗ $video not found — run pnpm demos first." >&2; exit 1; }
  start="$(node -e "console.log(require('./$SRC/$name.json').trimStart ?? 0)" 2>/dev/null || echo 0)"

  filters="fps=${FPS},scale=${WIDTH}:-1:flags=lanczos"
  ffmpeg -loglevel error -y -ss "$start" -i "$video" \
    -vf "${filters},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    "$OUT/$name.gif"

  size="$(du -h "$OUT/$name.gif" | cut -f1)"
  echo "✓ $OUT/$name.gif ($size, from ${start}s)"
done

# Stills (demos/stills.demo.ts) travel with the GIFs when converting everything.
if [[ $# -eq 0 ]]; then
  for still in "$SRC"/*.png; do
    [[ -f "$still" ]] || continue
    cp "$still" "$OUT/"
    echo "✓ $OUT/$(basename "$still") (still)"
  done
fi
