'use client';

import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { FloatingSuggestionWindow } from './floating-suggestion-window';

interface SuggestionFormSurfaceProps {
  title: string;
  containerRef: RefObject<HTMLElement | null>;
  /** Asked when the sheet is dismissed (backdrop, Escape, close button). */
  onRequestClose: () => void;
  widthRatio?: number;
  maxWidth?: number;
  children: ReactNode;
}

/**
 * The part of the screen the on-screen keyboard leaves free. iOS Safari keeps
 * the layout viewport (what `bottom: 0` and `dvh` measure) at full height while
 * the keyboard is up, so a bottom sheet sits behind it; the visual viewport is
 * the only measure of what is still visible. Null where there is none, and the
 * sheet falls back to its `dvh` cap.
 */
function useKeyboardSafeArea(enabled: boolean): CSSProperties | undefined {
  const [area, setArea] = useState<{ height: number; bottom: number } | null>(null);

  useEffect(() => {
    const viewport = enabled ? window.visualViewport : null;
    if (!viewport) return;
    const update = () => {
      setArea({
        height: viewport.height,
        bottom: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
      });
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [enabled]);

  if (!enabled || !area) return undefined;
  const keyboardUp = area.bottom > 0;
  return {
    bottom: area.bottom,
    maxHeight: Math.round(area.height * 0.85),
    // The home-indicator inset is under the keyboard while it is up.
    ...(keyboardUp ? { paddingBottom: 0 } : {}),
  };
}

/**
 * Where a comment or suggested edit is written. On a desktop it is the
 * floating window that can be dragged off the passage; on a phone there is no
 * room to drag anything, so it is a bottom sheet, capped to the viewport left
 * above the on-screen keyboard (see `useKeyboardSafeArea`).
 */
export function SuggestionFormSurface({
  title,
  containerRef,
  onRequestClose,
  widthRatio,
  maxWidth,
  children,
}: SuggestionFormSurfaceProps) {
  const isMobile = useIsMobile();
  const keyboardSafeArea = useKeyboardSafeArea(isMobile);

  if (isMobile) {
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onRequestClose();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
          style={keyboardSafeArea}
        >
          <SheetHeader className="border-b">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto p-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FloatingSuggestionWindow title={title} containerRef={containerRef} widthRatio={widthRatio} maxWidth={maxWidth}>
      {children}
    </FloatingSuggestionWindow>
  );
}
