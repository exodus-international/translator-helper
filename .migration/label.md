# label

2026-09-05, transformation engine (legacy new-york style, no golden pair). Verdict: migrated to native `<label>`; wrapper API unchanged for consumers.

## Changed

- src/components/ui/label.tsx — dropped `@radix-ui/react-label`; Label is now a plain `<label>`. Added `select-none` already present; radix's double-click text-selection prevention covered by the existing class. `group-data-[disabled=true]:*` rewritten to `group-data-disabled:*` (Base presence attribute).
- Leftover scan clean: `grep -n "radix-ui\|@radix-ui"` on this component's files → no matches.

## Left alone

Nothing.

## Behavior changes

None. Radix Label's only extra behavior (no text selection on double click) is CSS; retained.

## Verify by hand

- Click a label next to an input: focus should move to the control (htmlFor / wrapping).
- Double-click the label text: should not select text.
