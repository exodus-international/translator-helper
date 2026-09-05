# select

2026-09-05, transformation engine (restructured anatomy). Verdict: migrated to Positioner/Popup/List model; `position` → `alignItemWithTrigger` (popper default preserved); `Select.Value` label rendering fixed at every consumer via `items`.

## Changed

- src/components/ui/select.tsx — `@radix-ui/react-select` → `@base-ui/react/select`.
  - `Select` is now a **bare re-export** of `SelectPrimitive.Root` (Root is generic; sidesteps ComponentProps). Consumers pass `items` directly.
  - Content → Portal > Positioner > Popup. The wrapper's radix default `position="popper"` is preserved by exposing `alignItemWithTrigger = false` by default (Base's default `true` = item-aligned would have changed the look). No consumer used `position="…"` (grep) — no call-site rename needed.
  - Viewport → List (`h-(--anchor-height) min-w-(--anchor-width)` popper sizing preserved via Base vars); ScrollUp/DownButton → ScrollUp/DownArrow (with `top-0 w-full` / `bottom-0 w-full`); Label → GroupLabel; ItemIndicator gets `render={<CheckIcon/>}`; ItemText first with `shrink-0 whitespace-nowrap` per wrapper-shapes anatomy.
  - Vars: available-height / transform-origin / trigger-width→anchor-width.
  - Animation restated + popper `translate-y-1` per-side offsets kept.
  - Item `data-[disabled]` → `data-disabled`.
- Consumer sweep (label parity + null widening):
  - `onValueChange` widened to `Value | null` at 16+ sites; wrapped as `(v) => setX(v ?? '')` (or `?? 'all'`/`?? 'NONE'`/`as ProjectRole` fallbacks): admin/languages, admin/users (t-shirt), dashboard (deploy filter), edit/new sourceProject, onboarding + profile t-shirt, projects/[project] language, translations ×2 + tpid ×3, document-type-select, editor-dialogs ×3, project-kanban-board ×3, project-team-tab ×2 (incl. RoleSelect `items={ROLE_LABELS}`).
  - `Select.Value` renders the raw value string in Base (radix rendered the selected ItemText). **Fixed at every site by passing `items` (Record<value, label>)** — labels match the previous ItemText content, including ReactNode labels (MemberOption) in editor-dialogs/kanban.
  - `''`-sentinel sites changed to `value={x || null}` so the placeholder still shows (Base treats `''` as a real value, `null` = placeholder).
  - `value={selectedUserId || undefined}` → `|| null` (undefined = uncontrolled in Base).
- Leftover scan clean.

## Left alone

- combobox.tsx (Base-authored already).

## Behavior changes

- FLAGGED (visual): the closed trigger now renders the `items` label instead of the (rich) ItemText content; sites whose ItemText was richer than plain text now show the `items` string (e.g. kanban user rows show name text instead of avatar+name in the closed trigger). Acceptable parity trade-off; adjust `items` values to richer nodes if wanted (Record<string, ReactNode>).
- FLAGGED (visual): select ItemText renders `<div>` (was `<span>`) — the `*:[span]:last:` cosmetic hooks on SelectItem no longer match; item text layout re-verified by hand.
- Select popup `alignItemWithTrigger` auto-disables on insufficient space/touch (Base behavior).
- Modal scroll lock now a Base prop (`modal`, default true) — matches radix select behavior.

## Verify by hand

- Every select listed above: trigger shows the chosen label (not an id), placeholder shows when empty, required validation still blocks submit, keyboard nav + typeahead in the list.
- Assign-document / assignee "Unassigned (visible to all)" sentinel still maps to null.
