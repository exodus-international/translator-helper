'use client';

import { useState } from 'react';
import { Language } from '@/generated/prisma/client';
import { AudioProvider } from '@/generated/prisma/enums';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit } from 'lucide-react';
import { AdminListPage, DeleteConfirmDialog } from '@/components/admin-list-page';
import {
  createLanguageAction,
  updateLanguageAction,
  updateLanguageBranchNameAction,
  updateLanguageAudioAction,
  deleteLanguageAction,
} from '@/domain/language/language.actions';
import { DEFAULT_AUDIO_VOICES } from '@/domain/language/language.types';
import { capture } from '@/lib/analytics';
import { toast } from 'sonner';

interface LanguagesClientProps {
  languages: Language[];
}

export default function LanguagesClient({ languages: initialLanguages }: LanguagesClientProps) {
  const [languages, setLanguages] = useState(initialLanguages);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [audioProvider, setAudioProvider] = useState<AudioProvider | 'NONE'>('NONE');
  const [audioVoice, setAudioVoice] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEditingLanguage(null);
    setCode('');
    setName('');
    setBranchName('');
    setAudioProvider('NONE');
    setAudioVoice('');
  };

  const handleProviderChange = (value: AudioProvider | 'NONE') => {
    setAudioProvider(value);
    // Prefill the team's default voice for this locale when a provider is first picked.
    if (value !== 'NONE' && !audioVoice) {
      setAudioVoice(DEFAULT_AUDIO_VOICES[editingLanguage?.code ?? code] ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingLanguage) {
        const updated = await updateLanguageAction(editingLanguage.id, { name });
        // Also update branch name if it changed
        if (branchName !== (editingLanguage.branchName || '')) {
          await updateLanguageBranchNameAction(editingLanguage.id, {
            branchName: branchName || null,
          });
        }
        const audio = {
          audioProvider: audioProvider === 'NONE' ? null : audioProvider,
          audioVoice: audioProvider === 'NONE' ? null : audioVoice || null,
        };
        if (audio.audioProvider !== editingLanguage.audioProvider || audio.audioVoice !== editingLanguage.audioVoice) {
          await updateLanguageAudioAction(editingLanguage.id, audio);
        }
        setLanguages(
          languages.map((l) => (l.id === updated.id ? { ...updated, branchName: branchName || null, ...audio } : l)),
        );
        capture('language_updated', { code: updated.code });
      } else {
        const created = await createLanguageAction({ code, name, branchName: branchName || undefined });
        setLanguages([...languages, created]);
        capture('language_created', { code: created.code });
      }

      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving language:', error);
      toast.error(error.message || 'Failed to save language');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (language: Language) => {
    setEditingLanguage(language);
    setCode(language.code);
    setName(language.name);
    setBranchName(language.branchName || '');
    setAudioProvider(language.audioProvider ?? 'NONE');
    setAudioVoice(language.audioVoice || '');
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLanguageAction(id);
      setLanguages(languages.filter((l) => l.id !== id));
      capture('language_deleted');
      toast.success('Language deleted successfully');
    } catch (error: any) {
      console.error('Error deleting language:', error);
      toast.error(error.message || 'Failed to delete language');
    }
  };

  return (
    <AdminListPage
      title="Language Management"
      description="Manage translation languages"
      addLabel="Add Language"
      dialogOpen={dialogOpen}
      onDialogOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}
      dialogTitle={editingLanguage ? 'Edit Language' : 'Add Language'}
      onSubmit={handleSubmit}
      loading={loading}
      formFields={
        <>
          <div>
            <Label htmlFor="code">Language Code *</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g., en, cs, de"
              required
              disabled={!!editingLanguage}
            />
          </div>
          <div>
            <Label htmlFor="name">Language Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., English, Czech, German"
              required
            />
          </div>
          <div>
            <Label htmlFor="branchName">GitHub Branch Name</Label>
            <Input
              id="branchName"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g., hr-croatian-translation"
            />
            <p className="text-xs text-gray-500 mt-1">Branch in the content repo for this language</p>
          </div>
          {editingLanguage && (
            <>
              <div>
                <Label htmlFor="audioProvider">Speech Provider</Label>
                <Select value={audioProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger id="audioProvider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None (no audio)</SelectItem>
                    <SelectItem value={AudioProvider.AZURE_SPEECH}>Azure Speech</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Approved translations in this language get generated audio</p>
              </div>
              {audioProvider !== 'NONE' && (
                <div>
                  <Label htmlFor="audioVoice">Voice *</Label>
                  <Input
                    id="audioVoice"
                    value={audioVoice}
                    onChange={(e) => setAudioVoice(e.target.value)}
                    placeholder="e.g., cs-CZ-AntoninNeural"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Provider voice id. Team policy is the male voice per locale.</p>
                </div>
              )}
            </>
          )}
        </>
      }
    >
      {languages.map((language) => (
        <Card key={language.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">{language.name}</h3>
              <p className="text-sm text-gray-600">Code: {language.code}</p>
              {language.branchName && <p className="text-xs text-gray-500">Branch: {language.branchName}</p>}
              {language.audioVoice && <p className="text-xs text-gray-500">Voice: {language.audioVoice}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(language)}>
                <Edit className="h-4 w-4" />
              </Button>
              <DeleteConfirmDialog
                title="Delete Language"
                description={`Are you sure you want to delete "${language.name}" (${language.code})? This action cannot be undone.`}
                onConfirm={() => handleDelete(language.id)}
              />
            </div>
          </div>
        </Card>
      ))}
    </AdminListPage>
  );
}
