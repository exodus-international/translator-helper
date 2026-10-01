# tooltip

2026-09-05, transformation engine (positioner model). Verdict: migrated to Portal > Positioner > Popup; animation restated; delay prop renamed.

## Changed

- src/components/ui/tooltip.tsx — `radix-ui` → `@base-ui/react/tooltip`.
  - Provider: `delayDuration` → `delay` (wrapper default stays 0 via `delay = 0`).
  - Content → `Portal > Positioner > Popup`; positioning props (`side`, `sideOffset` default 4, `align`, `alignOffset`) declared/destructured/forwarded to Positioner per the Pick-forward rule (sidebar passes `side="right" align="center"`).
  - Positioner: `isolate z-50`; Popup keeps `z-50`.
  - Vars: `origin-(--radix-tooltip-content-transform-origin)` → `origin-(--transform-origin)`.
  - Animation: `animate-in/out fade/zoom/slide-*` restated as `transition-[opacity,transform]` + `data-starting-style:`/`data-ending-style:` with per-side translate (`data-[side=...]:data-starting-style:*`).
  - Arrow kept with its existing rotate-45 square styling; Base Arrow renders a `<div>` (was svg) — CSS classes unchanged.
- src/components/ui/sidebar.tsx — `TooltipProvider delayDuration={0}` → `delay={0}`; internal `TooltipTrigger asChild` → `render={button}`.
- src/app/admin/users/page.client.tsx:816 — `TooltipTrigger asChild` → `render`.
- Leftover scan clean.

## Left alone

Nothing.

## Behavior changes

- **FLAGGED:** Base UI Trigger delay default is 600; wrapper Provider passes `delay={0}` at the sidebar root and wherever TooltipProvider is used, matching the old wrapper default (radix default 700, wrapper default 0). `skipDelayDuration` → Provider `timeout` (default 300→400); not used in app code.
- Arrow geometry: Base positions the Arrow div itself; the translate-y/rotate trick was tuned for the svg arrow. Visual check required (flagged for hand-QA).
- `disableHoverableContent` has no equivalent — not used in this project.

## Verify by hand

- Hover icons/buttons for tooltips (admin users table, sidebar collapsed icons). Feel of delay, arrow alignment per side.
- Tooltip on the collapsed sidebar (side="right") points correctly at the trigger.
