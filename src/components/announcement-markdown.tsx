'use client';

import { MarkdownPreview } from '@/components/markdown-preview';

// Compact markdown styling for announcement surfaces. Deliberately does NOT
// use `.prose` (globals.css): those rules are unlayered so they beat Tailwind
// utilities, and their document-scale spacing (leading-7, my-3) balloons a
// slim banner or dialog.
const MARKDOWN_CLASSES = [
  'text-sm leading-snug',
  '[&_p]:my-1',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5 [&_li]:leading-snug',
  '[&_a]:font-medium [&_a]:underline hover:[&_a]:opacity-80',
  '[&_strong]:font-semibold',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
].join(' ');

export function AnnouncementMarkdown({ children }: { children: string }) {
  return <MarkdownPreview content={children} className={MARKDOWN_CLASSES} />;
}
