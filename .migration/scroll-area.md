# scroll-area

2026-09-05, transformation engine. Verdict: part renames only (Scrollbar/Thumb); visibility model changed — FLAGGED.

## Changed

- src/components/ui/scroll-area.tsx — `@radix-ui/react-scroll-area` → `@base-ui/react/scroll-area`. `ScrollAreaScrollbar` → `Scrollbar`, `ScrollAreaThumb` → `Thumb`. Radix `type`/`scrollHideDelay` props dropped (Base visibility is CSS-driven): added `opacity-0 data-scrolling:opacity-100 data-hovering:opacity-100` to the scrollbar to approximate the old "hover" visibility (radix default `type="hover"`).
- Leftover scan clean.

## Left alone

- Consumers pass no `type`/`scrollHideDelay` (grep verified).

## Behavior changes

- **FLAGGED:** scrollbar visibility is now CSS-driven off `data-scrolling`/`data-hovering` instead of radix's mount/unmount `type` machine. The hover/scroll reveal approximates radix `type="hover"` (default); behavior during scroll and transition timing may differ subtly.
- Base adds `ScrollArea.Content` for horizontal overflow measurement; not needed here (vertical scrolling only).

## Verify by hand

- Long lists (admin users table wrappers, document lists, thread sidebar): scrollbar appears on hover and while scrolling, hides after.
- Wheel/trackpad scrolling inside the areas still scrolls.
