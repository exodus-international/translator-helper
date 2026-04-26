'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminListPage, DeleteConfirmDialog } from '@/components/admin-list-page';
import {
  createSourceProjectAction,
  deleteSourceProjectAction,
  updateSourceProjectAction,
} from '@/domain/source-project/source-project.actions';
import { SourceProject } from '@prisma/client';
import { CheckCircle2, Edit, FolderOpen, Languages } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  const resetForm = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setIdentifier('');
  };

  // Replace one project in state, preserving its _count (server doesn't return _count on update)
  const replaceProjectPreservingCount = (updated: SourceProject) =>
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
        replaceProjectPreservingCount(updated);
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
      const updated = await updateSourceProjectAction(project.id, { status: newStatus });
      replaceProjectPreservingCount(updated);
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

  return (
    <AdminListPage
      title="Source Projects"
      description="Manage source projects and their translations"
      addLabel="Add Source Project"
      dialogOpen={dialogOpen}
      onDialogOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}
      dialogTitle={editingProject ? 'Edit Source Project' : 'Add Source Project'}
      onSubmit={handleSubmit}
      loading={loading}
      formFields={
        <>
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
            <p className="text-xs text-gray-500 mt-1">GITHUB: Folder name in the content repository</p>
          </div>
        </>
      }
    >
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
              <DeleteConfirmDialog
                title="Delete Source Project"
                description={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
                onConfirm={() => handleDelete(project.id, project._count.documents)}
              />
            </div>
          </div>
        </Card>
      ))}
    </AdminListPage>
  );
}
