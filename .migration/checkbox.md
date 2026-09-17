# checkbox

2026-09-05, transformation engine. Verdict: 1:1 migration to `@base-ui/react/checkbox`; data-state tokens rewritten; dead `:disabled` variants replaced.

## Changed

- src/components/ui/checkbox.tsx — `radix-ui` → `@base-ui/react/checkbox`. `data-[state=checked]:*` → `data-checked:*` (incl. dark variant). Radix Root rendered `<button>`; Base Root renders `<span>` with hidden input, so `disabled:cursor-not-allowed disabled:opacity-50` became dead — replaced with `data-disabled:` equivalents (per class-mapping.md), kept alongside the originals for safety.
- Consumer sweep: no `checked="indeterminate"` usage in app code (grep verified) — the split `indeterminate` boolean prop needed no call-site changes.
- src/components/ui/field.tsx:120 — `has-data-[state=checked]:*` → `has-data-checked:*` (Field wrapper styling the checkbox inside it).
- Leftover scan clean.

## Left alone

- src/components/ui/stepper.tsx (no radix).

## Behavior changes

- Checkbox is now a `<span>` + hidden input, not a `<button>`: `:disabled` CSS no longer applies (mitigated with `data-disabled:`); forms submission unchanged via hidden input.
- `onCheckedChange` gains an `eventDetails` second arg — no app handlers used the radix event param.

## Verify by hand

- Toggle checkboxes in filters/documents forms; check keyboard focus ring still visible.
- Disabled checkbox shows opacity-50 + not-allowed cursor.
