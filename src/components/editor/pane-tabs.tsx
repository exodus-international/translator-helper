'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface PaneTab<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

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
      <div className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            disabled
            className={cn(
              'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
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
    <Tabs value={value} onValueChange={(next) => onValueChange(next as T)}>
      <TabsList className="h-8">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
