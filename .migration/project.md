# project

2026-09-05, whole-project migration, Radix UI → `@base-ui/react` 1.4.1 (pnpm), legacy `new-york` style.

Strategy: **transformation engine on the project's own files** — the style is legacy `new-york`, which has no `base-<style>` golden pair, so no CLI replay was possible. Wrappers kept their exact classes; primitives were rewired per the skill's family tables; class strings got the mechanical data-attribute/CSS-var rewrites; `animate-in/out` idioms were restated as `data-starting-style:`/`data-ending-style:` transitions. Consumers were swept against consumer-props.md.

## Dependency swap

- Removed: `radix-ui`, `@radix-ui/react-{alert-dialog,dialog,dropdown-menu,label,scroll-area,select,tabs}` (pnpm remove; lockfile clean of direct radix deps).
- Remaining `@radix-ui/*` in pnpm-lock.yaml are transitive (cmdk's internal radix dialog) — expected.
- `@base-ui/react` was already a dependency (resolved 1.4.1 at migration time; the skill references 1.6.0 — all used APIs verified against the installed `.d.ts`).

## Per-component work

17 components migrated, one commit each on branch `migrate-radix-to-base`:
label, separator, button, badge, checkbox, tabs, tooltip, scroll-area, popover, dialog, alert-dialog, sheet, dropdown-menu, select, sidebar (Slot users), avatar, status-dropdown (hand-rolled). See `.migration/<component>.md` for each.

## App-code sweep summary

- `asChild` → `render`: 24 call sites across 13 files (triggers, Button→Link/anchor compositions, data-table wrappers).
- Menu items: `onSelect` → `onClick`; keep-open `onSelect={e => e.preventDefault()}` → removed on CheckboxItem (Base `closeOnClick` defaults false) and `closeOnClick={false}` on status-dropdown items.
- Select: `onValueChange` null-widening wrapped at 16+ sites; `items` label maps added at every select site (Base `Select.Value` renders raw values otherwise); `''` sentinels → `value={x || null}`; one `|| undefined` uncontrolled bug avoided.
- Tooltip: `delayDuration` → `delay` (sidebar + admin users).
- Untouched by rule: cmdk (command), sonner, stepper (custom, no radix), Monaco/TanStack code, `data-[state=selected]` (TanStack), sidebar's own data-state API. combobox.tsx was already Base-authored (its tw-animate idiom left as-is).

## Verification

- `pnpm prisma generate` then baseline `tsc --noEmit`: 5 pre-existing errors (permissions/session/editor-store Prisma enums, data-table ColumnMeta) + bench/*.mts missing `@prisma/adapter-pg`. **Unchanged after migration — zero new type errors** (15 Select/Command type errors surfaced mid-migration were fixed).
- `pnpm test`: 343/343 pass.
- `eslint src`: 152 errors vs 156 at baseline (no new errors; the 3 missing-key errors introduced mid-sweep were fixed).
- `next build`: **Turbopack compile succeeds**; final TS check fails only on the pre-existing `bench/q.mts` `@prisma/adapter-pg` import (confirmed absent from package.json on `develop` too — pre-existing, not attributed to this migration).

## FLAG (whole-project, legacy style)

- **components.json still says `"style": "new-york"`, `"base": "radix"`.** Future `shadcn add` runs will deliver radix-flavored wrappers that conflict with these migrated files. Options: switch style/base when a base-new-york equivalent exists, adopt a `base-*` style intentionally (restyle risk), or add components manually. User decision — not changed.
- Base UI Portal renders a wrapping `<div>` (radix rendered none) — spot-check nested dialog/portaled z-index stacking.
- Default collision padding is 5 (radix 0) and collision boundary defaults to clipping ancestors — edge-anchored popovers may sit a few px differently.

## Remaining radix imports

0 wrappers remain on Radix (`rg "from ['\"]radix-ui|from ['\"]@radix-ui" src` → only a doc comment reference in use-callback-ref.ts).
