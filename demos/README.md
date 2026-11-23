# Product demos

Scripted walkthroughs of the app, recorded with Playwright and turned into the
GIFs and stills the release notes embed (`release-notes/vX.Y.Z.md`, served from
`public/release-notes/vX.Y.Z/`). Scripts rather than screen recordings, so a
demo can be re-recorded in a minute when the UI moves on.

These are not tests. A scene only waits for what it needs in order to carry on.

## Record

Once, create the demo database next to the development one:

```bash
docker exec translation-helper-db psql -U postgres -c "CREATE DATABASE translation_helper_demo"
brew install ffmpeg
```

Then, for each recording session:

```bash
# 1. Fresh data: the base seed plus the demo layer (notifications, deadlines, a
#    nearly finished translation). Scenes edit and save, so reset before each run.
export DATABASE_URL=postgresql://postgres:postgres@localhost:5511/translation_helper_demo
pnpm prisma migrate deploy && pnpm db:seed && pnpm db:seed:demo

# 2. A server on that database, on port 3300: the `demo` launch configuration,
#    or the command it runs (see .claude/launch.json).

# 3. Record every scene, or name some: pnpm demos editor notifications
pnpm demos

# 4. Convert: GIFs (and the stills) into public/release-notes/<version>/
pnpm demos:gif v1.4.0
```

Raw recordings land in `demos/output/` (ignored).

## How a scene is built

`support/stage.ts` opens a recorded browser context at 1440×900 (a 13" laptop),
signs in, and hands over the page. Everything before `scene.action()` — the
sign-in, the first compile — is trimmed from the GIF. It also:

- draws a pointer, since headless recordings have none, with a pulse on click
- moves it along eased paths (`glideTo`, `click`, `hover`) so a viewer can follow
- finds phrases inside CodeMirror (`phraseBounds`) so scenes select real words
- hides the Next.js dev-tools badge

The demo layer (`prisma/seed-demo.ts`) is separate from `db:seed` on purpose:
the database tests and the end-to-end suite assume the base seed alone, with no
notifications and no deadline near enough to trigger a reminder. It refuses to
run against the test database.

## GIF settings

`scripts/demos-to-gif.sh` renders at 10 fps, 1080 px wide, with a 128-colour
palette built from each clip and no dithering. Override with `GIF_FPS` and
`GIF_WIDTH`. Page transitions dominate the file size, so keep scenes short:
10–20 seconds lands at 1–4 MB.
