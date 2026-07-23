'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { AnnouncementMarkdown } from '@/components/announcement-markdown';
import { Button } from '@/components/ui/button';
import { capture } from '@/lib/analytics';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface AnnouncementBannerData {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

interface AnnouncementBannerProps {
  announcement: AnnouncementBannerData;
}

export function AnnouncementBanner({ announcement }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    capture('announcement_shown', {
      announcement_id: announcement.id,
      announcement_title: announcement.title,
      display: 'banner',
    });
  }, [announcement.id, announcement.title]);

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    capture('announcement_dismissed', {
      announcement_id: announcement.id,
      announcement_title: announcement.title,
      display: 'banner',
    });
    void dismissAnnouncementAction(announcement.id);
  };

  return (
    <div className="border-b border-primary/20 bg-primary/5">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
            <div className="text-muted-foreground">
              <AnnouncementMarkdown>{announcement.body}</AnnouncementMarkdown>
            </div>
          </div>
          {announcement.ctaLabel && announcement.ctaUrl && (
            <Button asChild size="sm" className="shrink-0 self-center">
              <Link
                href={announcement.ctaUrl}
                target="_blank"
                onClick={() =>
                  capture('announcement_cta_clicked', {
                    announcement_id: announcement.id,
                    announcement_title: announcement.title,
                    display: 'banner',
                  })
                }
              >
                {announcement.ctaLabel}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
