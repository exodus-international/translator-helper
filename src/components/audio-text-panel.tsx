'use client';

import { RawEditorPane } from '@/components/raw-editor-panel';
import { getAudioTranscriptAction } from '@/domain/audio/audio.actions';
import type { AudioTranscriptView } from '@/domain/audio/audio.types';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * The Audio text tab: the SSML that would be sent to the speech provider for
 * this version.
 *
 * Until this existed the transcript was built at generation time and thrown
 * away, so a mispronounced name could only be fixed by misspelling the document
 * readers see. Showing it is the first half of the fix.
 *
 * Everything comes from a server action, deliberately: the SSML is built by the
 * audio rules, which pull in a Markdown parser and have no business in a
 * browser bundle.
 */
export function AudioTextPanel({ documentVersionId }: { documentVersionId: string }) {
  const [transcript, setTranscript] = useState<AudioTranscriptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTranscript(await getAudioTranscriptAction(documentVersionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the audio text.');
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Building the audio text…
      </div>
    );
  }

  if (error) {
    return <p className="p-4 text-sm text-destructive">{error}</p>;
  }

  // The tab is only offered on eligible documents, so this is a document that
  // stopped being eligible while it was open.
  if (!transcript) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This document no longer gets audio, so there is no audio text to show.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <p className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        This is what is sent to the speech provider. It is built from the translation, so editing the text changes it.
      </p>
      <div className="min-h-0 flex-1">
        <RawEditorPane value={transcript.ssml} readOnly language="xml" fullHeight />
      </div>
    </div>
  );
}
