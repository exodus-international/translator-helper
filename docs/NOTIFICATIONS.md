# Notifications

People are told about work that concerns them in two places: the bell in the
header (always) and email (per type, switchable on the profile). A scheduled
sweep creates the deadline reminders and sends the emails.

## What gets sent

| Type | Who | When |
|---|---|---|
| Assigned to translate | Translator | Assigned to a version |
| Assigned to review | Reviewer | Set as reviewer |
| Unassigned | Previous translator or reviewer | Replaced or removed |
| Review requested | Reviewer, or the language's project managers if there is none | Version moves to Pending review |
| Deadline changed | Translator / reviewer | The deadline they work to moves |
| Deadline approaching | Translator / reviewer | Less than three days left, then less than one |
| Deadline passed | Translator / reviewer | On the day, a day later, three days later, then weekly |
| Deadline escalation | Whoever assigned the work and the language's project managers | From one day overdue, on the same schedule |
| Changes requested | Translator | Pending review → In progress |
| Translation approved | Translator | Pending review → Approved |
| New suggestion | Translator | Someone suggests a change on their version |
| Reply to a suggestion | Suggestion author, earlier repliers, translator | Someone replies |

Rules that hold for all of them:

- **Nobody is told about their own action.** Assigning yourself is silent.
- **A failing notification never fails the action.** Errors are logged and
  swallowed.
- **Reminders are sent once.** Each has a `dedupeKey` (stage, user, version,
  deadline); rerunning the sweep creates nothing new. Moving the deadline
  starts a fresh set.
- **Translation and review have separate deadlines.** The review deadline is
  optional (set in the Assign reviewer dialog); without it the review follows
  the document's deadline.
- **A date without a time is due at the end of that day** (UTC).

The catalogue of types, their labels and whether email is on by default lives
in `src/domain/notification/notification.catalog.ts`. Email is off by default
for approvals, suggestions and replies, which are frequent and visible in the
app anyway.

## Email

Email is one daily digest per person, sent at noon Central European Time
(`Europe/Zagreb`: CET in winter, CEST in summer, so always 12:00 on the clock).
It holds everything that was waiting at noon; what arrives in the afternoon
waits for the next day's digest, so nobody gets more than one email a day.
The bell shows everything straight away. Reading a notification in the app
before noon takes it out of the email. Anything unsent after 36 hours is
dropped rather than sent a day late.

The sweep still runs every 5 minutes for the in-app reminders; only the first
runs after noon send email. Each sweep sends at most 25 emails, 600 ms apart,
so a larger team is emailed over the next few runs. A failed send is retried by
the next sweep, up to 5 times, and a rate-limited provider stops the run.
The time and zone are `DIGEST_HOUR` and `DIGEST_TIME_ZONE` in
`src/domain/notification/notification.email.ts`.

### Look

`renderDigestEmail` in `src/domain/notification/notification.email.ts` follows
the Exodus 90 brand standards: the white-and-orange logo on brand black
(`public/email/exodus90-white-orange.png`, loaded from `NEXT_PUBLIC_APP_URL`),
Clash Display for headings, Lato for body text, orange only as an accent.
Each type has a tag and one of four tones, and the digest is sorted loudest
first: overdue work on brand black with an *Open now* button, work due soon
tinted and outlined in orange, things to act on (assignments, reviews, changes requested)
outlined in black, and the rest as quiet cards. The subject counts what is
late, e.g. "3 updates in Translation Helper (1 overdue, 1 due soon)". The
fonts load in Apple Mail and iOS; Gmail and Outlook fall back to Helvetica or
Arial, which the layout is built to survive.

### Providers

The sender is pluggable (`src/lib/email/`). Pick one with `EMAIL_PROVIDER`, or
leave it unset and the provider is inferred from whichever settings are present.
Without a provider, notifications stay in the app and the profile says email is
off.

| Variable | Example | Notes |
|---|---|---|
| `EMAIL_FROM` | `Translation Helper <notifications@example.org>` | Required for any email. |
| `EMAIL_REPLY_TO` | `team@example.org` | Optional. |
| `EMAIL_PROVIDER` | `resend` / `smtp` / `console` | Optional; `console` prints emails to the server log. |
| `RESEND_API_KEY` | `re_...` | Resend's HTTP API. |
| `SMTP_HOST` | `smtp.postmarkapp.com` | Any SMTP server. |
| `SMTP_PORT` | `587` | Defaults to 587. |
| `SMTP_SECURE` | `true` | TLS from the first byte. Defaults to true only on port 465; otherwise STARTTLS. |
| `SMTP_USER`, `SMTP_PASS` | | Optional. |
| `NOTIFICATIONS_SWEEP_SECRET` | random string | Bearer token for the sweep endpoint. |
| `NEXT_PUBLIC_APP_URL` | `https://translate.example.org` | Base for links in emails; falls back to `BETTER_AUTH_URL`. |

Postmark, SES, Mailgun, Brevo or a company relay all work through the SMTP
transport. Adding an HTTP API is one file in `src/lib/email/transports/`
implementing `EmailTransport`, plus a case in `resolveEmailTransport`.

### Resend free tier

100 emails a day, 3,000 a month, one sending domain. Verify the domain under
Resend → Domains (SPF and DKIM records at the DNS host) before `EMAIL_FROM` can
use it; until then Resend only delivers to the account owner's address. Digests
keep usage well under the limit for a small team.

## The sweep

`POST /api/notifications/sweep` with `Authorization: Bearer
$NOTIFICATIONS_SWEEP_SECRET`. It answers 503 when the secret is not set. A
Postgres advisory lock keeps two runs from overlapping.

Coolify: on the application resource, add a Scheduled Task:

- Name: `notifications-sweep`
- Frequency: `*/5 * * * *`
- Command: `curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATIONS_SWEEP_SECRET" http://localhost:3000/api/notifications/sweep`

The response is `{ deadlines: { checked, created }, email: { sent, failed,
waiting, dropped, rateLimited } }`, or `{ skipped }` when another run holds the
lock.

## Testing locally

`docker compose up -d mailpit` starts an SMTP server on port 1025 that catches
every email and shows it at <http://localhost:8025>. Nothing leaves the machine.

```bash
NOTIFICATIONS_SWEEP_SECRET="local-sweep-secret"
EMAIL_FROM="Translation Helper <notifications@localhost>"
EMAIL_PROVIDER="smtp"
SMTP_HOST="localhost"
SMTP_PORT="1025"
```

Restart the dev server after changing these. Then assign someone a translation
with a deadline and run the sweep. Outside production, `?now=` runs it as if it
were that moment, so reminders and digests don't need waiting for:

```bash
curl -X POST -H "Authorization: Bearer local-sweep-secret" "http://localhost:4000/api/notifications/sweep?now=2026-09-25T09:00:00Z"
```

Pick a `now` after the next noon (CET) following the notifications, e.g.
`2026-09-22T11:00:00Z` for anything created on 21 September; before that the
digest reports them as `waiting`. The bell shows them straight away.

To see missed deadlines, pick a `now` after a seeded deadline (they fall in
early October): the first run creates the overdue reminders and escalations,
and the same run emails them when the pretend time is after noon (CET) on a
later day than they were created. Reminders made this way are real rows dated from a
pretend future. They show in the bell and, because each reminder is sent once,
they stop the real ones from being created later. Clear them when done:

```bash
docker exec translation-helper-db psql -U postgres -d translation_helper -c "DELETE FROM notification WHERE type IN ('DEADLINE_APPROACHING','DEADLINE_PASSED','DEADLINE_ESCALATION')"
```
