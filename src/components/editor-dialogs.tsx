'use client';

import { UserAvatar } from '@/components/user-avatar';
import { ReactNode, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEditorStore } from '@/lib/stores/editor-provider';
import type { DialogState, LoadingKey, MemberInfo } from '@/lib/stores/editor-store';

function useDialogLoading(key: LoadingKey) {
  return useEditorStore((s) => s.loading.has(key));
}

function formatDateForInput(date: Date | string | null) {
  return date ? new Date(date).toISOString().slice(0, 10) : '';
}

/** A person in an assignment dropdown: face, name, and the address that disambiguates two of them. */
function MemberOption({
  user,
  withEmail,
}: {
  user: { id: string; name: string | null; email: string; image?: string | null };
  withEmail?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" className="pointer-events-none" />
      <span>{user.name || user.email}</span>
      {withEmail && user.name && <span className="text-muted-foreground">({user.email})</span>}
    </span>
  );
}

/**
 * Shared modal shell for the editor's assignment dialogs. `children` is only
 * rendered while `open` is true, so each dialog's form mounts fresh every
 * time it opens — form state can be seeded straight from a `useState`
 * initializer instead of synced in afterwards with an effect.
 */
function EditorDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && children}
      </DialogContent>
    </Dialog>
  );
}

function SubmitReviewForm({ reviewers }: { reviewers: MemberInfo[] }) {
  const submitForReview = useEditorStore((s) => s.submitForReview);
  const isSubmitting = useDialogLoading('submitForReview');
  const [selectedReviewerId, setSelectedReviewerId] = useState('');

  const handleSubmit = () => submitForReview(selectedReviewerId || undefined);

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>
          Select a reviewer <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Choose reviewer" />
          </SelectTrigger>
          <SelectContent>
            {reviewers.map((member) => (
              <SelectItem key={member.user.id} value={member.user.id}>
                <MemberOption user={member.user} withEmail />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">A reviewer can be assigned later if not known yet.</p>
      </div>
      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Submitting...' : 'Submit for Review'}
      </Button>
    </div>
  );
}

function AssignTranslatorForm({ dialog }: { dialog: Extract<DialogState, { type: 'assignTranslator' }> }) {
  const assignTranslator = useEditorStore((s) => s.assignTranslator);
  const isAssigning = useDialogLoading('assignTranslator');
  const [userId, setUserId] = useState('');
  const [deadline, setDeadline] = useState(() => formatDateForInput(dialog.deadline));

  const handleAssign = () => assignTranslator(userId, deadline || undefined);

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>Translator</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select translator..." />
          </SelectTrigger>
          <SelectContent>
            {dialog.members.map((m) => (
              <SelectItem key={m.user.id} value={m.user.id}>
                <MemberOption user={m.user} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Deadline (optional)</Label>
        <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
      </div>
      <Button onClick={handleAssign} disabled={!userId || isAssigning} className="w-full">
        {isAssigning ? 'Assigning...' : 'Assign'}
      </Button>
    </div>
  );
}

function AssignReviewerForm({ candidates }: { candidates: MemberInfo[] }) {
  const assignReviewer = useEditorStore((s) => s.assignReviewer);
  const isAssigning = useDialogLoading('assignReviewer');
  const [selectedId, setSelectedId] = useState('');

  const handleAssign = () => assignReviewer(selectedId);

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label>Reviewer</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select reviewer..." />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((m) => (
              <SelectItem key={m.user.id} value={m.user.id}>
                <MemberOption user={m.user} withEmail />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleAssign} disabled={!selectedId || isAssigning} className="w-full">
        {isAssigning ? 'Assigning...' : 'Assign Reviewer'}
      </Button>
    </div>
  );
}

export function EditorDialogs() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);

  return (
    <>
      <EditorDialog open={dialog.type === 'submitReview'} title="Submit for Review" onClose={closeDialog}>
        {dialog.type === 'submitReview' && <SubmitReviewForm reviewers={dialog.reviewers} />}
      </EditorDialog>
      <EditorDialog open={dialog.type === 'assignTranslator'} title="Assign Translator" onClose={closeDialog}>
        {dialog.type === 'assignTranslator' && <AssignTranslatorForm dialog={dialog} />}
      </EditorDialog>
      <EditorDialog open={dialog.type === 'assignReviewer'} title="Assign Reviewer" onClose={closeDialog}>
        {dialog.type === 'assignReviewer' && <AssignReviewerForm candidates={dialog.candidates} />}
      </EditorDialog>
    </>
  );
}
