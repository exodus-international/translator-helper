'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ban, Lock, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { LanguageAudioPreview } from '@/components/language-audio-preview';
import { LanguageHealthPills } from '@/components/language-health-pills';
import { SaveControl, type SaveStatus } from '@/components/save-control';
import { LanguageTabs } from '@/components/language-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AudioProvider, AudioQuality } from '@/generated/prisma/enums';
import { DEFAULT_AUDIO_QUALITY, DEFAULT_NARRATION } from '@/domain/audio/audio.narration';
import type { LanguageDeletionPlan } from '@/domain/language/language-delete';
import { languageHealth } from '@/domain/language/language-health';
import { deleteLanguageAction, updateLanguageSettingsAction } from '@/domain/language/language.actions';
import { DEFAULT_AUDIO_VOICES, updateLanguageSettingsSchema } from '@/domain/language/language.types';
import { useAutosave, type AutosaveStatus } from '@/hooks/use-autosave';
import { formatIssues } from '@/lib/validation';
import { capture } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { useTrailStore } from '@/lib/page-trail';

const QUALITY_LABELS: Record<AudioQuality, string> = {
  [AudioQuality.STANDARD]: '24 kHz, 96 kbps',
  [AudioQuality.HIGH]: '48 kHz, 192 kbps',
};

interface LanguageSettingsClientProps {
  language: {
    id: string;
    code: string;
    name: string;
    isSource: boolean;
    branchName: string | null;
    audioProvider: AudioProvider | null;
    audioVoice: string | null;
    audioRate: string | null;
    audioPitch: string | null;
    audioSentencePauseMs: number | null;
    audioCommaPauseMs: number | null;
    audioQuality: AudioQuality | null;
    audioPreviewText: string | null;
    translationInstructions: string | null;
  };
  members: { memberCount: number; managerNames: string[] };
  deletionPlan: LanguageDeletionPlan;
}

