# Audio generation

When a document version reaches APPROVED, the app generates a spoken MP3 of it
with Azure Speech and stores it in S3. The review sidebar shows the state,
offers a player, download, copy URL and regenerate. PRD: issue #108.

## Environment

The same Azure resource and the same bucket serve staging and production;
`AUDIO_S3_KEY_PREFIX` keeps their files apart.

| Variable | Example | Notes |
|---|---|---|
| `AZURE_SPEECH_ENDPOINT` | `https://germanywestcentral.api.cognitive.microsoft.com` | Region host of the Speech resource. `pnpm tsx scripts/azure-find-region.ts` finds it from the key. |
| `AZURE_SPEECH_KEY` | | Key 1 of the resource. The resource must be Standard S0; batch synthesis answers 401 on the Free tier. |
| `AUDIO_S3_ENDPOINT` | `https://s3.eu-central-1.amazonaws.com` | Any S3-compatible host. |
| `AUDIO_S3_REGION` | `eu-central-1` | `auto` for hosts that ignore it. |
| `AUDIO_S3_BUCKET` | `translation-helper-audios` | Must allow public read of objects; generated URLs are plain `GET`s. |
| `AUDIO_S3_ACCESS_KEY_ID` | | |
| `AUDIO_S3_SECRET_ACCESS_KEY` | | |
| `AUDIO_S3_PUBLIC_BASE_URL` | `https://translation-helper-audios.s3.eu-central-1.amazonaws.com` | Object keys are appended to this. |
| `AUDIO_S3_KEY_PREFIX` | `production` / `staging` / `local` | Required. Objects go under `{prefix}/audio/...`. |
| `AUDIO_S3_FORCE_PATH_STYLE` | `false` | `false` for AWS, `true` (default) for MinIO and most self-hosted clones. |
| `AUDIO_SWEEP_SECRET` | random string | Bearer token for the sweep endpoint below. |

If the Azure or S3 variables are missing, approval still succeeds and reports
audio as skipped. Nothing breaks in an environment without credentials.

## Per-language and per-project settings

- Admin, Languages: pick the speech provider and voice. Team policy is the
  male voice per locale: `cs-CZ-AntoninNeural`, `sk-SK-LukasNeural`,
  `pl-PL-MarekNeural`. A language with no provider is skipped.
- Admin, Source projects: choose which document types get audio. New projects
  default to Day and Daily Content.

## Pause markers

Authors mark a pause in the source Markdown with an HTML comment, invisible in
the rendered text:

```markdown
<!-- pause-duration="60s" -->
```

Whole seconds. The AI translation prompt keeps such comments verbatim, so one
marker in the source reaches every language. Azure caps a single break at 20 s;
longer pauses are chained automatically (verified: three chained breaks give
continuous silence).

Every heading also gets an automatic 1 s pause in front of it, so section
boundaries are audible without hand-placed markers. No pause is added before a
heading that opens the document, or where an explicit marker already sits.

## Skipping on-screen-only content

An element marked `data-read="false"` is never read aloud, its content
included:

```html
<div data-read="false">Shown on screen, silent in audio.</div>
```

## Narration settings

`DEFAULT_PROSODY` in `src/domain/audio/audio.ssml.ts`: rate 0.8, pitch -6%,
chosen in a listening test on real Czech content. Applies to every language.

## Scheduled sweep

The review page polls while it is open. For approvals nobody watches, a cron
calls the sweep endpoint, which advances every job untouched for over a minute
and fails jobs stuck in processing for over 15 minutes.

Coolify: on the application resource, add a Scheduled Task:

- Name: `audio-sweep`
- Frequency: `*/2 * * * *`
- Command: `curl -fsS -X POST -H "Authorization: Bearer $AUDIO_SWEEP_SECRET" http://localhost:3000/api/audio/sweep`

Coolify runs the command inside the app container, so `localhost:3000` and the
env variable both resolve. The response is `{ checked, ready, failed,
stillPending }`; zeros when there is nothing to do.

## Scripts

- `pnpm tsx scripts/azure-find-region.ts`: region, endpoint and tier for the
  key in `.env.local`.
- `pnpm tsx scripts/azure-tts-probe.ts --file day.md [--voice ...]`: one-off
  synthesis through the app's own text pipeline; prints duration, size and
  billed characters.

## Storage layout

`{prefix}/audio/{lang}/{repo path without extension}/{audioFileId}/{readable name}.mp3`, e.g.
`production/audio/cs/exercises/lent2026/days/20/3f1c.../lent2026-cs-day-20.mp3`.
The last segment is what a browser names the download, so it carries project,
language, document type and the document's own name. Every generation writes
a new object (the record id folder); a copied URL never changes content.
Nothing is deleted.
