'use client';

import { RawEditorPane } from '@/components/raw-editor-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAudioTranscriptAction,
  keepAudioTranscriptAction,
  regenerateAudioAction,
  resetAudioTranscriptAction,
  saveAudioTranscriptAction,
} from '@/domain/audio/audio.actions';
import { validateSsml } from '@/domain/audio/audio.ssml';
import type { AudioGenerationOutcome, AudioTranscriptView } from '@/domain/audio/audio.types';
import { capture } from '@/lib/analytics';
import { AlertTriangle, Loader2, Lock, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
/**
 * The server actions this panel calls, injectable so a component test can drive
 * it without a database or an Azure key. Same shape as the generation service's
 * deps and the authorization gateway's.
 */
export interface AudioTextPanelActions {
  load: (documentVersionId: string) => Promise<AudioTranscriptView | null>;
  save: (documentVersionId: string, ssml: string) => Promise<void>;
  reset: (documentVersionId: string) => Promise<void>;
  keep: (documentVersionId: string) => Promise<void>;
  regenerate: (documentVersionId: string) => Promise<AudioGenerationOutcome>;
}

const serverActions: AudioTextPanelActions = {
  load: getAudioTranscriptAction,
  save: saveAudioTranscriptAction,
  reset: resetAudioTranscriptAction,
  keep: keepAudioTranscriptAction,
  regenerate: regenerateAudioAction,
};

/** How the SSML is edited. The default is Monaco; a test swaps in a textarea, because Monaco needs a real browser to mount. */
export interface AudioTextEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

const monacoEditor = ({ value, onChange, readOnly }: AudioTextEditorProps) => (
  <RawEditorPane value={value} onChange={onChange} readOnly={readOnly} language="xml" fullHeight />
);

export function AudioTextPanel({
  documentVersionId,
  actions = serverActions,
  editor = monacoEditor,
}: {
  documentVersionId: string;
  actions?: AudioTextPanelActions;
  editor?: (props: AudioTextEditorProps) => ReactNode;
}) {
  const [transcript, setTranscript] = useState<AudioTranscriptView | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await actions.load(documentVersionId);
      setTranscript(loaded);
      setDraft(loaded?.ssml ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the audio text.');
    } finally {
      setLoading(false);
    }
  }, [documentVersionId, actions]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = transcript !== null && draft !== transcript.ssml;
  const edited = transcript?.state !== 'generated';
  // Advisory only. Save stays enabled: a rule this validator has not heard of
  // must not stop someone using something the provider actually supports.
  const problems = useMemo(() => (transcript?.canEdit ? validateSsml(draft) : []), [draft, transcript?.canEdit]);

  const save = async ({ regenerate }: { regenerate: boolean }) => {
    setSaving(true);
    try {
      await actions.save(documentVersionId, draft);
      capture('audio_transcript_saved', { regenerate });

      if (regenerate) {
        const outcome = await actions.regenerate(documentVersionId);
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

  const keep = async () => {
    setSaving(true);
    try {
      await actions.keep(documentVersionId);
      toast.success('Keeping your audio text.');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not keep the audio text.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await actions.reset(documentVersionId);
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
      {transcript.state === 'edited_outdated' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-xs text-amber-900">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              The translation changed since this audio text was edited, so the recording may not say what the document
              says. Your version is still what gets generated.
            </span>
          </p>
          {transcript.canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
                Rebuild from document
              </Button>
              <Button variant="ghost" size="sm" onClick={keep} disabled={saving}>
                Keep mine
              </Button>
            </div>
          )}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="max-h-28 overflow-y-auto border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {problems.map((problem, index) => (
            <li key={`${problem.line}-${index}`} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium">Line {problem.line}:</span> {problem.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="min-h-0 flex-1">
        {editor({
          value: draft,
          onChange: transcript.canEdit ? setDraft : undefined,
          readOnly: !transcript.canEdit || saving,
        })}
      </div>
    </div>
  );
}
