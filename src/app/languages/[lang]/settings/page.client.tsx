'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { LanguageHealthPills } from '@/components/language-health-pills';
import { LanguageTabs } from '@/components/language-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AudioProvider } from '@/generated/prisma/enums';
import type { LanguageDeletionPlan } from '@/domain/language/language-delete';
import { languageHealth } from '@/domain/language/language-health';
import { deleteLanguageAction, updateLanguageSettingsAction } from '@/domain/language/language.actions';
import { DEFAULT_AUDIO_VOICES } from '@/domain/language/language.types';
import { capture } from '@/lib/analytics';
import { useTrailStore } from '@/lib/page-trail';

interface LanguageSettingsClientProps {
  language: {
    id: string;
    code: string;
    name: string;
    isSource: boolean;
    branchName: string | null;
    audioProvider: AudioProvider | null;
    audioVoice: string | null;
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
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    setSaving(true);

    try {
      await updateLanguageSettingsAction(language.id, {
        name: name.trim(),
        branchName: branchName.trim() || null,
        audioProvider: audioProvider === 'NONE' ? null : audioProvider,
        audioVoice: audioProvider === 'NONE' ? null : audioVoice.trim() || null,
      });
      capture('language_updated', { code: language.code });
      toast.success('Language saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the language');
    } finally {
      setSaving(false);
    }
  };

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

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
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
