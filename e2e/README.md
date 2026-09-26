# End-to-end tests

Gherkin scenarios run by Playwright through [playwright-bdd](https://vitalets.github.io/playwright-bdd/).

Scenarios describe what a person does. Step definitions delegate to the drivers in `support/`, and
only those drivers touch the DOM. When a UI library or a URL scheme changes, one driver changes and
the scenarios do not.

## Running

```sh
docker compose up -d postgres   # the database on port 5511
pnpm test:e2e                   # all scenarios
pnpm test:e2e:headed            # watch it happen
pnpm test:e2e:ui                # Playwright's interactive runner
pnpm test:e2e:report            # open the last HTML report
```

Run one slice by tag:

```sh
pnpm test:e2e --grep @business-critical
pnpm test:e2e --grep @high-usage
```

CI serves a production build rather than a dev server, because the two differ in ways the suite
should see. Locally it stays on `next dev`, where rebuilding between runs would cost more than it
finds. Set `CI=1` to exercise the CI path locally.

It also runs in CI, as its own `End-to-end` job in `.github/workflows/test.yml`, on pull requests
and pushes to `develop` and `production`. That job supplies the same variables `.env.test` holds
locally, against a Postgres service container, and uploads the Playwright report as an artifact when
something fails.

## Requirements

Node is pinned by the repo. If `node` misbehaves in a non-interactive shell, see the nvm note in the
project docs.

`.env.test` is **not committed** and you need to create it:

```sh
DATABASE_URL="postgresql://postgres:postgres@localhost:5511/translation_helper_test?schema=public"
BETTER_AUTH_SECRET="any-non-empty-string"
NEXT_PUBLIC_APP_URL=http://localhost:3100
PORT=3100
CHATGPT_API=sk-test-not-used
```

`NEXT_PUBLIC_POSTHOG_KEY` is deliberately absent. Without it the analytics provider no-ops, so test
runs stay out of production analytics.

## How it is wired

**Its own database.** `global-setup.ts` resets and re-seeds `translation_helper_test` before every
run, using the repository's own `pnpm db:seed` so test fixtures and development fixtures cannot
drift. Your development database is never touched.

It refuses to start unless the database is named exactly `translation_helper_test`. That guard
matters: `prisma.config.ts` calls `import 'dotenv/config'`, which reads `.env` and its **development**
`DATABASE_URL`, so a Prisma command without an explicit override would reset your real data.

Two Prisma 7 details worth knowing, both of which cost an afternoon to find:

- `prisma migrate reset` does **not** run the seed. Seeding is a separate explicit step. A reset that
  silently leaves an empty database shows up much later as "Invalid email or password".
- `--skip-seed` and `--skip-generate` no longer exist. Prisma 7's reset takes only `--force`,
  `--schema` and `--config`.

The generated Prisma client lives in `src/generated/prisma` and is gitignored, so it survives branch
switches. Setup regenerates it first, otherwise checking out a branch with a different schema leaves
a client that disagrees with the database.

**Identity by tag.** The setup project signs in each seeded person once and stores the session. A
scenario picks who it runs as with a tag:

| Tag | Person |
|---|---|
| `@admin` | `admin@example.org`, project manager for cs and sk |
| `@admin2` | `admin2@example.org`, project manager for de and fr |
| `@translator` | `translator@example.org`, editor cs, translator sk |
| `@reviewer` | `reviewer@example.org`, reviewer hr and sk |
| *(untagged)* | signed out |

Onboarding is covered by the registration scenarios: the seed marks every seeded person as
onboarded, so only a freshly registered account still meets that form.

**A shared session is shared.** A scenario that signs out revokes the session behind its tag, and
every later scenario with that tag then fails with a redirect loop. The sign-out scenario must sign
in fresh and stay untagged.

**Seeded accounts all use the password `Hello123456`** and are already onboarded. A newly registered
account is not, so it meets the profile form first; `support/sign-in.ts` clears that gate either
way.

**Status display names** are `Not Started`, `In Progress`, `In Review`, `Approved`, `Deployed`. Do
not hardcode them; `support/status.ts` reads them from the app.

## Database-backed tests

The same database serves a second, faster layer: `pnpm test:db` runs every `*.db.test.ts` file
under `src/` against it with `node:test`, after reseeding it through the same `pnpm db:seed`. A
repository or a service is called directly, with only the session stood in for, so a query that
answers wrongly for a seeded person fails in seconds rather than as a browser timeout. Files run one
at a time, because they share the seeded rows.

It needs the same `.env.test` and the same Postgres, and refuses any database not named
`translation_helper_test` through the guard in `tests/test-database.ts`. `SKIP_DB_SEED=1` skips the
ten-second reseed while iterating on one file. In CI it runs in the `End-to-end` job, before the
browser suite, which reseeds again for itself.

`pnpm test` does not include it, so a checkout without Postgres still runs the unit and component
tests.

## Priority tags

A scenario says why it earns its place, and the two reasons are independent:

- `@high-usage` — a large share of real users do this, measured in PostHog
- `@business-critical` — a break stops translations shipping, or locks people out
- `@stubbed` — hits an external service, intercepted in the test process

They disagree, which is the point. Deploying reaches about a third of users yet is the step that
ships the product's output. Toggling a label reaches more users and breaking it costs nothing.

## Deliberately not tested

Chosen from production usage: these sit outside the measured top fifth, and testing them would cost
more than it returns.

Translator and reviewer assignment, audio generation and transcripts, administrative user, project,
language and announcement management, avatars, profile editing and releases.

Also out of scope: visual regression, accessibility as a gate, performance and load testing,
cross-browser and mobile viewports. The suite targets Desktop Chrome.

## Drivers

Only these know about the DOM. Steps call them; scenarios never touch a selector.

| Module | Hides |
|---|---|
| `support/sign-in.ts` | the login form and the onboarding gate |
| `support/documents.ts` | the URL scheme, and which seeded document is which |
| `support/editor.ts` | the editor library, entirely |
| `support/status.ts` | the status control, its menu and its labels |
| `support/threads.ts` | the feedback panel and thread cards |

## Stubs

Two calls leave the Next process from inside a server action, so `page.route` cannot see them. Each
is answered by a small HTTP server that Playwright starts with the suite, and the app is pointed at
it through the base URL it already reads from the environment. No test-only branch exists in
application code.

| Module | Stands in for | Pointed at by |
|---|---|---|
| `support/openai-mock.mjs` | the chat completions endpoint | `CHATGPT_API_BASE_URL` |
| `support/github-mock.mjs` | the GitHub REST API, enough of it for one deploy | `GITHUB_API_BASE_URL` |

The GitHub stub answers the six calls a deploy makes: installation token, branch check, file
lookup, commit, open pull request lookup, and pull request creation. It always reports pull request
42. The app also needs the rest of a GitHub configuration to believe it is configured, and
`support/github-stub.ts` supplies it, including an RSA key generated for the run: the app signs a
token request with it, and the signing needs a key that parses even though nobody checks the
signature. `playwright.config.ts` passes all of it to the Next server explicitly, so a real
`GITHUB_*` value in `.env.local` can never reach a test run, and CI needs no extra secrets.

`documents.ts` builds paths with the application's own `buildDocumentPath`, and `status.ts` reads
display names from the application's own `DOCUMENT_STATUS_CONFIGS`. Neither copies a value that
could drift. That matters: the status names were renamed at some point from "Texts in Review" to
"In Review", and a copy would have failed as a silent timeout.

## Gotchas

**A scenario owns its document.** Scenarios share one database and run in order, so two scenarios
driving the same document would each inherit the other's status changes. Every scenario works on
its own document, listed in `support/documents.ts`. When adding one, pick a document whose language
the acting identity actually holds: the translator has sk and cs, the reviewer has sk and hr.

**Sign-in is rate limited in production only.** better-auth allows three attempts per ten seconds
and enables the limit when `NODE_ENV` is production, so signing several people in quickly passes
against a dev server and is refused against a real build. `support/sign-in.ts` waits the window out
and retries, but only on a rate-limit refusal: a wrong password still fails at once, which is what
its own scenario asserts.

**The status control is a plain button until React hydrates.** Only then does it own a menu. A click
landing before that does nothing, silently and with no error, which reads as an inexplicable
timeout. `status.ts` waits for `aria-haspopup="menu"` before clicking, and any similar control
should be treated the same way.

**`innerText` returns text as rendered, including `text-transform`.** The feedback heading is styled
uppercase, so it reads "FEEDBACK (2 OPEN)" rather than what the source says. Match
case-insensitively, or use `textContent`.

**The feedback panel loads in two stages.** Its heading is a bare "Feedback" before the threads
arrive and only then gains "(2 open)", so reading the count too early reports zero for a document
that has plenty. `waitForFeedback` settles it first.

**Announcements are not seeded**, so the announcement modal stays hidden. If one is ever added to the
seed it will open by default and swallow clicks, and scenarios will need a fixture to dismiss it.

**The document URL carries no verb.** Which editor renders is decided by the document version's
status, not by the path. Assert on what is rendered, never on a `/review` or `/translate` suffix.

**No `data-testid`.** Playwright ranks test ids below role, text and label, and recommends them only
when nothing else reaches the element. If something cannot be located, give it a real accessible
name. Screen reader users benefit too.

So far that has meant three changes to the app, all additive and all genuine accessibility fixes:
the status control is named `Document status: <status>`, the editor panes are textboxes named
"Source text" and "Translation", and a feedback thread is an `<article>` inside a region named
"Feedback".

## Coverage today

36 checks: 4 sign-ins during setup, then

- **Authentication and onboarding** — sign in, wrong password, and three protected routes
  redirecting a signed-out visitor
- **Access and guards** — a banned person refused, four admin screens turning an ordinary user
  away, signing out ending the session
- **Registration** — an invited person registering, and four invitations that are no longer good
- **Translation lifecycle** — starting a translation, a save surviving a reload, submitting for review
- **AI translation** — a stubbed model filling an empty translation
- **Review and suggestions** — approval refused while feedback is open, applying a suggestion,
  approval succeeding once nothing is open, dismissing and reopening a comment
- **Deploy** — an approved translation deployed against the stubbed GitHub API and linked to its
  pull request, and a translator not offered deploy at all
- **Administration happy paths** — creating a document by typing and by upload, creating a source
  project, creating an invitation, and the empty states of a new project and a new language

Still to come from the measured top fifth: language switching, label toggle, and download.
