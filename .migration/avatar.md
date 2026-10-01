# avatar

2026-09-05, transformation engine. Verdict: 1:1 import swap; `delayMs` not used by consumers.

## Changed

- src/components/ui/avatar.tsx — `radix-ui` → `@base-ui/react/avatar` (single-quoted import the initial scan initially missed; caught by the final leftover sweep). Root/Image/Fallback part names identical. No `asChild`/`delayMs` usages in app code (grep verified).
- Leftover scan clean.

## Left alone

- AvatarBadge/AvatarGroup/AvatarGroupCount are plain divs, untouched.

## Behavior changes

- None. (If a consumer ever passes `delayMs` on Fallback, rename to `delay` — none do today.)

## Verify by hand

- User avatars across the app render images; fallback initials show with the deterministic color while loading / on error.
