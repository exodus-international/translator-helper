'use client';

import { Megaphone } from 'lucide-react';
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
        </div>
      </div>
    </div>
  );
}
