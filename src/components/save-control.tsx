'use client';

import { CloudCheck, CloudOff, Loader2, Save, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

const SAVE_STATUS_META: Record<'unsaved' | 'saving' | 'error', { icon: LucideIcon; label: string; spin?: boolean }> = {
  saving: { icon: Loader2, label: 'Saving...', spin: true },
  unsaved: { icon: Save, label: 'Save' },
  error: { icon: CloudOff, label: 'Save failed' },
};

/**
 * The save button and the saved state, in one slot.
 *
 * They used to be two controls — a "Saved" badge that never said when, next to
 * a button that was often a no-op. Autosave flips this pair several times a
 * minute while someone types, so the slot holds its width and the change is
 * instant colour and text, no motion: a toolbar that twitches on every autosave
 * is worse than one that says less.
 */
export function SaveControl({
  status,
  lastSavedAt,
  onSave,
  disabled,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
  onSave: () => void;
  disabled?: boolean;
}) {
  // The two states swap on every autosave, so they must measure the same: the
  // button and the chip below carry the same label length and padding for that
  // reason, not by accident.
  const slot = 'h-8 min-w-20 px-3';

  if (status === 'saved') {
    const time = lastSavedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return (
      <span
        className={cn(slot, 'inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground')}
        title={time ? `All changes saved at ${time}` : 'All changes saved'}
      >
        <CloudCheck className="size-3.5 text-success" />
        <span className="tabular-nums">Saved</span>
      </span>
    );
  }

  const meta = SAVE_STATUS_META[status];
  const Icon = meta.icon;
  const isError = status === 'error';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSave}
      disabled={disabled || status === 'saving'}
      className={cn(slot, 'gap-1.5', isError && 'border-destructive/40 text-destructive')}
      title={isError ? 'The last save failed — save again' : 'Save now'}
    >
      <Icon className={cn(meta.spin && 'animate-spin')} />
      {meta.label}
    </Button>
  );
}
