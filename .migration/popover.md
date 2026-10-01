# popover

2026-09-05, transformation engine (positioner model). Verdict: Content → Portal > Positioner > Popup; Anchor inert; animation restated.

## Changed

- src/components/ui/popover.tsx — `radix-ui` → `@base-ui/react/popover`.
  - Content → Portal > Positioner > Popup; `align` (default "center"), `sideOffset` (default 4), plus `side`/`alignOffset` declared → destructure → forwarded to Positioner. Positioner `isolate z-50`, Popup keeps `z-50`.
  - Vars: `--radix-popover-content-transform-origin` → `--transform-origin`.
  - Animation restated with `data-starting-style`/`data-ending-style` + per-side translate.
  - `PopoverAnchor` has no Base part — kept as an **inert passthrough `<div>`** (flagged; no consumer uses it — grep verified).
- src/components/data-table/data-table-faceted-filter.tsx:81 — `PopoverTrigger asChild` → `render={<Button …/>}`.
- Leftover scan clean.

## Left alone

- src/components/ui/combobox.tsx — already authored against Base UI (uses its own Positioner/Popup); intentionally untouched.

## Behavior changes

- Positioning defaults preserved (align center, sideOffset 4). Base collision padding default is 5 vs radix 0 — minor edge-positioning difference, flagged.
- Portal now renders a `<div>` wrapper (radix rendered no extra element) — should be inert, flagged for spot-check.
- Dismiss callbacks (`onEscapeKeyDown` etc.) not used by consumers; would move to Root `onOpenChange` reasons if ever needed.

## Verify by hand

- Faceted filter popover on data tables: opens above/below correctly, aligns to start, closes on outside click and Esc.
- Select a filter value; popover closes; badge count updates.
