'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { capture } from '@/lib/analytics';
import { Megaphone, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Banners are one-liners: only the title is shown. Longer content
// (markdown body) belongs in a MODAL announcement.
export interface AnnouncementBannerData {
  id: string;
  title: string;
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
    <div className="bg-zinc-900">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Megaphone className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{announcement.title}</p>
          {announcement.ctaLabel && announcement.ctaUrl && (
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
              className="shrink-0 text-sm font-semibold text-white hover:underline"
            >
              {announcement.ctaLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="shrink-0 rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
