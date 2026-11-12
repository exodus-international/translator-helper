'use client';

import type { ReactNode, RefObject } from 'react';
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
 * Where a comment or suggested edit is written. On a desktop it is the
 * floating window that can be dragged off the passage; on a phone there is no
 * room to drag anything, so it is a bottom sheet, capped to the viewport left
 * above the on-screen keyboard.
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
