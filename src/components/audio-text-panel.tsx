'use client';

import { RawEditorPane } from '@/components/raw-editor-panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAudioTranscriptAction,
  keepAudioTranscriptAction,
  regenerateAudioAction,
  resetAudioTranscriptAction,
  saveAudioTranscriptAction,
} from '@/domain/audio/audio.actions';
import { formatSsml, validateSsml } from '@/domain/audio/audio.ssml';
import type {
  AudioGenerationOutcome,
  AudioTranscriptState,
  AudioTranscriptView,
  AudioTranscriptWriteOutcome,
} from '@/domain/audio/audio.types';
import { capture } from '@/lib/analytics';
import { AlertTriangle, IndentIncrease, Loader2, Lock, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** `expectedOverride` is the stored SSML this tab was last shown, null when it was derived. */
  save: (documentVersionId: string, ssml: string, expectedOverride: string | null) => Promise<AudioTranscriptWriteOutcome>;
  reset: (documentVersionId: string, expectedOverride: string | null) => Promise<AudioTranscriptWriteOutcome>;
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
  onStateChange,
  onDirtyChange,
}: {
  documentVersionId: string;
  actions?: AudioTextPanelActions;
  editor?: (props: AudioTextEditorProps) => ReactNode;
  /** Told after every load and every change, so the audio card's badge can follow along. */
  onStateChange?: (state: AudioTranscriptState) => void;
  /** Told whether there are unsaved edits, so whoever unmounts this can ask first. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [transcript, setTranscript] = useState<AudioTranscriptView | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'rebuild' | 'loadTheirs' | null>(null);
  /**
   * The override this tab believes is stored, sent with every write so one that
   * would overwrite someone else's is refused instead. Set only by `load`: a
   * conflict deliberately does not advance it, so the next write is refused
   * again unless the person answers the bar below.
   */
  const [storedOverride, setStoredOverride] = useState<string | null>(null);
  /** What somebody else stored while this tab was editing. */
  const [conflict, setConflict] = useState<AudioTranscriptView | null>(null);

  // Through refs, so nothing a caller passes inline lands in a dependency
  // array: `load` runs on every change of its dependencies, and a fresh object
  // literal each render would mean a fetch each render.
  const latest = useRef({ actions, onStateChange, onDirtyChange });
  useEffect(() => {
    latest.current = { actions, onStateChange, onDirtyChange };
  });

  /**
   * `keepDraft` is for the one case where what is on the server changed but
   * what someone typed did not: answering the conflict prompt with "keep mine"
   * leaves the override alone, so overwriting the box would be the opposite of
   * what the button says.
   */
  const load = useCallback(async ({ keepDraft = false }: { keepDraft?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await latest.current.actions.load(documentVersionId);
      setTranscript(loaded);
      setStoredOverride(loaded?.source === 'override' ? loaded.ssml : null);
      setConflict(null);
      if (!keepDraft) setDraft(loaded?.ssml ?? '');
      if (loaded) latest.current.onStateChange?.(loaded.state);
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

  useEffect(() => {
    latest.current.onDirtyChange?.(dirty);
  }, [dirty]);

  // Unmounting is not the same as saving: whoever asked for the draft guard
  // must not be left believing there are still unsaved edits.
  useEffect(() => () => latest.current.onDirtyChange?.(false), []);

  const edited = transcript?.state !== 'generated';
  // Advisory only. Save stays enabled: a rule this validator has not heard of
  // must not stop someone using something the provider actually supports.
  const problems = useMemo(() => (transcript?.canEdit ? validateSsml(draft) : []), [draft, transcript?.canEdit]);
  // Generated SSML arrives indented; this is for what a person pastes in.
  const formatted = useMemo(() => formatSsml(draft), [draft]);

  /**
   * A refused write, reported rather than thrown: someone else changed the
   * transcript, and what they wrote came back with the refusal. Nothing is
   * lost here, the draft stays in the box and the bar asks which one wins.
   */
  const handleConflict = async (current: AudioTranscriptView | null, action: 'save' | 'reset') => {
    capture('audio_transcript_conflicted', { action });
    // No transcript to compare against: the document stopped getting audio
    // while this tab was open, which the reload explains for us.
    if (!current) {
      await load();
      return;
    }
    setConflict(current);
  };

  const save = async ({ regenerate, expected = storedOverride }: { regenerate: boolean; expected?: string | null }) => {
    setSaving(true);
    try {
      const outcome = await actions.save(documentVersionId, draft, expected);
      if (outcome.status === 'conflict') {
        await handleConflict(outcome.current, 'save');
        return;
      }
      capture('audio_transcript_edited', { regenerate });

      if (regenerate) {
        const generation = await actions.regenerate(documentVersionId);
        if (generation.status === 'failed') toast.error(generation.error);
        else if (generation.status === 'skipped') toast.warning('Saved, but this document gets no audio.');
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
      capture('audio_transcript_kept');
      toast.success('Keeping your audio text.');
      await load({ keepDraft: true });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not keep the audio text.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Take what the other person stored. Local: the conflict came back carrying
   * their transcript, so there is nothing to ask the server for.
   */
  const applyTheirs = () => {
    if (!conflict) return;
    setConfirming(null);
    setTranscript(conflict);
    setDraft(conflict.ssml);
    setStoredOverride(conflict.source === 'override' ? conflict.ssml : null);
    setConflict(null);
  };

  /** Overwrite theirs on purpose: the same save, told what is actually stored now. */
  const saveOverTheirs = () => {
    const theirs = conflict?.source === 'override' ? conflict.ssml : null;
    setConflict(null);
    return save({ regenerate: false, expected: theirs });
  };

  const reset = async () => {
    setConfirming(null);
    setSaving(true);
    try {
      const outcome = await actions.reset(documentVersionId, storedOverride);
      if (outcome.status === 'conflict') {
        await handleConflict(outcome.current, 'reset');
        return;
      }
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(formatted)}
              disabled={saving || formatted === draft}
              title="Indent the tags so the structure is readable. Nothing about what is spoken changes."
            >
              <IndentIncrease className="mr-1.5 h-3.5 w-3.5" />
              Format
            </Button>
            {edited && (
              <Button variant="ghost" size="sm" onClick={() => setConfirming('rebuild')} disabled={saving}>
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
      {conflict && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-1.5 text-xs text-amber-900">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Somebody else saved a different audio text while you were editing this one. Nothing you typed was sent,
              and nothing of theirs was overwritten.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (dirty ? setConfirming('loadTheirs') : applyTheirs())}
              disabled={saving}
            >
              Show theirs
            </Button>
            <Button variant="ghost" size="sm" onClick={saveOverTheirs} disabled={saving}>
              Save mine anyway
            </Button>
          </div>
        </div>
      )}
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
              <Button variant="outline" size="sm" onClick={() => setConfirming('rebuild')} disabled={saving}>
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

      {/* Both questions here are the same one: something in the box is about to
          go, and there is no undo. Rebuilding throws away every hand-tuned
          pronunciation; taking the other person's version throws away what you
          typed. "Rebuild from document" also sits next to "Keep mine", which is
          an easy place to misclick. */}
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'loadTheirs'
                ? 'Replace what you have typed with theirs?'
                : 'Build the audio text from the document again?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'loadTheirs'
                ? 'Your unsaved audio text is thrown away and the box shows the version somebody else saved.'
                : 'The edited audio text is thrown away, including any pronunciations tuned in it, and this cannot be undone. The document itself is untouched either way.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {confirming === 'loadTheirs' ? 'Keep what I typed' : 'Keep the edited version'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirming === 'loadTheirs' ? applyTheirs : reset}>
              {confirming === 'loadTheirs' ? 'Use theirs' : 'Rebuild the audio text'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
