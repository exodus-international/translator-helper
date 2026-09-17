# separator

2026-09-05, transformation engine. Verdict: migrated to callable `@base-ui/react/separator`; `decorative` dropped.

## Changed

- src/components/ui/separator.tsx — `radix-ui` → `@base-ui/react/separator`; part is now callable (`SeparatorPrimitive` with no `.Root`); `decorative` prop removed (Base separator is always semantic `role="separator"`).
- Leftover scan clean.

## Left alone

Nothing. Consumers: none passed `decorative` (grep verified).

## Behavior changes

- Base separator always renders `role="separator"`; radix `decorative` (which this wrapper defaulted to `true`) removed that role. Any purely visual separator now announces to screen readers where it didn't before. FLAGGED, not patched.

## Verify by hand

- Screen-reader pass over a page with separators (settings page): expect "separator" announcements; acceptable per Base idiom, otherwise replace specific instances with a plain `<div aria-hidden>`.
