'use client';

import { cn } from '@/lib/utils';
import { MarkdownPreview } from '@/components/markdown-preview';

/**
 * The formatted pane: the same marked output the deployed app renders, wrapped
 * in that app's reader chrome — a centred serif column at a fixed measure on a
 * white page. Two elements rather than one because the scroll lives on the
 * viewport while the measure constrains the column inside it.
 *
 * Announcements and release notes keep plain `MarkdownPreview`; they are tool
 * chrome, not content anyone will read in the reading app.
 */
export function ReaderPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('reader-viewport h-full overflow-y-auto', className)}>
      <MarkdownPreview content={content} className="reader prose" />
    </div>
  );
}
