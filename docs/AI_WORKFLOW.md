# AI workflow

A language can run in one of two workflows, set under Languages, the language,
Settings, Workflow.

- **Manual.** A translator drafts, a reviewer approves, a manager deploys.
  Nothing about it changed.
- **AI.** The AI drafts, two people from the language team approve the text,
  the AI prepares the audio text, one person approves it, and the document
  deploys and merges on its own.

Switching a language changes only what happens to documents uploaded from then
on. A version joins the AI workflow when the upload, or a manager, hands it to
the AI, and it stays there, so a version never ends up halfway through the
other workflow. A person cannot move a version back to the manual workflow.
Versions created any other way (a language added to a project later, an
assignment) start in the manual workflow and wait for the manager.

## The steps

```
upload ─▶ AI Translating ─▶ In Review ─▶ AI Preparing Audio ─▶ Audio Review ─▶ Approved ─▶ Deployed
            (the AI)       (2 approvals)      (the AI)         (1 approval)   (the app)
```

1. **AI Translating.** Uploading a document hands every version in an
   AI-workflow language that nobody has started to the AI. It uses the same
   model and prompt as the editor's AI translate button, including the
   language's own instructions, and also returns notes on what it is unsure of.
   Each note becomes a comment by "AI Translator" on the passage it is about,
   or a change suggestion when the AI has a better wording. When the AI's quote
   cannot be found in its own draft, the note becomes a general comment that
   quotes the passage.
2. **In Review.** Everyone on the language team reviews, translators included,
   because the AI is the translator. Anyone on the team can edit the text and
   comment. The AI workflow panel in the editor's sidebar has **Approve text**.
   It is disabled while any comment is open, the AI's included. The second
   approval from a different person moves the version on. An approval stays
   valid when the text is edited afterwards, and anyone can withdraw their own
   approval until the second one lands.
3. **AI Preparing Audio.** The AI takes the audio text the app would derive
   (the same SSML as the Audio text tab) and removes what a narrator should
   not read: reference marks, stray symbols, leftover Markdown. Its result is
   refused, and the step retried, when the voice changed or a pause went
   missing. It is stored as an edited audio text, so the Audio text tab shows
   it.
4. **Audio Review.** One person checks the Audio text tab, edits it if needed,
   and chooses **Approve audio text** in the status menu. Text edits made here
   do not send the document back: the team trusts that they are for the audio.
5. **Approved.** Approval starts the recording, as in the manual workflow. The
   app waits for the recording to finish, then checks the document: a YAML
   file must parse, Markdown frontmatter must parse, and the content lint must
   find no errors. It then deploys, which opens or updates the language's pull
   request, and asks GitHub to merge it once the content repository's
   required checks pass.

A document that gets no audio (the language has no voice, or the project does
not record that document type) skips steps 3 and 4: the second text approval
moves it straight to Approved.

## When a step fails

The editor's AI workflow panel shows the error. A step that failed for a
reason that may pass (the model timed out, its output was refused) is retried
by the scheduled sweep, up to three attempts in all. A step that will fail
again the same way waits for a person: a document that fails the deploy
checks, a pull request GitHub refused, or auto-merge GitHub would not turn on.
The language's manager, or an administrator, presses **Retry** in the panel
after fixing the cause.

A manager can undo a deploy (Deployed back to Approved) as in the manual
workflow. The app does not deploy a version again on its own once it has a
pull request; the manager deploys it from the status menu. A version in a
project that is not deployed to GitHub has no pull request, so the sweep would
move it straight back to Deployed.

## Starting a document by hand

A document uploaded before its language switched to the AI workflow waits as
Not Started. Its language's manager sees **Hand to the AI workflow** in the
translate editor's sidebar. A translator assigned to it who never started is
replaced by the AI.

## Setup

### Environment

| Variable | Example | Notes |
|---|---|---|
| `CHATGPT_API` | | The model key the editor's AI translate button already uses. |
| `CHATGPT_MODEL` | `gpt-4o-mini` | The model must support structured output (`response_format: json_schema`). |
| `AI_WORKFLOW_SWEEP_SECRET` | random string | Bearer token for the sweep endpoint below. |
| `AI_WORKFLOW_AUTO_MERGE` | `false` | Optional. `false` deploys without asking GitHub to merge, so a person merges. Anything else, or unset, merges. |
| `GITHUB_AUTO_MERGE_METHOD` | `MERGE` | Optional. `MERGE`, `SQUASH` or `REBASE`. |

### Scheduled sweep

The steps start as soon as the action that triggers them answers, so the sweep
is not the main engine. It catches what the first run did not finish: a
deploy waiting for its recording, a retry after a failure, a step whose server
restarted mid-run.

Coolify: on the application resource, add a Scheduled Task:

- Name: `ai-workflow-sweep`
- Frequency: `*/2 * * * *`
- Command: `curl -fsS -X POST -H "Authorization: Bearer $AI_WORKFLOW_SWEEP_SECRET" http://localhost:3000/api/ai-workflow/sweep`

The response is `{ checked, done, waiting, failed, skipped }`.

### GitHub

Auto-merge is GitHub's own feature, so the content repository has to allow it:

1. Settings, General, Pull Requests: tick **Allow auto-merge**.
2. Branch protection (or a ruleset) on `main`: require the CI status checks
   that validate YAML and Markdown.
3. The GitHub App needs `Pull requests: write` and `Contents: write`, which
   deploying already uses.

Without step 2 GitHub treats every pull request as mergeable at once, and the
app merges it straight away without waiting for CI. Without step 1 GitHub
refuses, and the version reports "automatic merge could not be turned on".

One pull request per language branch collects every deploy for that language,
manual and AI alike. Auto-merge merges the whole pull request, so it also
merges manual deploys that are waiting in it.

## The AI user

Everything the AI writes is attributed to the user "AI Translator"
(`ai-translator@translation-helper.invalid`, id
`00000000-0000-4000-8000-00000000a1a1`). The migration creates it and the app
recreates it when a reseed removed it. It has no password, no account and no
language, so it cannot sign in and never shows in a team.

## Code

- `src/domain/document-version/document-version.transitions.ts`: both
  workflows' transitions, and which moves a person may make.
- `src/domain/ai-workflow/ai-workflow.service.ts`: approvals and the AI steps,
  built with `createAiWorkflow(deps)` and tested with fakes.
- `src/domain/ai-workflow/ai-workflow.rules.ts`: approvals needed, retries,
  locating a note, the deploy checks and the audio text checks.
- `src/domain/ai-workflow/ai-workflow.llm.ts`: the two prompts.
- `src/domain/ai-workflow/ai-workflow.runtime.ts`: the real wiring and the
  sweep.
- `src/components/ai-workflow-panel.tsx`: the editor panel.
- `e2e/features/ai-workflow.feature`: the scenario from AI draft to deploy.