export default function LanguageSettingsClient({ language, members, deletionPlan }: LanguageSettingsClientProps) {
  const router = useRouter();
  const [name, setName] = useState(language.name);
  const [branchName, setBranchName] = useState(language.branchName ?? '');
  const [audioProvider, setAudioProvider] = useState<AudioProvider | 'NONE'>(language.audioProvider ?? 'NONE');
  const [audioVoice, setAudioVoice] = useState(language.audioVoice ?? '');
  const [audioRate, setAudioRate] = useState(language.audioRate ?? '');
  const [audioPitch, setAudioPitch] = useState(language.audioPitch ?? '');
  const [sentencePause, setSentencePause] = useState(language.audioSentencePauseMs?.toString() ?? '');
  const [commaPause, setCommaPause] = useState(language.audioCommaPauseMs?.toString() ?? '');
  const [quality, setQuality] = useState<AudioQuality>(language.audioQuality ?? DEFAULT_AUDIO_QUALITY);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    capture('language_page_viewed', { language: language.code, tab: 'settings' });
  }, [language.code]);

  // The pathname only knows the code, so the topbar would read "Languages / Hr".
  // The page has the name, so it publishes the trail the shell prefers.
  const publishTrail = useTrailStore((s) => s.publish);
  useEffect(
    () =>
      publishTrail([
        { label: 'Languages', href: '/languages' },
        { label: language.name, href: `/languages/${encodeURIComponent(language.code)}` },
        { label: 'Settings' },
      ]),
    [publishTrail, language.code, language.name],
  );

  const defaultVoice = DEFAULT_AUDIO_VOICES[language.code];
  const pills = languageHealth({ ...language, ...members });

  const handleProviderChange = (value: AudioProvider | 'NONE') => {
    setAudioProvider(value);
    // Prefill the team's default voice for this locale when a provider is first picked.
    if (value !== 'NONE' && !audioVoice && defaultVoice) {
      setAudioVoice(defaultVoice);
    }
  };

  const noAudio = audioProvider === 'NONE';
  const settings = {
    name: name.trim(),
    branchName: branchName.trim() || null,
    audioProvider: noAudio ? null : audioProvider,
    audioVoice: noAudio ? null : audioVoice.trim() || null,
    audioRate: noAudio ? null : audioRate.trim() || null,
    audioPitch: noAudio ? null : audioPitch.trim() || null,
    audioSentencePauseMs: noAudio ? null : sentencePause.trim() || null,
    audioCommaPauseMs: noAudio ? null : commaPause.trim() || null,
    audioQuality: noAudio || quality === DEFAULT_AUDIO_QUALITY ? null : quality,
  };

  // The page saves itself: every field here is a setting, not a draft, and a
  // forgotten Save button is how a tuned voice got lost. The same schema the
  // action uses runs first, so a half-typed value waits instead of failing.
  const autosave = useAutosave({
    value: settings,
    validate: (value) => {
      const parsed = updateLanguageSettingsSchema.safeParse(value);
      if (!parsed.success) return formatIssues(parsed.error);
      if (!language.isSource && !value.branchName) return 'A GitHub branch is required.';
      return null;
    },
    save: async (value) => {
      try {
        await updateLanguageSettingsAction(language.id, value);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save the language');
        throw error;
      }
      capture('language_updated', { code: language.code });
      toast.success('Settings saved');
      router.refresh();
    },
  });

  const handleDelete = async () => {
    setDeleting(true);

    try {
      await deleteLanguageAction(language.id, confirmation);
      capture('language_deleted', { code: language.code });
      toast.success(`${language.name} deleted`);
      router.push('/languages');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the language');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {language.name}
            <Badge variant="secondary">{language.code}</Badge>
            {language.isSource && <Badge variant="outline">Source</Badge>}
          </span>
        }
        description={
          language.isSource
            ? 'The language documents are written in. Nothing translates into it.'
            : `Everything scoped to ${language.name} lives here.`
        }
      >
        <LanguageTabs code={language.code} memberCount={members.memberCount} includeTeam={!language.isSource} />
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row">
        <div className="flex max-w-2xl flex-1 flex-col gap-4">
          <AutosaveNotice
            status={autosave.status}
            problem={autosave.problem}
            lastSavedAt={autosave.lastSavedAt}
            onSaveNow={autosave.saveNow}
          />
          {language.isSource && (
            <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-2.5 text-xs">
              {language.name} is the source language. Documents are authored in it and translated out of it, so it has
              no team, no AI instructions and no voice.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="language-name">Display name *</Label>
                <Input
                  id="language-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="language-code">Language code</Label>
                <div className="relative mt-1 w-32">
                  <Input id="language-code" value={language.code} readOnly disabled className="pr-8" />
                  <Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-3.5" aria-hidden />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Immutable — it is the URL. /languages/{language.code} and /documents/…/{language.code} both key off
                  it, so the action rejects a change rather than trusting this disabled input.
                </p>
              </div>

              {!language.isSource && (
                <div>
                  <Label htmlFor="language-branch">GitHub branch *</Label>
                  <Input
                    id="language-branch"
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    placeholder="e.g., hr-croatian-translation"
                    className="mt-1"
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    The branch in the content repository every {language.name} deploy commits to. Required: without it
                    a deploy throws at the moment it runs.
                  </p>
                </div>
              )}

            </CardContent>
          </Card>

          {!language.isSource && (
            <Card>
              <CardHeader>
                <CardTitle>Audio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="sm:w-56">
                    <Label htmlFor="language-provider">Speech provider</Label>
                    <Select
                      value={audioProvider}
                      onValueChange={(value) => handleProviderChange((value ?? 'NONE') as AudioProvider | 'NONE')}
                      items={{ NONE: 'None (no audio)', [AudioProvider.AZURE_SPEECH]: 'Azure Speech' }}
                    >
                      <SelectTrigger id="language-provider" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">None (no audio)</SelectItem>
                        <SelectItem value={AudioProvider.AZURE_SPEECH}>Azure Speech</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {audioProvider !== 'NONE' && (
                    <div className="flex-1">
                      <Label htmlFor="language-voice">Voice *</Label>
                      <Input
                        id="language-voice"
                        value={audioVoice}
                        onChange={(event) => setAudioVoice(event.target.value)}
                        placeholder="e.g., hr-HR-SreckoNeural"
                        className="mt-1"
                      />
                      {defaultVoice && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Team default for {language.code} is {defaultVoice}.{' '}
                          <button
                            type="button"
                            className="text-foreground underline underline-offset-2"
                            onClick={() => setAudioVoice(defaultVoice)}
                          >
                            Use the default
                          </button>
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {audioProvider !== 'NONE' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Narration</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          !audioRate && !audioPitch && !sentencePause && !commaPause && quality === DEFAULT_AUDIO_QUALITY
                        }
                        onClick={() => {
                          setAudioRate('');
                          setAudioPitch('');
                          setSentencePause('');
                          setCommaPause('');
                          setQuality(DEFAULT_AUDIO_QUALITY);
                        }}
                      >
                        Reset to defaults
                      </Button>
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="sm:w-56">
                        <Label htmlFor="language-rate">Speaking rate</Label>
                        <Input
                          id="language-rate"
                          inputMode="decimal"
                          value={audioRate}
                          onChange={(event) => setAudioRate(event.target.value)}
                          placeholder={DEFAULT_NARRATION.rate}
                          className="mt-1"
                        />
                        <p className="text-muted-foreground mt-1 text-xs">1 is the voice&apos;s own pace, 0.8 is 20% slower.</p>
                      </div>
                      <div className="sm:w-56">
                        <Label htmlFor="language-pitch">Pitch</Label>
                        <Input
                          id="language-pitch"
                          value={audioPitch}
                          onChange={(event) => setAudioPitch(event.target.value)}
                          placeholder={DEFAULT_NARRATION.pitch}
                          className="mt-1"
                        />
                        <p className="text-muted-foreground mt-1 text-xs">0% is the voice&apos;s own pitch.</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="sm:w-56">
                        <Label htmlFor="language-sentence-pause">Pause after sentence (ms)</Label>
                        <Input
                          id="language-sentence-pause"
                          inputMode="numeric"
                          value={sentencePause}
                          onChange={(event) => setSentencePause(event.target.value)}
                          placeholder="Voice default"
                          className="mt-1"
                        />
                        <p className="text-muted-foreground mt-1 text-xs">Silence at every sentence end, e.g. 800.</p>
                      </div>
                      <div className="sm:w-56">
                        <Label htmlFor="language-comma-pause">Pause after comma (ms)</Label>
                        <Input
                          id="language-comma-pause"
                          inputMode="numeric"
                          value={commaPause}
                          onChange={(event) => setCommaPause(event.target.value)}
                          placeholder="Voice default"
                          className="mt-1"
                        />
                        <p className="text-muted-foreground mt-1 text-xs">Silence at every comma, e.g. 150.</p>
                      </div>
                    </div>
                    <h3 className="pt-2 text-sm font-semibold">Output</h3>
                    <div className="sm:w-56">
                      <Label htmlFor="language-quality">Quality</Label>
                      <Select
                        value={quality}
                        onValueChange={(value) => setQuality((value ?? DEFAULT_AUDIO_QUALITY) as AudioQuality)}
                        items={QUALITY_LABELS}
                      >
                        <SelectTrigger id="language-quality" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AudioQuality.STANDARD}>{QUALITY_LABELS[AudioQuality.STANDARD]}</SelectItem>
                          <SelectItem value={AudioQuality.HIGH}>{QUALITY_LABELS[AudioQuality.HIGH]}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground mt-1 text-xs">48 kHz keeps more highs and about doubles the file size.</p>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Empty fields use the app default. New settings apply to audio generated from now on; existing
                      recordings and hand-edited audio text stay as they are.
                    </p>
                    <h3 className="pt-2 text-sm font-semibold">Preview</h3>
                    <LanguageAudioPreview
                      language={language}
                      settings={{
                        audioProvider,
                        audioVoice,
                        audioRate,
                        audioPitch,
                        audioSentencePauseMs: sentencePause,
                        audioCommaPauseMs: commaPause,
                        audioQuality: quality,
                      }}
                    />
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Approved {language.name} translations get generated audio. With no voice, approval produces nothing
                  and says nothing.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-5">
                <div>
                  <p className="text-sm font-semibold">Delete {language.name}</p>
                  <p className="text-muted-foreground mt-1 max-w-md text-xs">
                    {deletionPlan.allowed
                      ? deletionPlan.summary
                      : 'Deleting a language cascades into its translations, projects, memberships and invitations. There is no undo and no backup path in this app.'}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={!deletionPlan.allowed}
                  onClick={() => {
                    setConfirmation('');
                    setDeleteOpen(true);
                  }}
                >
                  Delete language
                </Button>
              </div>

              {!deletionPlan.allowed && (
                <div className="border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-lg border px-3 py-2.5">
                  <Ban className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                  <p className="text-destructive text-xs">{deletionPlan.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:w-72">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm">Configuration health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {language.isSource ? (
                <p className="text-muted-foreground text-xs">
                  None of the four checks apply to the source language.
                </p>
              ) : (
                <>
                  <LanguageHealthPills pills={pills} className="flex-col items-start" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    nativeButton={false}
                    render={<Link href={`/instructions?lang=${encodeURIComponent(language.code)}`} />}
                  >
                    <ScrollText />
                    AI instructions
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    {members.memberCount === 0
                      ? 'No members yet.'
                      : `${members.memberCount} ${members.memberCount === 1 ? 'member' : 'members'}.`}{' '}
                    Roles are edited on the Team tab.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {language.name}?</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <p className="text-sm">{deletionPlan.allowed ? deletionPlan.summary : deletionPlan.reason}</p>
            {deletionPlan.allowed && (
              <div>
                <Label htmlFor="language-confirm">
                  Type <span className="font-semibold">{language.name}</span> to confirm
                </Label>
                <Input
                  id="language-confirm"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1"
                  autoComplete="off"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deletionPlan.allowed || deleting || confirmation.trim() !== language.name}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete language'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** No Save button while a save is coming anyway; only a failed save offers one. */
const SAVE_CONTROL_STATUS: Record<AutosaveStatus, SaveStatus> = {
  saved: 'saved',
  pending: 'pending',
  invalid: 'blocked',
  saving: 'pending',
  failed: 'error',
};

/**
 * Where the page's own saving stands, in the same slot the translation editor
 * uses, and why it is waiting when it is. Sticky under the topbar: the field
 * being edited is usually far down the page, and that is where the answer is
 * needed.
 */
function AutosaveNotice({
  status,
  problem,
  lastSavedAt,
  onSaveNow,
}: {
  status: AutosaveStatus;
  problem: string | null;
  lastSavedAt: Date | null;
  onSaveNow: () => void;
}) {
  const { sentinel, notice, isStuck } = useStuck();
  return (
    <>
      {/* Zero height, cancelling the column gap: it marks where the notice
          would sit unstuck, and leaves the viewport the moment it sticks. */}
      <div ref={sentinel} aria-hidden className="-mb-4 h-0" />
      <div
        ref={notice}
        aria-live="polite"
        data-status={status}
        data-stuck={isStuck || undefined}
        className={cn(
          'sticky top-[calc(var(--header-height,3rem)+0.5rem)] z-[5] flex items-center gap-2 self-end rounded-md border py-0.5 pr-0.5 pl-3 backdrop-blur transition-[background-color,box-shadow]',
          isStuck ? 'bg-muted/95 shadow-lg' : 'bg-background/95 shadow-xs',
        )}
      >
      <span className={cn('text-xs', problem ? 'text-destructive' : 'text-muted-foreground')}>
        {problem ? `Not saved: ${problem}` : 'Changes save automatically'}
      </span>
      <SaveControl
        status={SAVE_CONTROL_STATUS[status]}
        lastSavedAt={lastSavedAt}
        onSave={onSaveNow}
      />
      </div>
    </>
  );
}

/**
 * Whether the notice is stuck under the topbar, so it can look lifted off the
 * cards scrolling beneath it. The sentinel sits where the notice would be if
 * it scrolled with the page; once that spot passes under the topbar, the
 * notice is being held in place.
 */
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    if (!sentinel.current || !notice.current || typeof IntersectionObserver === 'undefined') return;
    const top = parseFloat(getComputedStyle(notice.current).top) || 0;
    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      rootMargin: `-${top}px 0px 0px 0px`,
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);

  return { sentinel, notice, isStuck };
}
