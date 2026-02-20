'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTranslationProjectAction } from '@/domain/translation-project/translation-project.actions';
import { Language, Prisma } from '@prisma/client';
import { ArrowLeft, ExternalLink, Languages, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

type TranslationProjectListItem = Prisma.TranslationProjectGetPayload<{
  include: {
    sourceProject: true;
    language: true;
    members: {
      select: {
        userId: true;
      };
    };
    _count: {
      select: {
        documentAssignments: true;
      };
    };
  };
}>;

type SourceProjectWithDetails = Prisma.SourceProjectGetPayload<{
  include: {
    documents: true;
    translationProjects: {
      include: {
        language: true;
        _count: {
          select: {
            members: true;
          };
        };
      };
    };
  };
}>;

interface TranslationsClientProps {
  sourceProject: SourceProjectWithDetails;
  translationProjects: TranslationProjectListItem[];
  languages: Language[];
}

export default function TranslationsClient({
  sourceProject,
  translationProjects: initialTranslationProjects,
  languages,
}: TranslationsClientProps) {
  const router = useRouter();
  const [translationProjects, setTranslationProjects] = useState(initialTranslationProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createTranslationProjectAction({
        name,
        sourceProjectId: sourceProject.id,
        languageId: selectedLanguageId,
      });
      setDialogOpen(false);
      resetForm();
      router.refresh();
    } catch (error: any) {
      console.error('Error creating translation project:', error);
      toast.error(error.message || 'Failed to create translation project');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSelectedLanguageId('');
  };

  // Get languages that don't have a translation project yet
  const availableLanguages = languages.filter((lang) => !translationProjects.some((tp) => tp.languageId === lang.id));

  // Check if we have any languages at all
  const hasNoLanguages = languages.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/admin/projects"
                className="text-sm text-gray-600 hover:text-gray-900 mb-2 inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Projects
              </Link>
              <h1 className="text-2xl font-bold">{sourceProject.name}</h1>
              <p className="text-gray-600">Translation Projects</p>
            </div>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button disabled={availableLanguages.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Translation Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Translation Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Project Name *</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`${sourceProject.name} - [Language]`}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="language">Target Language *</Label>
                    <Select value={selectedLanguageId} onValueChange={setSelectedLanguageId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a language" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLanguages.map((lang) => (
                          <SelectItem key={lang.id} value={lang.id}>
                            {lang.name} ({lang.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableLanguages.length === 0 && (
                      <p className="text-sm text-gray-500 mt-1">All languages already have translation projects</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading || !selectedLanguageId}>
                      {loading ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            {hasNoLanguages && (
              <div className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                <span>No target languages available.</span>
                <Link href="/admin/languages" className="text-blue-600 hover:underline flex items-center gap-1">
                  Add languages
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
            {!hasNoLanguages && availableLanguages.length === 0 && (
              <div className="text-sm text-gray-500 mt-2">All languages already have translation projects.</div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <div className="grid gap-4">
          {translationProjects.map((tp) => (
            <Card key={tp.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Languages className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{tp.name}</h3>
                      <Link
                        href={`/projects/${sourceProject.id}/translations/${tp.id}`}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Users className="h-4 w-4" />
                        Manage
                      </Link>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {tp.language.name} ({tp.language.code})
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>{new Set(tp.members.map((m) => m.userId)).size} member(s)</span>
                      <span>{tp._count.documentAssignments} document(s)</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {translationProjects.length === 0 && (
            <Card className="p-6 text-center">
              <Languages className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No translation projects yet. Create one to get started.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
