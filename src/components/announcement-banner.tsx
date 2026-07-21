'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { Button } from '@/components/ui/button';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    void dismissAnnouncementAction(announcement.id);
  };

  return (
    <div className="border-b border-blue-200 bg-blue-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-blue-900">{announcement.title}</p>
            <div className="prose prose-sm max-w-none text-sm text-blue-900/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{announcement.body}</ReactMarkdown>
            </div>
          </div>
          {announcement.ctaLabel && announcement.ctaUrl && (
            <Button asChild size="sm" className="shrink-0 self-center">
              <Link href={announcement.ctaUrl} target="_blank">
                {announcement.ctaLabel}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="rounded-md p-1 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
