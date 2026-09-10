# button

2026-09-05, transformation engine + real Base Button primitive. Verdict: migrated to `@base-ui/react/button`; `asChild` API replaced by `render`; all consumer call sites swept.

## Changed

- src/components/ui/button.tsx — `Slot` idiom (`asChild ? Slot.Root : "button"`) replaced by the real Base `ButtonPrimitive`, which supports `render` natively. Public variants/classes untouched (your look stays yours).
- Consumer sweep (asChild → render), all files:
  - src/components/navigation.tsx:218 (Button → Link)
  - src/components/audio-status.tsx:227 (Button → `<a download>`)
  - src/components/announcement-modal.tsx:58 (Button → Link with onClick)
  - src/app/documents/_editors/edit.client.tsx:159 (Button → Link)
  - src/app/documents/new/page.client.tsx:294 (Button → `<span>` inside label; `nativeButton={false}` set)
  - src/app/documents/page.client.tsx:199,290 (Button → Link)
  - src/components/ui/combobox.tsx:77 (InputGroupButton wraps Base Button; asChild → render)
- Leftover scan clean.

## Left alone

- src/components/ui/stepper.tsx — hand-rolled component with its own internal `asChild` implementation; no radix import (hard rule: untouched).

## Behavior changes

- Base Button is focusable-when-disabled semantics only via `focusableWhenDisabled` (default `false` ≈ radix). No delta observed.
- New Document/Browse Files/Download buttons render `<a>`/`<span>` via `render` — verify pointer cursor and href navigation.

## Verify by hand

- Click "New Document" from documents page header: navigates, keeps button styling.
- Download audio file: anchor download still works.
- Browse Files on document creation: opens file picker (label wraps the button).
