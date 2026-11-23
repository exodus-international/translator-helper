'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface PaneTab<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

// 32px tall on one row. In a pane too narrow for every tab the list wraps
// rather than running past the pane's edge, where the pane would clip it.
const WRAP = 'h-auto min-h-8 max-w-full flex-wrap';

/**
 * The view switch in a pane header: Markdown or Preview, Edit or Preview,
 * Live or Review.
 *
 * Until React has hydrated it is drawn as plain disabled buttons that look
 * the same, because the tab component renders differently on the server and
 * a mismatch would throw the whole pane away on the client. `mounted` is the
 * host's own flag for that moment.
 */
export function PaneTabs<T extends string>({
  value,
  onValueChange,
  tabs,
  mounted,
}: {
  value: T;
  onValueChange: (value: T) => void;
  tabs: PaneTab<T>[];
  mounted: boolean;
}) {
  if (!mounted) {
    return (
      <div className={cn('inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground', WRAP)}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            disabled
            className={cn(
              'relative inline-flex h-[25px] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
              value === tab.value && 'bg-background shadow-sm',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <Tabs className="min-w-0 max-w-full" value={value} onValueChange={(next) => onValueChange(next as T)}>
      <TabsList className={WRAP}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="h-[25px]">
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
