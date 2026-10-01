# sheet

2026-09-05, transformation engine. Verdict: slide animations rewritten to data-starting/ending-style per side; Overlay→Backdrop, Content→Popup.

## Changed

- src/components/ui/sheet.tsx — `radix-ui` Dialog → `@base-ui/react/dialog`.
  - Overlay → Backdrop with `transition-opacity duration-500 data-ending-style:opacity-0 data-starting-style:opacity-0`.
  - Content → Popup: `animate-in/out slide-in-from-*` replaced by explicit per-side `data-starting-style:`/`data-ending-style:` translates (`translate-x-full` right, `-translate-x-full` left, `-translate-y-full` top, `translate-y-full` bottom); kept `transition ease-in-out duration-500 data-ending-style:duration-300` (radix had duration 500 open / 300 closed).
  - Close: `data-[state=open]:bg-secondary` → `data-open:bg-secondary`.
- src/components/navigation.tsx:127 — `SheetTrigger asChild` → `render={<Button …/>}`.
- Leftover scan clean.

## Left alone

- vaul/drawer not present in this project; nothing else sheet-related.

## Behavior changes

- Mobile nav sheet (side="left") and thread sidebar (side="right"): enter/exit now CSS-transition based; exit duration 300 vs enter 500 preserved via `data-ending-style:duration-300`.
- Base Popup keeps the element mounted during exit animations internally; no `forceMount` was used.

## Verify by hand

- Resize to mobile, open hamburger nav: slides in from left, slides out on link click/close; backdrop fades.
- Thread sidebar (right sheet) opens/closes with correct direction.
