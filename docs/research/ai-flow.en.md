# AI flow: status and open questions

Branch `feat/ai-flow`, as of 2026-11-02. English version of `docs/research/ai-flow.md`. The original feasibility research is in that file's history. `docs/AI_WORKFLOW.md` describes how the flow works and how to deploy it.

## What is done

- A switch on the language: Languages, the language, Settings, the Workflow card (Manual / AI). It applies only to newly uploaded documents. A version enters the AI flow on upload (or when a manager sends it there) and stays in it, so switching never breaks a document someone is working on.
- Uploading an English document sends the versions in AI languages to the AI. The translation runs in the background after the response goes out. Where the AI is unsure, it adds a comment (or a change suggestion when it has a better wording) as the user "AI Translator".
- Text review: every member of the language is a reviewer, translators included. The Approve text button sits in the AI workflow panel. Two different people approving moves the document on. An approval stays valid after later edits to the text (per your answer). Approving is blocked while any comment is open, including the AI's.
- Direct edits in review (2026-11-03): in the AI flow anyone on the team can press Edit text above the translation and change the text directly, not only through suggestions. The manual flow stays suggestion-only for reviewers, because there the translator owns the text. Each direct edit goes to the activity log with the text before and after it (edits by one person within five minutes merge into one entry), and View changes shows the diff. Outside In Review the server refuses a direct edit to an AI version.
- The AI prepares the audio text (the SSML from the Audio text tab, without the marks that should not be read aloud). If the AI changes the voice or drops a pause, the app throws the output away and runs the step again.
- Audio review: one person, Approve audio text in the status menu. Editing the text in this step does not send the document back (per your answer).
- Approved: the recording starts, the app waits for it to finish, checks YAML, frontmatter and lint (errors, not warnings), deploys, and turns on auto-merge for the PR. GitHub then merges once the required checks in the content repo's CI pass. So validation runs in the app and again, independently, in CI.
- A version cannot go back from the AI flow to the manual one (per your answer). In the AI flow a person can only approve the audio and deploy or undo a deploy.
- Failures: a step retries on its own up to three times. An error that retrying will not fix (a check failed, GitHub refused the PR or the auto-merge) waits for the language's manager and the Retry button.
- A document uploaded before the language switched: the manager sends it to the AI with the "Hand to the AI workflow" button in the editor.
- My Work on the dashboard shows AI documents to the whole team until each person has approved them. The whole team gets a notification when an AI draft is ready and when the audio text is ready.
- Tests: unit tests (transitions, rules, the whole orchestration with fakes), DB tests against the seeded database, and an E2E scenario from the AI draft to deploy with auto-merge. The full E2E suite passes locally, 42/42. While I wrote it, the E2E test found a real bug (octokit does not allow a GraphQL variable named `method`), now fixed.

## What has to happen before deploying

1. Set `AI_WORKFLOW_SWEEP_SECRET` and add the scheduled task `ai-workflow-sweep` in Coolify (the command is in `docs/AI_WORKFLOW.md`). Without it, documents waiting for their recording never finish deploying.
2. In the content repository, turn on "Allow auto-merge" and set required status checks on `main`. Without required checks GitHub treats the PR as mergeable right away, and the app merges it without waiting for CI.
3. Optionally set `AI_WORKFLOW_MODEL` (default `gpt-4.1`). The model must support structured output.

## Open questions

Where I could not wait for an answer, I picked the default. Each question says how it works now.

1. **Does the audio have to be approved by someone other than the two who approved the text?** You wrote "another reviewer will do it". Right now anyone on the team can, including one of those two. Requiring a third person is a small change.

2. **The "WAITING FOR REVIEW" status.** I used the existing PENDING_REVIEW status ("In Review" in the app), so the review editor, the kanban and the filters work unchanged. The only new statuses are AI Translating, AI Preparing Audio and Audio Review. Do you want the AI flow to have its own "Waiting for Review" name?

3. **AI comments block text approval.** A reviewer has to resolve them (apply or dismiss), or Approve text stays disabled. Is that right, or should AI comments be informational only?

4. **Sending documents to the AI in bulk.** When a language switches to AI or joins a project, its older documents do not go to the AI on their own (that would spend tokens on the whole project at once). The manager sends them one at a time. Do you want a "send all unstarted documents in this project to the AI" button?

5. **The English original changes after the AI translation.** Right now nothing happens, same as in the manual flow. Should the AI translate again in that case, or at least add a comment saying the original changed?

6. **Auto-merge merges the language's whole PR.** One branch and one PR per language collects every deploy, manual and AI. So auto-merge also merges any manual deploys waiting in that PR. Is that a problem? The alternative is a separate branch and PR for each AI document.

7. **What blocks an automatic deploy.** Lint errors block it (mostly parity: a different number of headings or links than the original), warnings do not. Is that enough, or should more rules be added?

8. **Number of approvals.** Fixed at 2. Should it be a setting on the language?

9. **The "AI Translator" user.** It exists in the database so that comments and drafts have an author. It cannot sign in and is not on any team. I hid it from the admin user list so nobody bans or deletes it. Should it show up anywhere else, for example in statistics?

10. **Model.** Resolved 2026-11-02. The AI flow has its own variable, `AI_WORKFLOW_MODEL`, default `gpt-4.1`. On the document "God's Rescue Mission" (1,600 words), `gpt-4o-mini` left 0 notes with the old prompt and 3 with the new one, two of them on quotes it could not find in the text. `gpt-4.1` left 6 notes, each with an alternative the reviewer can accept in one click. `gpt-5-mini` left English sentences in the translation, so do not use it. The editor's AI translate button still uses `CHATGPT_MODEL`.

    Follow-up question: which language should the AI write its comments in? The prompt says English, but `gpt-4.1` wrote them in Czech. For the Czech team, Czech is probably better. Should I switch it to the target language?

11. **Notifications to the whole team.** Every AI draft notifies every member of the language. With the Czech team and many documents, that can add up. Keep it, or send an email digest only?

12. **Who may press Retry.** Right now the language's manager and admins, because a retry costs tokens and can end in a deploy. Should anyone on the team be allowed to?

13. **Edits after an approval.** An approval stays valid after the text changes. Right now, though, a person who already approved is not told that someone changed the text after them. Should they get a notification linking to the diff, or is the activity log enough?
