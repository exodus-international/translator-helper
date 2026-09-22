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

The suite currently runs locally only. It is not wired into CI until it has proven it is not flaky.

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

`translator2@example.org` is deliberately never signed in during setup, which keeps it un-onboarded
and available as the subject of the onboarding scenario.

**A shared session is shared.** A scenario that signs out revokes the session behind its tag, and
every later scenario with that tag then fails with a redirect loop. The sign-out scenario must sign
in fresh and stay untagged.

**Seeded accounts all use the password `Hello123456`** and start with `onboarded = false`, so a first
sign-in lands on the profile form rather than the dashboard. `support/sign-in.ts` clears that gate.

**Status display names** are `Not Started`, `In Progress`, `In Review`, `Approved`, `Deployed`. Do
not hardcode them; `support/status.ts` reads them from the app.

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
language and announcement management, invitations, avatars, profile editing, releases, document
upload and creation.

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

`documents.ts` builds paths with the application's own `buildDocumentPath`, and `status.ts` reads
display names from the application's own `DOCUMENT_STATUS_CONFIGS`. Neither copies a value that
could drift. That matters: the status names were renamed at some point from "Texts in Review" to
"In Review", and a copy would have failed as a silent timeout.

## Gotchas

**A scenario owns its document.** Scenarios share one database and run in order, so two scenarios
driving the same document would each inherit the other's status changes. Every scenario works on
its own document, listed in `support/documents.ts`. When adding one, pick a document whose language
the acting identity actually holds: the translator has sk and cs, the reviewer has sk and hr.

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

16 checks: 4 sign-ins during setup, then

- **Authentication and onboarding** — sign in, first-run onboarding, wrong password, and three
  protected routes redirecting a signed-out visitor
- **Translation lifecycle** — starting a translation, a save surviving a reload, submitting for review
- **Review and suggestions** — approval refused while feedback is open, applying a suggestion,
  approval succeeding once nothing is open

Still to come: deploy with a stubbed GitHub call, language switching, suggestion dismiss and reopen,
AI translate with a stubbed response, label toggle, download, and the guards for banned and
non-admin users.
