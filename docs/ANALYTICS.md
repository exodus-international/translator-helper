# Product Analytics (PostHog)

How we track usage, and how to turn the raw events into insight in the PostHog UI.

## How it's wired (code)

- **Provider:** `src/components/posthog-provider.tsx` — initializes PostHog, enables
  autocapture + history-based pageviews (`defaults: '2025-05-24'`) and exception
  autocapture (`capture_exceptions: true`), identifies the logged-in user, and
  `reset()`s on logout.
- **Event catalog + helpers:** `src/lib/analytics.ts`
  - `capture(event, props)` — typed product events (names are a compile-time union).
  - `setProjectGroup(projectId, { name })` — group analytics (see below).
  - `captureException(error, props)` — manual error reporting.
- **Group binding:** `useAnalyticsProjectGroup(projectId, name)`
  (`src/components/analytics-project-group.tsx`) is called on project-scoped pages
  (project detail, translate editor, review editor) so events there are associated
  with a `project` group.
- **Config:** `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`. These are
  build-time `NEXT_PUBLIC_*` vars — set them in Coolify for **staging and production**.

### Adding a new event
1. Add the name to the `AnalyticsEvent` union in `src/lib/analytics.ts`.
2. Call `capture('event_name', { ...props })` from a **client** handler, on the
   success path, before any redirect. Props = IDs/enums/booleans/counts only — no PII.

### Group analytics caveat
`setProjectGroup` associates events with a project **until the next call or `reset()`**.
Events fired outside a project (global dashboard, admin) carry whatever project was set
last. Always **filter project-level insights by the `project` group** — there it's accurate.

### Language as a team dimension (super property)
Every event carries a `language` super property (the readable code, e.g. `es`) plus
`language_name`, set via `setActiveLanguage` / `useActiveLanguage` on the editors and the
language selectors (project detail, dashboard, kanban). This lets you **break down any
insight by `language`** to compare how each language team works. A `language_switched`
event also fires when a user changes the language selector. Same persistence caveat as
groups: it reflects the user's most-recently-worked language until changed or logout.

---

## First-time PostHog project setup

1. **Set up the `project` group type:** Project → Settings → *Group Analytics* →
   ensure a group type named `project` exists (it's created automatically once events
   with `$groups.project` arrive).
2. **Enable Session Replay** (optional, recommended): Project → Settings → *Replay*.
   ⚠️ Before enabling, add masking for translation content (Monaco editor, rendered
   markdown, suggestion text) so real user content isn't recorded. Ask before turning
   this on.
3. **Enable Error Tracking:** Project → Settings → *Error Tracking* (the SDK already
   sends exceptions via `capture_exceptions`).

---

## Dashboards to build

### 1. Translation Workflow Funnel (the core insight)
Insight type: **Funnel**. Shows where documents/users drop off in the pipeline.

Steps (in order):
1. `document_created`
2. `translation_started`
3. `ai_translate_triggered`  *(optional step — measures AI adoption)*
4. `submitted_for_review`
5. `document_status_changed` where property `to` = `APPROVED`
6. `document_deployed`

Tips:
- Set the conversion window to something realistic (e.g. 30 days).
- **Break down by** `role`, `language` (compare language teams), or by the `project` group.
- Duplicate it filtered to a single `project` group to inspect one project's health.

### 2. Feature Adoption (Trends)
Insight type: **Trends**, one series per event, "Unique users", weekly:
- `ai_translate_triggered` — AI translation adoption
- `suggestion_created` — review collaboration usage
- `github_deploy_retried` — deploy friction signal
- `document_upload_started` broken down by `method` (`drag_drop` vs `browse`)

### 3. Where users get stuck (Trends / ratios)
- `document_status_changed` broken down by `from` → `to` to see which transitions
  dominate (and which backward transitions happen — rework signal).
- Ratio of `ai_translate_triggered` with `overwrite = true` vs `false` — how often
  people redo AI translations.

### 4. Per-project health (Group dashboard)
Insight type: **Trends**, aggregated **by `project` group**:
- `document_deployed` count per project (throughput)
- Active projects = projects with any event in the last 14 days
- Stalled projects = had `document_created` but no `document_deployed` in 30 days
  (build as a funnel filtered to the project group, or a cohort).

### 5. Retention
Insight type: **Retention**.
- Returning event: any of `translation_saved`, `submitted_for_review`, `suggestion_created`.
- Break down by `role` to compare translator vs reviewer retention.

---

## Useful cohorts
- **Active translators:** users with `translation_saved` in the last 7 days.
- **Reviewers:** users with `suggestion_created` OR `submitted_for_review`.
- **Admins doing setup:** users with `invitation_created` OR `language_created`.
- **AI adopters:** users with `ai_translate_triggered` ≥ 3 times.

## Event reference
The full list of tracked events lives in the `AnalyticsEvent` union in
`src/lib/analytics.ts` — that file is the single source of truth for event names.

### Audio events
Fired from client handlers only (the status dropdown and the audio card), never from server actions.

| Event | When | Properties |
|---|---|---|
| `audio_generation_triggered` | Approval started an audio generation | `documentVersionId` |
| `audio_regeneration_triggered` | Regenerate, Retry or Generate pressed on the audio card | `documentVersionId`, `reason` (`regenerate`, `retry`, `generate`) |
| `audio_playback_started` | The inline player started playing (once per page view) | `documentVersionId`, `provider`, `voice` |
| `audio_url_copied` | Copy URL pressed | `documentVersionId` |
| `audio_generation_failed` | The card observed a failed generation, or approval reported one | `documentVersionId`, `kind` (`configuration`, `content`, `provider`, `unknown`) |
