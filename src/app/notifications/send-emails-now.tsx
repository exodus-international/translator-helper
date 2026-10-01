'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  countWaitingEmailRecipientsAction,
  sendWaitingEmailsNowAction,
} from '@/domain/notification/notification.actions';
import { EMAILS_PER_RUN } from '@/domain/notification/notification.email';
import { capture } from '@/lib/analytics';
import { useState } from 'react';
import { toast } from 'sonner';

function waitingText(count: number | null | 'error') {
  if (count === 'error') return 'Could not check who has email waiting. Try again in a moment.';
  if (count === null) return 'Checking who has email waiting…';
  if (count === 0) return 'Nobody has email waiting right now.';
  const people = count === 1 ? '1 person has' : `${count} people have`;
  const overflow =
    count > EMAILS_PER_RUN
      ? ` ${EMAILS_PER_RUN} are sent at a time; the rest get theirs with the next daily email.`
      : '';
  return `${people} email waiting. They get it now instead of at noon CET, and nothing is sent twice.${overflow}`;
}

/** For admins: sends the waiting daily emails without waiting for noon. */
export function SendEmailsNow() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null | 'error'>(null);
  const [sending, setSending] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (sending) return;
    setOpen(next);
    if (!next) return;
    setCount(null);
    countWaitingEmailRecipientsAction()
      .then(setCount)
      .catch(() => setCount('error'));
  };

  const send = async () => {
    setSending(true);
    try {
      const result = await sendWaitingEmailsNowAction();
      if (!result.ok) {
        toast.error('Emails are already being sent', { description: 'Try again in a few minutes.' });
        return;
      }
      capture('notification_emails_sent_now', { sent: result.sent, failed: result.failed, waiting: result.waiting });
      if (result.failed > 0) {
        toast.warning('Some emails could not be sent', { description: 'They will be tried again on the next run.' });
      } else if (result.waiting > 0) {
        toast.success('Emails sent', { description: 'The rest go out with the next daily email.' });
      } else {
        toast.success('Emails sent');
      }
      setOpen(false);
    } catch {
      toast.error('Could not send emails');
    } finally {
      setSending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={<Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground" />}
      >
        Send waiting emails now
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send waiting emails now?</AlertDialogTitle>
          <AlertDialogDescription>{waitingText(count)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <Button disabled={typeof count !== 'number' || count === 0 || sending} onClick={send}>
            {sending ? 'Sending…' : 'Send now'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
