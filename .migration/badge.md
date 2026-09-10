# badge

2026-09-05, transformation engine (useRender + mergeProps worked example). Verdict: migrated; `asChild` → `render` at the wrapper level; no `asChild` call sites existed for Badge.

## Changed

- src/components/ui/badge.tsx — `Slot as SlotPrimitive` from `radix-ui` → `useRender` + `mergeProps` from `@base-ui/react/use-render` / `@base-ui/react/merge-props` (badge is a non-button polymorphic span; the worked-example cast of the `data-*` literal applied). `Badge` and `BadgeButton` both converted; `asChild` prop replaced by `render`. cva definitions untouched.
- Leftover scan clean.

## Left alone

- Consumers use `<Badge>` plain (grep: no `asChild` on Badge in app code).

## Behavior changes

None (Slot merge ≈ render merge).

## Verify by hand

- Status badges in status-dropdown still render icon + text.
- Badge with custom className still overrides.
