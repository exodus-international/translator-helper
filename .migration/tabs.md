# tabs

2026-09-05, transformation engine. Verdict: migrated to `@base-ui/react/tabs` (Trigger→Tab, Content→Panel); manual activation default FLAGGED.

## Changed

- src/components/ui/tabs.tsx — `@radix-ui/react-tabs` → `@base-ui/react/tabs`. Types: `TabsPrimitive.{Root,List,Tab,Panel}.Props`. Public exports (Tabs/TabsList/TabsTrigger/TabsContent) unchanged. `data-[state=active]:*` → `data-active:*` (both variants + dark). `aria-disabled:*` variants added alongside `disabled:*` (Base tabs surface disabled as aria-disabled). No `activationMode` was used in app code (grep), so the Base manual-by-default activation could not bite this project — still flagged below.
- Leftover scan clean.

## Left alone

Nothing.

## Behavior changes

- **FLAGGED (behavior delta, not patched):** Radix tabs default to automatic activation (arrow keys switch tab + content immediately). Base UI defaults to manual (focus moves, activation on Enter/Space). Per wrapper-shapes.md the base registry accepts this default; no `activateOnFocus` was added. If automatic activation is wanted, add `activateOnFocus` on `TabsList`.
- Tabs.Root defaultValue: Base defaults active tab to `0`; all consumers pass explicit values.

## Verify by hand

- Keyboard: Tab into the tablist, arrow through tabs, press Enter/Space to activate (manual). Confirm acceptable.
- Projects detail page tabs (3-4 columns) and editor tabs render active styles via data-active.
