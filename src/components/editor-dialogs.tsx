'use client';

import { UserSelect, type SelectableUser } from '@/components/user-select';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/lib/stores/editor-provider';
import type { LoadingKey, MemberInfo } from '@/lib/stores/editor-store';

function useDialogLoading(key: LoadingKey) {
  return useEditorStore((s) => s.loading.has(key));
}

/** `yyyy-mm-dd` in the viewer's own timezone, which `<input type="date">` speaks. */
function toDateInputValue(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Each dialog is two pieces: a switch that decides whether the form is on
 * screen at all, and a form that mounts with the version's current assignment
 * already in its state. The form is therefore also what prefills itself --
 * opening the dialog mounts it, so what is already true is what it opens on,
 * with no effect writing state after the fact.
 */

function SubmitReviewDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  if (dialog.type !== 'submitReview') return null;
  return <SubmitReviewForm reviewers={dialog.reviewers} />;
}

function SubmitReviewForm({ reviewers }: { reviewers: MemberInfo[] }) {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const submitForReview = useEditorStore((s) => s.submitForReview);
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const isSubmitting = useDialogLoading('submitForReview');
  const [reviewerId, setReviewerId] = useState(targetVersion?.reviewer?.id ?? '');

  const handleSubmit = async () => {
    await submitForReview(reviewerId || undefined);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Review</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <Label>
              Select a reviewer <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <UserSelect
              value={reviewerId}
              onValueChange={setReviewerId}
              users={reviewers.map((member) => member.user)}
              current={targetVersion?.reviewer ?? null}
              placeholder="Choose reviewer"
            />
            <p className="mt-1 text-xs text-muted-foreground">A reviewer can be assigned later if not known yet.</p>
          </div>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignTranslatorDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  if (dialog.type !== 'assignTranslator') return null;
  return <AssignTranslatorForm members={dialog.members} />;
}

function AssignTranslatorForm({ members }: { members: MemberInfo[] }) {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const assignTranslator = useEditorStore((s) => s.assignTranslator);
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const isAssigning = useDialogLoading('assignTranslator');
  const [userId, setUserId] = useState(targetVersion?.user?.id ?? '');
  const [deadline, setDeadline] = useState(toDateInputValue(targetVersion?.deadline));

  const handleAssign = async () => {
    await assignTranslator(userId, deadline || undefined);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Translator</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <Label>Translator</Label>
            <UserSelect
              value={userId}
              onValueChange={setUserId}
              users={members.map((member) => member.user)}
              current={targetVersion?.user ?? null}
              placeholder="Select translator..."
            />
          </div>
          <div>
            <Label>Deadline (optional)</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleAssign} disabled={!userId || isAssigning} className="w-full">
            {isAssigning ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignReviewerDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  if (dialog.type !== 'assignReviewer') return null;
  return <AssignReviewerForm candidates={dialog.candidates} />;
}

function AssignReviewerForm({ candidates }: { candidates: MemberInfo[] }) {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const assignReviewer = useEditorStore((s) => s.assignReviewer);
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const isAssigning = useDialogLoading('assignReviewer');
  const [userId, setUserId] = useState(targetVersion?.reviewer?.id ?? '');

  const handleAssign = async () => {
    await assignReviewer(userId);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Reviewer</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <Label>Reviewer</Label>
            <UserSelect
              value={userId}
              onValueChange={setUserId}
              users={candidates.map((member) => member.user)}
              current={targetVersion?.reviewer ?? null}
              placeholder="Select reviewer..."
            />
          </div>
          <Button onClick={handleAssign} disabled={!userId || isAssigning} className="w-full">
            {isAssigning ? 'Assigning...' : 'Assign Reviewer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeadlineDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  if (dialog.type !== 'deadline') return null;
  return <DeadlineForm />;
}

function DeadlineForm() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const setDeadline = useEditorStore((s) => s.setDeadline);
  const targetVersion = useEditorStore((s) => s.targetVersion);
  const isSaving = useDialogLoading('setDeadline');
  const [value, setValue] = useState(toDateInputValue(targetVersion?.deadline));

  const close = () => closeDialog();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deadline</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <div>
            <Label htmlFor="version-deadline">When this version is due</Label>
            <Input
              id="version-deadline"
              type="date"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave it empty to clear the deadline.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setDeadline(value ? new Date(value) : null)} disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : 'Save deadline'}
            </Button>
            <Button variant="outline" onClick={close} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditorDialogs() {
  return (
    <>
      <SubmitReviewDialog />
      <AssignTranslatorDialog />
      <AssignReviewerDialog />
      <DeadlineDialog />
    </>
  );
}

export type { SelectableUser };
