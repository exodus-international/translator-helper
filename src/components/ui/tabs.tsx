'use client';

import * as React from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils';

type TabsVariant = 'default' | 'line';

const TabsVariantContext = React.createContext<TabsVariant>('default');

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />;
}

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          'inline-flex h-9 w-fit items-center text-muted-foreground',
          variant === 'line'
            ? 'justify-start gap-4 border-b border-border'
            : 'justify-center rounded-lg bg-muted p-[3px]',
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  const variant = React.useContext(TabsVariantContext);

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:outline-ring focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === 'line'
          ? 'relative -mb-px h-full rounded-none border-b-2 border-transparent px-1 pb-2 text-muted-foreground data-active:border-foreground data-active:text-foreground'
          : "h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-2 py-1 text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] data-active:bg-background data-active:shadow-sm dark:text-muted-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
