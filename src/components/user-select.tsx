'use client';

import { useMemo } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

export interface SelectableUser {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
}

/**
 * One person, in the select's own shape: face and name on the trigger, the
 * same two on the row's first line, and the address underneath it, where it
 * disambiguates two people with one name instead of pushing the row wide.
 *
 * The trigger carries the compact form because it has one line to say who is
 * selected, while the list has room to say which one they are.
 */
function UserOption({ user, compact }: { user: SelectableUser; compact?: boolean }) {
  const label = user.name || user.email;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" className="pointer-events-none" />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-full truncate">{label}</span>
        {!compact && user.name && (
          <span className="max-w-full truncate text-xs text-muted-foreground">{user.email}</span>
        )}
      </span>
    </span>
  );
}

interface UserSelectProps {
  /** Empty string or null when nobody is picked; the trigger then shows the placeholder. */
  value: string | null;
  onValueChange: (userId: string) => void;
  users: SelectableUser[];
  placeholder: string;
  /**
   * Whoever holds the assignment now. The roster of candidates is not the same
   * list as the people who can already be assigned -- a version can carry a
   * translator who is not in this project's language team -- and without them
   * the trigger would have no label for the current value and fall back to
   * printing the raw id.
   */
  current?: SelectableUser | null;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The app's one people picker. Every place that asks someone to choose a
 * translator or a reviewer goes through this, so no two of them can show a
 * different amount of the same person. The popup follows the select's own
 * stacking (see `isolate z-50` in select.tsx), so it also works inside a
 * dialog, which is where it is mostly used.
 */
export function UserSelect({
  value,
  onValueChange,
  users,
  placeholder,
  current,
  id,
  disabled,
  className,
}: UserSelectProps) {
  const options = useMemo(() => {
    if (!current || users.some((user) => user.id === current.id)) return users;
    return [current, ...users];
  }, [users, current]);

  // Base UI renders this map as the selected label, so it is the compact form
  // -- the list below renders its own rows.
  const labels = Object.fromEntries(options.map((user) => [user.id, <UserOption key={user.id} user={user} compact />]));

  return (
    <Select
      value={value || null}
      onValueChange={(next) => onValueChange(next ?? '')}
      items={labels}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn('mt-1 w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <UserOption user={user} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
