'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SourceProject } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Plus, Edit, Trash2, FolderOpen, Languages, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  createSourceProjectAction,
  updateSourceProjectAction,
  deleteSourceProjectAction,
} from '@/domain/source-project/source-project.actions';
import { toast } from 'sonner';

interface ProjectsClientProps {
  sourceProjects: (SourceProject & {
    _count: {
      documents: number;
      translationProjects: number;
    };
  })[];
}

export default function ProjectsClient({ sourceProjects: initialSourceProjects }: ProjectsClientProps) {
  const router = useRouter();
  const [sourceProjects, setSourceProjects] = useState(initialSourceProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SourceProject | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync state with props when they change (e.g., after router.refresh())
  useEffect(() => {
    setSourceProjects(initialSourceProjects);
  }, [initialSourceProjects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingProject) {
        const updated = await updateSourceProjectAction(editingProject.id, {
          name,
          description: description || null,
          identifier: identifier || null,
        });
        setSourceProjects(
          sourceProjects.map((p) =>
            p.id === updated.id
              ? {
                  ...updated,
                  _count: sourceProjects.find((sp) => sp.id === updated.id)?._count || {
                    documents: 0,
                    translationProjects: 0,
                  },
                }
              : p,
          ),
        );
      } else {
        // Create source project (this will also create translation projects for all languages)
        await createSourceProjectAction({
          name,
          description: description || undefined,
          identifier: identifier || undefined,
        });
        // Refresh the page to get updated counts including translation projects
        router.refresh();
      }

      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving source project:', error);
      toast.error(error.message || 'Failed to save source project');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (project: SourceProject) => {
    setEditingProject(project);
    setName(project.name);
    setDescription(project.description || '');
    setIdentifier((project as any).identifier || '');
    setDialogOpen(true);
  };

  const handleToggleStatus = async (project: SourceProject) => {
    const newStatus = project.status === 'ACTIVE' ? 'COMPLETE' : 'ACTIVE';

    try {
      const updated = await updateSourceProjectAction(project.id, {
        status: newStatus,
      });
      setSourceProjects(
        sourceProjects.map((p) =>
          p.id === updated.id
            ? {
                ...updated,
                _count: sourceProjects.find((sp) => sp.id === updated.id)?._count || {
                  documents: 0,
                  translationProjects: 0,
                },
              }
            : p,
        ),
      );
    } catch (error: any) {
      console.error('Error updating project status:', error);
      toast.error(error.message || 'Failed to update project status');
    }
  };

  const handleDelete = async (id: string, documentCount: number) => {
    if (documentCount > 0) {
      toast.warning('Cannot delete source project with documents. Please move or delete documents first.');
      return;
    }

    try {
      await deleteSourceProjectAction(id);
      setSourceProjects(sourceProjects.filter((p) => p.id !== id));
      toast.success('Source project deleted successfully');
    } catch (error: any) {
      console.error('Error deleting source project:', error);
      toast.error(error.message || 'Failed to delete source project');
    }
  };

  const handleDeleteConfirm = async (id: string, documentCount: number) => {
    await handleDelete(id, documentCount);
  };

  const resetForm = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setIdentifier('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Source Projects</h1>
              <p className="text-gray-600">Manage source projects and their translations</p>
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
                  Add Source Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProject ? 'Edit Source Project' : 'Add Source Project'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Project Name *</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Exodus90, Daily Readings"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description of the project"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="identifier">Repository Identifier</Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="e.g., exodus90, lent2026"
                    />
                    <p className="text-xs text-gray-500 mt-1">Folder name in the content repository</p>
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

      <div className="container mx-auto px-4 py-4">
        <div className="grid gap-4">
          {sourceProjects.map((project) => (
            <Card key={project.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <FolderOpen className="h-5 w-5 text-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{project.name}</h3>
                      {project.status === 'COMPLETE' && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Complete
                        </Badge>
                      )}
                      <Link
                        href={`/projects/${project.id}/translations`}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Languages className="h-4 w-4" />
                        Manage Translations
                      </Link>
                    </div>
                    {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
                    {(project as any).identifier && (
                      <p className="text-xs text-gray-500 mt-1">ID: {(project as any).identifier}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>{project._count.documents} document(s)</span>
                      <span>{project._count.translationProjects} translation project(s)</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleStatus(project)}
                    title={project.status === 'ACTIVE' ? 'Mark as Complete' : 'Mark as Active'}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(project)}>
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
                        <AlertDialogTitle>Delete Source Project</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{project.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteConfirm(project.id, project._count.documents)}>
                          Delete
                        </AlertDialogAction>
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
