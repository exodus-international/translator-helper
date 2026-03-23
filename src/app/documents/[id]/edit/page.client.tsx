'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DocumentTypeSelect } from '@/components/document-form/document-type-select';
import { LabelsField } from '@/components/document-form/labels-field';
import { OriginalFilenameField } from '@/components/document-form/original-filename-field';
import { validateDailyContentFilename } from '@/components/document-form/validate-daily-content-filename';
import { updateDocumentAction } from '@/domain/document/document.actions';
import { updateDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface EditDocumentClientProps {
  document: {
    id: string;
    title: string;
    slug: string;
    originalFilename: string | null;
    type: string | null;
    labels: string[];
    sourceProjectId: string | null;
    deadline: Date | null;
  };
  sourceVersion: {
    id: string;
    content: string;
  } | null;
  sourceProjects: Array<{
    id: string;
    name: string;
    _count: { documents: number };
  }>;
}

export default function EditDocumentClient({ document, sourceVersion, sourceProjects }: EditDocumentClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [originalFilename, setOriginalFilename] = useState(document.originalFilename || '');
  const [documentType, setDocumentType] = useState(document.type || '');
  const [sourceProjectId, setSourceProjectId] = useState(document.sourceProjectId || '');
  const [labels, setLabels] = useState<string[]>(document.labels || []);
  const [content, setContent] = useState(sourceVersion?.content || '');
  const [loading, setLoading] = useState(false);

  const dailyContentFilenameError = validateDailyContentFilename(documentType, originalFilename);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update document metadata
      await updateDocumentAction(document.id, {
        title,
        originalFilename: originalFilename || null,
        type: documentType || null,
        sourceProjectId: sourceProjectId || null,
        labels,
      });

      // Update source version content if we have one
      if (sourceVersion) {
        await updateDocumentVersionAction(sourceVersion.id, {
          content,
        });
      }

      toast.success('Document updated successfully');
      router.push('/documents');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating document:', error);
      toast.error(error.message || 'Failed to update document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Edit Document</h1>
              <p className="text-gray-600">Editing: {document.title}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Card className="p-4">
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Document title"
                  />
                </div>
                <OriginalFilenameField
                  value={originalFilename}
                  onChange={setOriginalFilename}
                  documentType={documentType}
                  error={dailyContentFilenameError}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sourceProject">Source Project</Label>
                  <Select value={sourceProjectId} onValueChange={setSourceProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source project" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DocumentTypeSelect value={documentType} onChange={setDocumentType} />
              </div>

              <LabelsField labels={labels} onChange={setLabels} />

              {sourceVersion && (
                <div>
                  <Label htmlFor="content">Source Content (Markdown)</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="# Your markdown content here..."
                    rows={15}
                    className="font-mono"
                  />
                </div>
              )}

              <div className="flex justify-between">
                <Link href="/documents">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={loading || !title || !!dailyContentFilenameError}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
