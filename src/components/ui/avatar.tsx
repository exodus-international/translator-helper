'use client';

import { cn } from '@/lib/utils';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import * as React from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Deterministic colour for a person, so the same name always gets the same
 * chip. Saturation and lightness stay in a narrow band that keeps white text
 * readable on top.
 */
function getColorFromString(str: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash) % 15); // 65-80%
  const lightness = 45 + (Math.abs(hash) % 10); // 45-55%

  return { bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`, text: '#ffffff' };
}

function Avatar({
  className,
  size = 'md',
  name,
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: AvatarSize;
  /** Name the fallback colour is derived from. */
  name?: string;
}) {
  const color = name ? getColorFromString(name) : null;

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        'group/avatar relative flex shrink-0 overflow-hidden rounded-full select-none',
        'size-8 data-[size=xs]:size-5 data-[size=sm]:size-6 data-[size=lg]:size-10 data-[size=xl]:size-16 data-[size=2xl]:size-24',
        !color && 'bg-muted',
        className,
      )}
      style={color ? { backgroundColor: color.bg, ...style } : style}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  name,
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & {
  /** Name the text colour is derived from; pair it with the same name on `Avatar`. */
  name?: string;
}) {
  const color = name ? getColorFromString(name) : null;

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full font-medium',
        'text-xs group-data-[size=xs]/avatar:text-[10px] group-data-[size=lg]/avatar:text-sm group-data-[size=xl]/avatar:text-xl group-data-[size=2xl]/avatar:text-3xl',
        !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={color ? { color: color.text, ...style } : style}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=md]/avatar:size-2.5 group-data-[size=md]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background',
        'group-has-data-[size=xs]/avatar-group:size-5 group-has-data-[size=sm]/avatar-group:size-6 group-has-data-[size=lg]/avatar-group:size-10',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
export type { AvatarSize };
