'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DocumentTypeSelect } from '@/components/document-form/document-type-select';
import { LabelsField } from '@/components/document-form/labels-field';
import { OriginalFilenameField } from '@/components/document-form/original-filename-field';
import { getContentFormat } from '@/components/document-form/content-format';
import { validateFilename } from '@/components/document-form/validate-filename';
import { createDocumentAction } from '@/domain/document/document.actions';
import { createSourceProjectAction } from '@/domain/source-project/source-project.actions';
import matter from 'gray-matter';
import { FileText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface NewDocumentClientProps {
  sourceProjects: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const suffix = Math.random().toString(36).substring(2, 7);
  return base ? `${base}-${suffix}` : '';
}

function extractLabelsFromFrontmatter(frontmatter: Record<string, unknown>): string[] {
  const labels: string[] = [];
  if (frontmatter.day) labels.push(`day${frontmatter.day}`);
  if (frontmatter.verse_tag) labels.push(String(frontmatter.verse_tag));
  if (frontmatter.hero) labels.push(String(frontmatter.hero));
  if (frontmatter.subtitle) labels.push(String(frontmatter.subtitle));
  return labels;
}

export default function NewDocumentClient({ sourceProjects: initialSourceProjects }: NewDocumentClientProps) {
  const router = useRouter();
  const [sourceProjects, setSourceProjects] = useState(initialSourceProjects);
  const [mode, setMode] = useState<'upload' | 'create'>('upload');

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [originalFilename, setOriginalFilename] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const filenameError = validateFilename(documentType, originalFilename);
  const contentFormat = getContentFormat(originalFilename);

  const processFile = useCallback((file: File) => {
    setOriginalFilename(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { data: frontmatter } = matter(text);

      setContent(text);

      const extractedTitle = frontmatter.title || file.name.replace('.md', '');
      setTitle(extractedTitle);
      setSlug(generateSlug(extractedTitle));
      setLabels(extractLabelsFromFrontmatter(frontmatter));
      setMode('create');
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.md')) processFile(file);
    },
    [processFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.md')) processFile(file);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setSlug(generateSlug(value));
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.warning('Please enter a project name');
      return;
    }

    setCreatingProject(true);
    try {
      const project = await createSourceProjectAction({
        name: newProjectName.trim(),
      });
      setSourceProjects([
        ...sourceProjects,
        { id: project.id, name: project.name, status: (project as unknown as { status: string }).status ?? 'ACTIVE' },
      ]);
      setSourceProjectId(project.id);
      setShowNewProjectInput(false);
      setNewProjectName('');
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error(error.message || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!sourceProjectId) {
        toast.warning('Please select a source project or create a new one');
        setLoading(false);
        return;
      }

      await createDocumentAction({
        title,
        slug,
        content,
        sourceProjectId,
        labels,
        deadline: deadline ? new Date(deadline) : undefined,
        originalFilename: originalFilename || undefined,
        type: documentType || undefined,
      });

      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error creating document:', error);
      toast.error(error.message || 'Failed to create document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">New Document</h1>
          <p className="text-gray-600">Upload a markdown file or create a new document</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Card className="p-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as 'upload' | 'create')}>
            <div className="flex justify-center mb-6">
              <TabsList className="w-full">
                <TabsTrigger value="upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </TabsTrigger>
                <TabsTrigger value="create">
                  <FileText className="h-4 w-4 mr-2" />
                  Create New
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upload" className="mt-0">
              <div className="text-center">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    border-2 border-dashed rounded-lg p-12 text-center
                    ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
                  `}
                >
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">Drag and drop your markdown file here</p>
                  <p className="text-gray-600 mb-4">or</p>
                  <label>
                    <input type="file" accept=".md" onChange={handleFileSelect} className="hidden" />
                    <Button type="button" variant="outline" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                  <p className="text-xs text-gray-500 mt-4">Only .md files are supported</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="create" className="mt-0">
              <form onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        required
                        placeholder="Document title"
                      />
                    </div>
                    <OriginalFilenameField
                      value={originalFilename}
                      onChange={setOriginalFilename}
                      documentType={documentType}
                      error={filenameError}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sourceProject">Source Project *</Label>
                      {!showNewProjectInput ? (
                        <>
                          <div className="flex gap-2">
                            <Select value={sourceProjectId} onValueChange={setSourceProjectId} required>
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
                            <Button type="button" variant="outline" onClick={() => setShowNewProjectInput(true)}>
                              New Project
                            </Button>
                          </div>
                          {sourceProjects.length === 0 && (
                            <p className="text-sm text-gray-500 mt-1">No projects available. Create a new one.</p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder="Enter project name"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCreateProject();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              onClick={handleCreateProject}
                              disabled={creatingProject || !newProjectName.trim()}
                            >
                              {creatingProject ? 'Creating...' : 'Create'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setShowNewProjectInput(false);
                                setNewProjectName('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500">Press Enter or click Create to add the project</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="deadline">Deadline (Optional)</Label>
                      <Input
                        id="deadline"
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        placeholder="Select deadline"
                      />
                    </div>
                  </div>

                  <div>
                    <DocumentTypeSelect value={documentType} onChange={setDocumentType} />
                    <p className="text-xs text-gray-500 mt-1">Determines the file path in the content repository</p>
                  </div>

                  <LabelsField labels={labels} onChange={setLabels} />

                  <div>
                    <Label htmlFor="content">Content ({contentFormat}) *</Label>
                    <Textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      required
                      placeholder={contentFormat === 'YAML' ? 'key: value' : '# Your markdown content here...'}
                      rows={15}
                      className="font-mono"
                    />
                  </div>

                  <div className="flex justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (mode === 'create' && !content) {
                          setMode('upload');
                        } else {
                          router.back();
                        }
                      }}
                    >
                      {mode === 'create' && !content ? 'Back to Upload' : 'Cancel'}
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        loading || !sourceProjectId || sourceProjects.length === 0 || !!filenameError
                      }
                    >
                      {loading ? 'Creating...' : 'Create Document'}
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
