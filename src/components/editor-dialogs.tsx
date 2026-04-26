'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEditorStore } from '@/lib/stores/editor-provider';
import type { LoadingKey } from '@/lib/stores/editor-store';

function useDialogLoading(key: LoadingKey) {
  return useEditorStore((s) => s.loading.has(key));
}

function SubmitReviewDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const submitForReview = useEditorStore((s) => s.submitForReview);
  const isSubmitting = useDialogLoading('submitForReview');
  const [selectedReviewerId, setSelectedReviewerId] = useState('');

  if (dialog.type !== 'submitReview') {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Review</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSubmit = async () => {
    await submitForReview(selectedReviewerId || undefined);
    setSelectedReviewerId('');
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          setSelectedReviewerId('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Review</DialogTitle>
        </DialogHeader>
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
                {dialog.reviewers.map((member) => (
                  <SelectItem key={member.user.id} value={member.user.id}>
                    {member.user.name} ({member.user.email})
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
      </DialogContent>
    </Dialog>
  );
}

function AssignTranslatorDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const assignTranslator = useEditorStore((s) => s.assignTranslator);
  const isAssigning = useDialogLoading('assignTranslator');
  const [userId, setUserId] = useState('');
  const [deadline, setDeadline] = useState('');

  if (dialog.type !== 'assignTranslator') {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Translator</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const handleAssign = async () => {
    await assignTranslator(userId, deadline || undefined);
    setUserId('');
    setDeadline('');
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          setUserId('');
          setDeadline('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Translator</DialogTitle>
        </DialogHeader>
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
                    {m.user.name || m.user.email}
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
      </DialogContent>
    </Dialog>
  );
}

function AssignReviewerDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const assignReviewer = useEditorStore((s) => s.assignReviewer);
  const isAssigning = useDialogLoading('assignReviewer');
  const [selectedId, setSelectedId] = useState('');

  if (dialog.type !== 'assignReviewer') {
    return (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Reviewer</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const handleAssign = async () => {
    await assignReviewer(selectedId);
    setSelectedId('');
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeDialog();
          setSelectedId('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Reviewer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Reviewer</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select reviewer..." />
              </SelectTrigger>
              <SelectContent>
                {dialog.candidates.map((m) => (
                  <SelectItem key={m.user.id} value={m.user.id}>
                    {m.user.name} ({m.user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAssign} disabled={!selectedId || isAssigning} className="w-full">
            {isAssigning ? 'Assigning...' : 'Assign Reviewer'}
          </Button>
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
    </>
  );
}
