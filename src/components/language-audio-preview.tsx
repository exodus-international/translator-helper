'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

import { SaveControl, type SaveStatus } from '@/components/save-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { defaultPreviewText, PREVIEW_TEXT_MAX_LENGTH, previewText } from '@/domain/audio/audio.preview';
import {
  previewLanguageAudioAction,
  updateLanguagePreviewTextAction,
  type LanguagePreviewOutcome,
} from '@/domain/language/language.actions';
import { AUTOSAVE_MS, useAutosave, type AutosaveStatus } from '@/hooks/use-autosave';

export const PREVIEW_AUTOSAVE_MS = AUTOSAVE_MS;

export interface LanguageAudioPreviewActions {
  save: (languageId: string, text: string) => Promise<void>;
  preview: (languageId: string, input: Record<string, unknown>) => Promise<LanguagePreviewOutcome>;
}

const serverActions: LanguageAudioPreviewActions = {
  save: (languageId, text) => updateLanguagePreviewTextAction(languageId, { text }),
  preview: previewLanguageAudioAction,
};

const SAVE_CONTROL_STATUS: Record<AutosaveStatus, SaveStatus> = {
  saved: 'saved',
  pending: 'pending',
  invalid: 'blocked',
  saving: 'pending',
  failed: 'error',
};

/**
 * The sample an admin listens to while tuning a language. It saves itself a
 * moment after typing stops, apart from the settings' Save button, and reads
 * aloud with whatever the form holds, saved or not.
 */
export function LanguageAudioPreview({
  language,
  settings,
  actions = serverActions,
}: {
  language: { id: string; code: string; audioPreviewText: string | null };
  /** The audio fields as the form holds them right now. */
  settings: Record<string, unknown>;
  actions?: LanguageAudioPreviewActions;
}) {
  const [text, setText] = useState(() => previewText(language));
  const [previewing, setPreviewing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const autosave = useAutosave({
    value: text,
    validate: (value) =>
      value.length > PREVIEW_TEXT_MAX_LENGTH ? `The sample is longer than ${PREVIEW_TEXT_MAX_LENGTH} characters.` : null,
    save: async (value) => {
      try {
        await actions.save(language.id, value);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save the preview text');
        throw error;
      }
    },
  });

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const outcome = await actions.preview(language.id, { ...settings, text });
      if (outcome.ok) {
        setAudioUrl(`data:${outcome.contentType};base64,${outcome.audioBase64}`);
      } else {
        setAudioUrl(null);
        setPreviewError(outcome.error);
      }
    } catch (error) {
      setAudioUrl(null);
      setPreviewError(error instanceof Error ? error.message : 'The preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const builtIn = defaultPreviewText(language.code);
  const tooLong = text.length > PREVIEW_TEXT_MAX_LENGTH;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="language-preview-text">Preview text</Label>
        <span aria-live="polite" data-status={autosave.status}>
          <SaveControl
            status={SAVE_CONTROL_STATUS[autosave.status]}
            lastSavedAt={autosave.lastSavedAt}
            onSave={autosave.saveNow}
          />
        </span>
      </div>
      <Textarea
        id="language-preview-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-invalid={tooLong}
        rows={3}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={tooLong ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {text.length} / {PREVIEW_TEXT_MAX_LENGTH} characters. Saved for the whole team as you type.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={text === builtIn} onClick={() => setText(builtIn)}>
            Use the built-in sample
          </Button>
          <Button type="button" size="sm" disabled={previewing || tooLong || !text.trim()} onClick={handlePreview}>
            {previewing ? <Loader2 className="animate-spin" /> : <Play />}
            {previewing ? 'Generating…' : 'Preview'}
          </Button>
        </div>
      </div>
      {previewError && (
        <p role="alert" className="text-destructive text-xs">
          {previewError}
        </p>
      )}
      {audioUrl && (
        // Each preview is a new data URL, so keying on it restarts playback.
        <audio key={audioUrl} src={audioUrl} controls autoPlay className="w-full" aria-label="Preview audio" />
      )}
    </div>
  );
}
