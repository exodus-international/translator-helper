# status-dropdown

2026-09-05, transformation engine (hand-rolled radix composition, no wrapper). Verdict: rewired to `@base-ui/react/menu`; stay-open item behavior preserved via `closeOnClick={false}`.

## Changed

- src/components/status-dropdown.tsx
  - `import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'` → `import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu'`.
  - Trigger: `asChild` → `render={triggerButton}` (Button renders a native `<button>`, so `nativeButton` default is correct).
  - Content → `Portal > Positioner > Popup` with `align="start" sideOffset={4}` on the Positioner; Positioner `isolate z-50 outline-none`.
  - Item `onSelect={(e) => { e.preventDefault(); … }}` → `closeOnClick={false}` + `onClick={…}`: radix used preventDefault to keep the menu open until the async transition finished (`setOpen(false)` closes it explicitly); Base `closeOnClick={false}` is the direct equivalent.
- Leftover scan clean.

## Left alone

- deploy-confirm dialog / sonner toasts (not radix).

## Behavior changes

- None intended. Menu closes only after `setOpen(false)` in `handleStatusChange`, exactly as before.
- Note: while `loading`, items are disabled; the current-status item stays disabled (unchanged logic).

## Verify by hand

- Open the status dropdown on a document: items show; picking one keeps the menu open during the async action, then closes; blocked items (open suggestions) show the warning toast and keep the menu open.
- DEPLOYED flow: confirm dialog appears before deploy.
