# Release Process

How we ship Translation Helper to production. One source of truth — follow it the same way whether you're a human or asking Claude to do it.

## TL;DR (normal release)

`develop` and `production` are **protected** — every change reaches them through a PR. A release is therefore **two PRs**: one bumps the version into `develop`, one promotes `develop` to `production`.

```bash
pnpm test && pnpm lint                 # must be green

# PR 1 — version bump → develop (the script opens this PR)
pnpm release:prepare minor             # patch | minor | major
# …review & merge the release/vX.Y.Z → develop PR on GitHub…

# PR 2 — promote develop → production (this is the deploy)
gh pr create --base production --head develop --title "release: vX.Y.Z" --fill
# …review the diff, merge → Coolify auto-deploys production…

pnpm release:tag vX.Y.Z                # tag + GitHub Release, after deploy
```

That's the whole flow. The rest of this document explains each piece.

## Branch model

```
feature/*      ──PR (squash)──▶ develop ──promote PR──▶ production
release/vX.Y.Z ──release PR───▶  │                        │
                           Coolify: staging         Coolify: live
```

| Branch           | Purpose                                          | Coolify deploy |
| ---------------- | ------------------------------------------------ | -------------- |
| `feature/*`      | One change per PR, squash-merged into `develop`   | —              |
| `release/vX.Y.Z` | Version bump + changelog; PR'd into `develop`      | —              |
| `develop`        | Integration branch; always releasable (protected) | **staging**    |
| `production`     | What's live for users (protected)                 | **production** |

Both `develop` and `production` are **protected**: no direct pushes, every change lands via PR.

**Coolify auto-deploys every commit** on the long-lived branches. So:

- Merging a PR into `develop` → staging redeploys. Test there.
- Merging the promote PR into `production` → production redeploys. That merge **is** the release.

There is no separate "deploy" button to press — promoting the code is deploying it.

## Versioning

We use [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`), driven by the [Conventional Commits](https://www.conventionalcommits.org/) we already write:

| Commit types in the release      | Bump    | Example         |
| -------------------------------- | ------- | --------------- |
| `fix:` only                      | `patch` | 1.2.0 → 1.2.1   |
| any `feat:`                      | `minor` | 1.2.1 → 1.3.0   |
| `feat!:` / `BREAKING CHANGE:`    | `major` | 1.3.0 → 2.0.0   |

You pass the bump type to `release:prepare`; pick it by looking at what landed on `develop` since the last release. `CHANGELOG.md` is generated from these commits, so keep writing good `feat:` / `fix:` messages.

> First standardized release is **`v1.0.0`** — run `pnpm release:prepare major` for it. It promotes everything currently ahead on `develop` and becomes the baseline.

## Normal release — step by step

### 1. Preconditions

- Your working tree is clean (the script branches off `origin/develop`, so you don't need to be on `develop` yourself).
- Tests and lint pass: `pnpm test && pnpm lint`.
- Staging (the `develop` Coolify deploy) looks healthy — this is your last check before going live.

### 2. Prepare the release (PR 1 → develop)

```bash
pnpm release:prepare <patch|minor|major>
```

This script (`scripts/release.sh`):

1. Verifies the working tree is clean and fetches the latest `origin/develop` (aborts otherwise).
2. Creates a `release/vX.Y.Z` branch off `origin/develop`.
3. Bumps the version in `package.json` (no tag yet).
4. Regenerates `CHANGELOG.md` from the commit history.
5. Commits `chore(release): vX.Y.Z`, pushes the branch, and opens a PR into `develop`.

Review and **merge that PR** on GitHub. `develop` now carries the version bump and changelog (and staging redeploys with them).

### 3. Promote to production (PR 2 → production)

```bash
gh pr create --base production --head develop --title "release: vX.Y.Z" --fill
```

The PR diff `develop → production` is **exactly what will go live**. Skim it. Pay special attention to any new Prisma migrations (see [Database migrations](#database-migrations-read-this)).

### 4. Merge → deploy

Merge the promote PR on GitHub. Coolify picks up the new `production` commit and redeploys. The build runs `prisma generate && prisma migrate deploy && next build`, so **pending migrations apply automatically** during deploy.

Watch the Coolify deploy logs until it's healthy, then smoke-test the live app.

### 5. Tag the release

Once production is confirmed healthy:

```bash
pnpm release:tag vX.Y.Z
```

This (`scripts/release-tag.sh`) tags the production commit `vX.Y.Z`, pushes the tag, and — if the `gh` CLI is available — creates a GitHub Release with that version's changelog section. Tags give you a clean "what shipped when" history and an anchor for rollbacks.

## Database migrations (read this)

Because `prisma migrate deploy` runs on every production deploy, and Coolify may briefly run old and new code together, **migrations must be backward-compatible with the previously deployed code**. Use expand → contract across releases:

- **Adding** a column/table/index → safe, do it in one release.
- **Renaming / removing** a column still read by live code → do it in **two** releases:
  1. Release A: add the new shape, write to both, stop reading the old.
  2. Release B (after A is live): drop the old column.
- Never combine "drop a column" with code in the **same** release that still reads it.

When a release PR contains a migration, call it out in the PR description.

## Hotfixes

For an urgent fix that can't wait for the normal `develop` cycle:

```bash
git checkout production && git pull
git checkout -b fix/urgent-thing
# …make the fix, commit with a fix: message…
git push origin fix/urgent-thing
gh pr create --base production --head fix/urgent-thing --title "fix: urgent thing" --fill
```

Merge it → Coolify deploys. Then tag, and back-merge into `develop` via a PR (it's protected, so no direct push):

```bash
pnpm release:tag vX.Y.(Z+1)        # patch tag for the hotfix
git fetch origin
git checkout -b sync/hotfix-vX.Y.Z origin/develop
git merge origin/production        # bring the fix onto a branch off develop
git push -u origin sync/hotfix-vX.Y.Z
gh pr create --base develop --head sync/hotfix-vX.Y.Z --title "sync: hotfix vX.Y.Z back to develop" --fill
```

The back-merge is essential — otherwise the next normal release would silently revert the hotfix.

## Rollback

Production deploys are just commits, and each release is tagged, so:

1. In Coolify, redeploy the previous healthy commit/tag (or revert the merge on `production` and let Coolify redeploy).
2. **Migrations are not auto-rolled-back.** A redeploy reverts code, not schema. If a release added a destructive migration, prefer a **forward fix** (a new patch release that repairs the data/schema) over rolling back. This is why migrations stay backward-compatible.

## Letting Claude run a release

You can hand the whole flow to Claude. A prompt like:

> "Cut a `minor` release. Run the tests and lint first, then run `pnpm release:prepare minor` — it'll open the release PR into `develop`. Stop there so I can review and merge it."

Claude runs the script and opens PR 1, then pauses. After you've merged it, follow up:

> "Release PR is merged. Open the promote PR `develop → production`, but don't merge it — I'll review and merge."

And once you've merged the promote PR and confirmed Coolify is healthy:

> "Production deploy is healthy — tag the release with `pnpm release:tag vX.Y.Z`."

Claude never merges PRs or trusts the deploy for you — a human merges each PR (both branches are protected anyway), confirms staging then live are healthy, and only then is the release tagged.

## Reference

- `scripts/release.sh` — `pnpm release:prepare <bump>`
- `scripts/release-tag.sh` — `pnpm release:tag <vX.Y.Z>`
- `pnpm changelog` — regenerate `CHANGELOG.md` on its own (rarely needed directly)
