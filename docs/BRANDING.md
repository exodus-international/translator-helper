# Branding assets

What the app ships as its identity, where each file lives, and how to redo any
of it.

## Colours

```
theme:      #E08A1E   orange, from the gold in the preview artwork
background: #0E0D0B   near-black, the artwork's ground
```

`theme` tints mobile browser chrome and the installed-app manifest.
`background` is the splash colour behind the icon while an installed app boots.

## The mark

`src/app/icon.svg` is the source of truth: two overlapping cards, source over
target, with an omega on the front one. Orange on cream, white omega.

The omega is drawn as three stroked paths, not a text glyph, so it needs no
font and cannot be re-shaped by a font substitution.

## Files in place

| File | Size | Notes |
| --- | --- | --- |
| `src/app/icon.svg` | scalable | The mark. Next.js serves it as the SVG favicon |
| `src/app/favicon.ico` | 16, 32, 48 | See the 16px note below |
| `src/app/apple-icon.png` | 180 | Full-bleed orange, opaque — iOS renders alpha as black |
| `public/icon-192.png` | 192 | Manifest |
| `public/icon-512.png` | 512 | Manifest |
| `public/icon-maskable-512.png` | 512 | Mark inside the middle 80%, so Android can crop to any launcher shape |
| `src/app/opengraph-image.jpg` | 1200 × 630 | The link preview card |
| `src/app/manifest.ts` | — | Generates `manifest.webmanifest` |

### The 16px slice

The full mark does not survive 16 px: two cards plus a glyph collapse into
noise. An `.ico` holds a separate image per size, so the 16px slice inside
`favicon.ico` is a simplified variant — one orange square, omega only, no back
card. 32 and 48 use the full mark.

If you regenerate the `.ico`, keep that split. Rendering the full mark at 16 px
and shipping it is a visible downgrade.

## Redoing the preview card

The card is the artwork with a bottom scrim and two lines of text over it.

Source artwork is not committed — it lives wherever it was generated. To
recompose from a new 1200 × 630-ish source:

1. Crop to exactly 1200 × 630 (`-resize 1200x630^ -gravity center -extent 1200x630`).
2. Lay a bottom-up dark gradient over the lower half so text stays readable
   whatever the artwork does there.
3. Set the title around 76px and the tagline around 34px, in a serif.
4. Export JPEG, quality ~86. The current file is about 250 kB; a PNG of the
   same image is 1.4 MB, which unfurlers are slow to fetch.

Slack renders the card around 360 px wide. Anything below roughly 40 px in the
1200 px source is unreadable there — that is why the type is as large as it is.

## One deployment requirement

`metadataBase` decides the origin that `og:image` resolves against. Set
**`APP_URL`** to the public origin in each environment.

It must be `APP_URL`, not `NEXT_PUBLIC_APP_URL`. `NEXT_PUBLIC_*` values are
inlined when the image is built, so a value supplied only to the running
container never reaches the code. `APP_URL` is read on the server at runtime
and can be changed without a rebuild.

Verified against a production build: with `APP_URL` set, `og:image` renders as
`https://<origin>/opengraph-image.jpg`. Unset, it falls back to
`http://localhost:3000` and every unfurl outside dev breaks silently. In `next
dev` the tag always shows the dev origin regardless — that is dev substituting
the request host, not a misconfiguration.

## Still open

Per-document preview cards — a link to a document unfurling with its title,
language and status — are specified in the favicon + OG PRD. They need a
crawler exemption in `src/proxy.ts`, because every route currently redirects an
unauthenticated request to `/login`, which is what a link-preview crawler is.
Until then every link shows the card above.
