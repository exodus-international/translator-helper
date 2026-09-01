# Branding assets

What the app needs to stop looking like an unconfigured Next.js scaffold, what
is missing today, and exactly where each file goes.

Tracked by the favicon + OG image PRD.

## Where we are

Everything below is still the scaffold from the first commit.

| Thing | Today |
| --- | --- |
| `src/app/favicon.ico` | Next.js default, 16 and 32 px only |
| Tab icon on a retina display | Blurry, upscaled from 32 px |
| iOS "Add to Home Screen" | Generic screenshot, no icon |
| Pinned tab / installed app name | "Translation Helper" with no icon |
| Slack, Discord, iMessage link preview | Bare title and description, no image |
| `metadataBase` | Not set, so any relative preview URL resolves wrong |
| `public/` | Still holds `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` — all unused |

## What to upload

Drop files at these exact paths. Next.js picks up the `src/app/` ones by
filename, so no code change is needed once the file is there.

### 1. The mark — the one that matters

- [ ] **`src/app/icon.svg`** — square, viewBox `0 0 32 32`, no surrounding padding

  This is the source of truth; the raster sizes below are exported from it.
  It renders as small as 16 px in a browser tab, so it has to survive that:
  one clear shape, no fine strokes, no text that turns to mush. It also needs
  to read on both a light and a dark tab bar.

### 2. Raster icons

Exported from the mark. Any icon generator will do these from the SVG.

- [ ] **`src/app/favicon.ico`** — 16, 32 and 48 px in one file (replaces the scaffold one)
- [ ] **`src/app/apple-icon.png`** — 180 × 180, opaque background, no transparency (iOS renders alpha as black)
- [ ] **`public/icon-192.png`** — 192 × 192
- [ ] **`public/icon-512.png`** — 512 × 512
- [ ] **`public/icon-maskable-512.png`** — 512 × 512 with the mark inside the middle 80%, so Android can crop it to any shape without clipping

### 3. Link preview image

- [ ] **`src/app/opengraph-image.png`** — 1200 × 630

  The fallback card behind every link that is not a document. Keep the text
  large: Slack renders this around 360 px wide, and anything set below roughly
  40 px in the source is unreadable there.

### 4. Colours

Needed for the web manifest and the browser theme colour. Two hex values:

- [ ] **Brand / theme colour** — tints the browser UI on mobile and the manifest
- [ ] **Background colour** — the splash background behind the icon while an installed app boots

Write them here when decided:

```
theme:      #______
background: #______
```

## Notes for whoever makes the mark

- The per-document preview card is generated at request time and composes the
  mark with the document title, language and status. It is not a file you
  upload — but the mark needs to hold up at roughly 96 px inside it.
- A single-colour mark is the safest choice. It has to work on the light tab
  bar, the dark tab bar, the iOS home screen, and the preview card.
- No wordmark inside the square icon. "Translation Helper" at 16 px is a smear.
  The wordmark belongs on the preview card, where there is room.

## Once the files are in

Nothing to wire by hand for the icons — Next.js reads `icon.svg`,
`favicon.ico` and `apple-icon.png` straight out of `src/app/`. The manifest,
`metadataBase` and the preview metadata are code, and are covered by the PRD.
