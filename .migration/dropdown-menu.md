# dropdown-menu

2026-09-05, transformation engine (DropdownMenu → Menu canonical mapping). Verdict: migrated; `onSelect` semantics reworked at call sites; close-on-click parity preserved.

## Changed

- src/components/ui/dropdown-menu.tsx — `radix-ui` → `@base-ui/react/menu` (`Menu as DropdownMenuPrimitive`).
  - Parts: Root/Portal/Trigger same; Content → Portal > Positioner > Popup (`side`/`sideOffset` 4/`align`/`alignOffset` declared → forwarded); Label → GroupLabel; ItemIndicator → CheckboxItemIndicator/RadioItemIndicator; Sub → SubmenuRoot; SubTrigger → SubmenuTrigger (+ `data-popup-open:*` open styling per wrapper-shapes); SubContent composes `DropdownMenuContent` with `side="right" align="start" alignOffset={-3} sideOffset={0}` (load-bearing submenu defaults).
  - Positioner `isolate z-50 outline-none`; Popup keeps `z-50`/`outline-none`.
  - Vars: `--radix-dropdown-menu-content-available-height` → `--available-height`; transform-origin → `--transform-origin`.
  - Animation restated (starting/ending styles + per-side translate).
  - `data-[disabled]` → `data-disabled` presence (items).
- src/components/data-table/data-table-view-options.tsx — Trigger asChild → render; CheckboxItem `onSelect={(e)=>e.preventDefault()}` (keep-open) → removed (Base CheckboxItem defaults `closeOnClick={false}` = radix preventDefault parity).
- src/components/document-type-filter.tsx — Trigger asChild → render; two CheckboxItem `onSelect` preventDefault → removed (same parity); plain Item `onSelect` → `onClick` (Base Item closes on click by default = radix parity).
- src/app/admin/users/page.client.tsx:684 — Trigger asChild → render.
- Leftover scan clean.

## Left alone

- cmdk (command), combobox (already Base), stepper (custom).

## Behavior changes

- **FLAGGED:** `DropdownMenuLabel` now renders Base `GroupLabel`, which expects to live inside a `Menu.Group` for aria-labelledby wiring. App usages (data-table-view-options "Toggle columns") render it directly under Content — it renders fine; only the aria association is weaker than a Group-wrapped label. Not patched (flagged).
- CheckboxItem/RadioItem `onCheckedChange`/`onValueChange` gain `eventDetails` — no app handler used the extra radix arg.
- `textValue` → `label` — not used in app code.

## Verify by hand

- View-options menu on data tables: toggling a column does NOT close the menu (parity with old preventDefault).
- Document-type filter: same keep-open behavior; "Clear filter" closes the menu and clears.
- Admin users row action menu: items close on click, keyboard arrows + typeahead work.
