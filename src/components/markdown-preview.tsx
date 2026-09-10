'use client';

import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';
import { parseMarkdown } from '@/lib/markdown';

/**
 * Renders Markdown as the deployed translation app does (marked v15), sanitized.
 * Shared by the translator document previews and the announcement surfaces so
 * there is one rendering path to keep in step with production.
 *
 * Sanitizing runs client-side only: marked emits raw HTML (unlike react-markdown,
 * which it replaced), and DOMPurify needs a DOM. Document bodies are authored by
 * translators and reviewers and viewed by admins, so this closes that stored-XSS
 * path. The HTML is produced after mount, so nothing unsanitized is ever sent in
 * the SSR response.
 */
export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    setHtml(DOMPurify.sanitize(parseMarkdown(content)));
  }, [content]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
