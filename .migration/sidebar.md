# sidebar

2026-09-05, transformation engine (Slot users). Verdict: five Slot/asChild components → useRender + mergeProps with `render` prop; tooltip wiring updated; component's own `collapsible`/`data-state` API untouched.

## Changed

- src/components/ui/sidebar.tsx
  - `import { Slot } from "radix-ui"` → `mergeProps` + `useRender` from `@base-ui/react/*`.
  - SidebarGroupLabel, SidebarGroupAction, SidebarMenuButton, SidebarMenuAction, SidebarMenuSubButton: `asChild ? Slot.Root : tag` → `useRender({ defaultTagName, render, props: mergeProps(...) })` (with the `data-*` literal cast); `asChild` prop replaced by `render` (call sites swept — none used asChild on these outside navigation.tsx patterns, grep verified).
  - Internal `<TooltipTrigger asChild>{button}</TooltipTrigger>` → `<TooltipTrigger render={button} />`; `TooltipProvider delayDuration={0}` → `delay={0}`.
  - `data-[state=open]:hover:*` on SidebarMenuButton / `data-[state=open]:opacity-100` on SidebarMenuAction → `data-popup-open:*` (these elements serve as Menu triggers; Base emits `data-popup-open`).
- Leftover scan clean.

## Left alone

- Sidebar's own `collapsible="offcanvas"`, `data-state="expanded|collapsed"`, `data-collapsible`, `data-side` attributes are the component's own API (also used by source-translation-viewer's `<Sidebar collapsible="offcanvas">`) — not radix, untouched.

## Behavior changes

- None expected beyond the popup-open marker rename; collapsed-icon hover reveals and tooltips behave as before.

## Verify by hand

- Desktop sidebar: collapse/expand (⌘/Ctrl+B), tooltips on collapsed icons, admin nav links active state, mobile sheet nav.
- Source translation viewer's right sidebar (offcanvas) still slides.
