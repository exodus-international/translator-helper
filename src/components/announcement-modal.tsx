'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface AnnouncementModalData {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

interface AnnouncementModalProps {
  announcement: AnnouncementModalData;
}

export function AnnouncementModal({ announcement }: AnnouncementModalProps) {
  const [open, setOpen] = useState(true);

  // Every close path (X button, ESC, outside click) goes through
  // onOpenChange, so any close permanently dismisses.
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      void dismissAnnouncementAction(announcement.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{announcement.title}</DialogTitle>
        </DialogHeader>
        <div className="prose prose-sm max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{announcement.body}</ReactMarkdown>
        </div>
        {announcement.ctaLabel && announcement.ctaUrl && (
          <DialogFooter>
            <Button asChild>
              <Link href={announcement.ctaUrl} target="_blank">
                {announcement.ctaLabel}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
