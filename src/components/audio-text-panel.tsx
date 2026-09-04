'use client';

import { RawEditorPane } from '@/components/raw-editor-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAudioTranscriptAction,
  regenerateAudioAction,
  resetAudioTranscriptAction,
  saveAudioTranscriptAction,
} from '@/domain/audio/audio.actions';
import type { AudioTranscriptView } from '@/domain/audio/audio.types';
import { capture } from '@/lib/analytics';
import { Loader2, Lock, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * The Audio text tab: the SSML that would be sent to the speech provider for
 * this version, and the place to change it.
 *
 * Until this existed the transcript was built at generation time and thrown
 * away, so the only way to fix a mispronounced name was to misspell it in the
 * document readers see. Editing here never touches the document.
 *
 * Everything goes through server actions, deliberately: the SSML is built by
 * the audio rules, which pull in a Markdown parser that has no business in a
 * browser bundle.
 */
export function AudioTextPanel({ documentVersionId }: { documentVersionId: string }) {
  const [transcript, setTranscript] = useState<AudioTranscriptView | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await getAudioTranscriptAction(documentVersionId);
      setTranscript(loaded);
      setDraft(loaded?.ssml ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the audio text.');
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = transcript !== null && draft !== transcript.ssml;
  const edited = transcript?.state !== 'generated';

  const save = async ({ regenerate }: { regenerate: boolean }) => {
    setSaving(true);
    try {
      await saveAudioTranscriptAction(documentVersionId, draft);
      capture('audio_transcript_saved', { regenerate });

      if (regenerate) {
        const outcome = await regenerateAudioAction(documentVersionId);
        if (outcome.status === 'failed') toast.error(outcome.error);
        else if (outcome.status === 'skipped') toast.warning('Saved, but this document gets no audio.');
        else toast.success('Saved. The audio is being generated from it.');
      } else {
        toast.success('Audio text saved. The next generation will use it.');
      }
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save the audio text.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await resetAudioTranscriptAction(documentVersionId);
      capture('audio_transcript_reset');
      toast.success('Back to the audio text built from the document.');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reset the audio text.');
    } finally {
      setSaving(false);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={edited ? 'bg-amber-50 text-amber-700 border-amber-200' : undefined}>
            {edited ? 'Edited' : 'Generated'}
          </Badge>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!transcript.canEdit && <Lock className="h-3.5 w-3.5 shrink-0" />}
            {transcript.canEdit
              ? 'Sent to the speech provider as it stands. Editing it never changes the document.'
              : (transcript.readOnlyReason ?? 'This audio text is read-only.')}
          </p>
        </div>
        {transcript.canEdit && (
          <div className="flex items-center gap-2">
            {edited && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to generated
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => save({ regenerate: false })} disabled={!dirty || saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" onClick={() => save({ regenerate: true })} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save &amp; regenerate
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <RawEditorPane
          value={draft}
          onChange={transcript.canEdit ? setDraft : undefined}
          readOnly={!transcript.canEdit || saving}
          language="xml"
          fullHeight
        />
      </div>
    </div>
  );
}
