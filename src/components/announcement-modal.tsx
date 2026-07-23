'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { AnnouncementMarkdown } from '@/components/announcement-markdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { capture } from '@/lib/analytics';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    capture('announcement_shown', {
      announcement_id: announcement.id,
      announcement_title: announcement.title,
      display: 'modal',
    });
  }, [announcement.id, announcement.title]);

  // Every close path (X button, ESC, outside click) goes through
  // onOpenChange, so any close permanently dismisses.
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      capture('announcement_dismissed', {
        announcement_id: announcement.id,
        announcement_title: announcement.title,
        display: 'modal',
      });
      void dismissAnnouncementAction(announcement.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{announcement.title}</DialogTitle>
        </DialogHeader>
        <AnnouncementMarkdown>{announcement.body}</AnnouncementMarkdown>
        {announcement.ctaLabel && announcement.ctaUrl && (
          <DialogFooter>
            <Button asChild>
              <Link
                href={announcement.ctaUrl}
                target="_blank"
                onClick={() =>
                  capture('announcement_cta_clicked', {
                    announcement_id: announcement.id,
                    announcement_title: announcement.title,
                    display: 'modal',
                  })
                }
              >
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
