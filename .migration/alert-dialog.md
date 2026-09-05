# alert-dialog

2026-09-05, transformation engine. Verdict: Overlay→Backdrop, Content→Popup, Cancel→Close; Action reuses Close (flagged); initial focus change (flagged).

## Changed

- src/components/ui/alert-dialog.tsx — `@radix-ui/react-alert-dialog` → `@base-ui/react/alert-dialog`.
  - Overlay → Backdrop; Content → Popup; animations restated (fade/zoom → starting/ending styles, duration-200).
  - `AlertDialogCancel` → `AlertDialogPrimitive.Close` with outline button variants.
  - `AlertDialogAction` → **`AlertDialogPrimitive.Close`** with destructive variants: Base has no Action part; per the skill the shadcn-base idiom is Close-with-action-semantics (clicking still dismisses, same as radix Action). Consumers' `onClick` handlers still run.
- Consumer sweep — `AlertDialogTrigger asChild` → `render`:
  - src/components/admin-list-page.tsx:94, src/components/project-team-tab.tsx:303, src/app/admin/users/page.client.tsx:897, src/app/documents/page.client.tsx:418, src/app/documents/_editors/translate.client.tsx:374,412, src/app/projects/[project]/translations/[translationProjectId]/page.client.tsx:379,521.
- Leftover scan clean.

## Left alone

- src/components/source-translation-viewer.tsx:613 — inside commented-out code.

## Behavior changes

- **FLAGGED (initial focus):** Radix alert-dialog focused the Cancel button on open; Base focuses the first tabbable element (usually the destructive Action). To restore radix behavior, pass `initialFocus` on Popup (not done — flagged per hard rules).
- **FLAGGED:** Base alert-dialog never closes on outside press (by design); radix behaved the same (alert dialogs are outside-press-immutable), so parity holds.
- Action/Cancel both render `Close` — if a consumer ever needs "run handler but stay open", it must use controlled `open` instead (none do today).

## Verify by hand

- Delete confirmations (documents, team members, invitations): destructive button still fires the handler and closes; Cancel/outline button closes; Esc closes.
- Check where focus lands on open — if it must be Cancel, add `initialFocus`.
