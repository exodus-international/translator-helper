# dialog

2026-09-05, transformation engine (centered modal, no positioner). Verdict: Overlay→Backdrop, Content→Popup; animations restated; Portal renders a div (flagged).

## Changed

- src/components/ui/dialog.tsx — `@radix-ui/react-dialog` → `@base-ui/react/dialog`.
  - Overlay → `Backdrop`: animate-in/out restated as `transition-opacity duration-200` + `data-starting-style:opacity-0 data-ending-style:opacity-0`.
  - Content → `Popup`: centered modal (no Positioner); zoom/fade restated as `transition-[opacity,scale] duration-200` + starting/ending `scale-95 opacity-0` (Tailwind v4 `scale` is a separate CSS property, so the centering `translate-x/y-[-50%]` is not clobbered).
  - Close button: `data-[state=open]:*` → `data-open:*`.
- Consumer sweep — `DialogTrigger asChild` → `render`:
  - src/components/admin-list-page.tsx:52, src/components/project-team-tab.tsx:208, src/app/dashboard/page.client.tsx:442, src/app/projects/[project]/translations/page.client.tsx:158, src/app/projects/[project]/translations/[translationProjectId]/page.client.tsx:274,427.
- Leftover scan clean.

## Left alone

- src/components/ui/command.tsx (cmdk) — only touched its `children` type narrowing (`Omit<…, "children"> & { children?: ReactNode }`) because Base Popup's payload-children type leaked into CommandDialog; the cmdk parts are untouched.
- src/components/source-translation-viewer.tsx:613 — `AlertDialogTrigger asChild` inside a commented-out block; left as-is.
- src/components/ui/stepper.tsx — hand-rolled; internal `forceMount` prop is its own API.

## Behavior changes

- Base Portal renders a wrapping `<div>` (radix Portal rendered nothing extra). Existing portals target body; spot-check z-index stacking of nested dialogs (flagged).
- `onOpenAutoFocus`/`onCloseAutoFocus`/dismiss callbacks unused by consumers — no restructures needed.
- `modal={false}` (project-team-tab add-member dialog) remains valid — Base widened `modal` to `boolean | 'trap-focus'`.

## Verify by hand

- Open/close the create-project dialog: fade+zoom feel, focus goes into the dialog, Esc closes, background scroll locked (except the non-modal team dialog).
- Announcement modal CTA link still navigates and closes.
