'use client';

import { useState } from 'react';
import { Language } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { createLanguageAction, updateLanguageAction, deleteLanguageAction } from '@/domain/language/language.actions';
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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingLanguage) {
        const updated = await updateLanguageAction(editingLanguage.id, { name });
        setLanguages(languages.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        const created = await createLanguageAction({ code, name });
        setLanguages([...languages, created]);
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
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLanguageAction(id);
      setLanguages(languages.filter((l) => l.id !== id));
      toast.success('Language deleted successfully');
    } catch (error: any) {
      console.error('Error deleting language:', error);
      toast.error(error.message || 'Failed to delete language');
    }
  };

  const handleDeleteConfirm = async (id: string) => {
    await handleDelete(id);
  };

  const resetForm = () => {
    setEditingLanguage(null);
    setCode('');
    setName('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Language Management</h1>
              <p className="text-gray-600">Manage translation languages</p>
            </div>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Language
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLanguage ? 'Edit Language' : 'Add Language'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
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
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-4">
          {languages.map((language) => (
            <Card key={language.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{language.name}</h3>
                  <p className="text-sm text-gray-600">Code: {language.code}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(language)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Language</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{language.name}" ({language.code})? This action cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteConfirm(language.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
