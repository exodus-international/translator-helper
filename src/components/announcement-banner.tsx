'use client';

import { dismissAnnouncementAction } from '@/domain/announcement/announcement.actions';
import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface AnnouncementBannerData {
  id: string;
  title: string;
  body: string;
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
