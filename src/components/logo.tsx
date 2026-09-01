import { cn } from '@/lib/utils';

/**
 * The app mark.
 *
 * It is served from src/app/icon.svg by the metadata file convention rather
 * than copied into public/, so the UI and the browser tab both come from the
 * one file docs/BRANDING.md calls the source of truth for every icon.
 *
 * Decorative on purpose: every use sits beside the app name in text, and a
 * screen reader announcing it a second time is worse than not at all. Pass an
 * `alt` where that stops being true.
 */
export function Logo({ size = 24, className, alt = '' }: { size?: number; className?: string; alt?: string }) {
  // next/image would send a local SVG through the optimizer, which refuses it
  // without dangerouslyAllowSVG, and there is nothing to optimize in a vector.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icon.svg" alt={alt} width={size} height={size} className={cn('shrink-0', className)} />;
}
