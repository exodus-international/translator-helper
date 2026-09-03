# Profile pictures

Everyone can upload a picture on **/profile**. It appears wherever a person is
shown — the navigation bar, the dashboard greeting, the kanban assignee stack,
the team table, the admin user list, the document sidebar, comment threads, the
activity log and the assignment dropdowns.

There are three things a person can look like, in order:

1. the picture they uploaded here;
2. their [Gravatar](https://gravatar.com), if the address on their account has
   one;
3. their initials, on a colour derived from their name.

## How an upload works

1. The browser crops the picked photo to a centred square, scales it to at most
   512px and re-encodes it as WebP (JPEG where WebP encoding is unavailable).
   A 6 MB phone photo leaves the browser at a few tens of kilobytes.
2. `uploadAvatarAction` checks the size and reads the format from the file's
   magic bytes rather than trusting the browser, because the bucket is public
   and serves objects with the content type we give it.
3. The bytes are written to `{AUDIO_S3_KEY_PREFIX}/avatars/{userId}/{uuid}.webp`
   and the resulting URL is stored on `User.image`.

Every upload gets a fresh key. Objects are stored `immutable` with a one-year
max-age, so overwriting a key would leave browsers and CDNs showing the old
face. The superseded object is left in the bucket.

## Gravatar

Most people already have a face attached to an email address somewhere, so
before falling back to initials we ask Gravatar for one. Only the SHA-256 of
the trimmed, lowercased address is sent, only while the person has not uploaded
a picture, and the request carries `d=404` so Gravatar refuses rather than
inventing a placeholder — the image then fails to load and the initials chip
takes over. `referrerPolicy="no-referrer"` keeps the page a reader is on out of
Gravatar's logs.

`src/lib/gravatar.ts` hashes synchronously by hand. `crypto.subtle` is async and
`node:crypto` is not in the browser bundle, but avatars render on both sides and
need the hash while rendering.

## Why a plain `<img>`

`UserAvatar` renders the picture itself rather than Radix's `AvatarImage`.
Radix renders no `<img>` at all until its own JavaScript preload resolves,
which means the server sends the initials and the browser swaps in the picture
after hydration — a visible flash on every page load. Rendering the `<img>`
directly puts it in the HTML, so the browser starts fetching at parse time and a
cached picture paints with no swap. It also lets the picture be `loading="lazy"`
everywhere except the one avatar a page is about.

## Environment

No new variables. Avatars share the bucket audio already uses — see
[AUDIO.md](AUDIO.md) for `AUDIO_S3_*`. The names are historical: the bucket
holds every file the app stores.

Where those variables are missing, the profile page still renders and says
picture uploads are unavailable. Nothing else changes.

Locally, `docker compose up -d` starts a MinIO with a public
`translation-helper` bucket; the `AUDIO_S3_*` block in `.env.example` already
points at it, so uploads work without any real credentials. The bucket is
browsable at http://localhost:9012 (`minioadmin` / `minioadmin`).
