'use client';

import { Button } from '@/components/ui/button';
import { capture } from '@/lib/analytics';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** How long the tick stays after a copy before the button goes back to copying. */
const CONFIRM_MS = 1500;

interface CopyAllButtonProps {
  /** Everything in the pane, as written -- the Markdown, not the preview. */
  text: string;
  /** Which pane, as a translator names it: "source" or "translation". */
  pane: 'source' | 'translation';
}

/**
 * Copies a pane's whole text in one click.
 *
 * Selecting everything in an editor is a keyboard chord inside the editor, and
 * in the read-only source or the Preview tab there is no editor to press it
 * in: the rendered page selects as prose, with its markup gone. This takes the
 * text as it is stored, whichever tab is showing, which is what gets pasted
 * into a glossary, a message or another tool.
 *
 * The icon turns into a tick where the translator is already looking, and the
 * toast says the same for a screen reader.
 */
export function CopyAllButton({ text, pane }: CopyAllButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const name = pane === 'source' ? 'Source' : 'Translation';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(`Could not copy the ${pane}`);
      return;
    }
    capture('editor_content_copied', { pane });
    toast.success(`${name} copied`);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy all ${pane} text`}
      title={`Copy all ${pane} text`}
      disabled={text.length === 0}
      onClick={copy}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
