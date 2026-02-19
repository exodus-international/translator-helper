'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { updateDocumentAction } from '@/domain/document/document.actions';
import { updateDocumentVersionAction } from '@/domain/document-version/document-version.actions';
import { ArrowLeft, X } from 'lucide-react';
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

export default function EditDocumentClient({
  document,
  sourceVersion,
  sourceProjects,
}: EditDocumentClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [originalFilename, setOriginalFilename] = useState(document.originalFilename || '');
  const [documentType, setDocumentType] = useState(document.type || '');
  const [sourceProjectId, setSourceProjectId] = useState(document.sourceProjectId || '');
  const [labels, setLabels] = useState<string[]>(document.labels || []);
  const [labelInput, setLabelInput] = useState('');
  const [content, setContent] = useState(sourceVersion?.content || '');
  const [loading, setLoading] = useState(false);

  const addLabel = () => {
    if (labelInput && !labels.includes(labelInput)) {
      setLabels([...labels, labelInput]);
      setLabelInput('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

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
                <div>
                  <Label htmlFor="originalFilename">Original Filename</Label>
                  <Input
                    id="originalFilename"
                    value={originalFilename}
                    onChange={(e) => setOriginalFilename(e.target.value)}
                    placeholder="e.g., 1.md"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for GitHub deploy path</p>
                </div>
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
                <div>
                  <Label htmlFor="documentType">Document Type</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">Day</SelectItem>
                      <SelectItem value="FIELD_GUIDE">Field Guide</SelectItem>
                      <SelectItem value="DAILY_CONTENT">Daily Content</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="labels">Labels</Label>
                <div className="flex gap-2">
                  <Input
                    id="labels"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="Add label"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addLabel();
                      }
                    }}
                  />
                  <Button type="button" onClick={addLabel} variant="outline">
                    Add
                  </Button>
                </div>
                {labels.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {labels.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                        <button type="button" onClick={() => removeLabel(label)} className="ml-2">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

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
                <Button type="submit" disabled={loading || !title}>
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
