'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { createDocumentAction } from '@/domain/document/document.actions';
import { createSourceProjectAction } from '@/domain/source-project/source-project.actions';
import { cn } from '@/lib/utils';
import matter from 'gray-matter';
import { FileText, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface NewDocumentClientProps {
  sourceProjects: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export default function NewDocumentClient({ sourceProjects: initialSourceProjects }: NewDocumentClientProps) {
  const router = useRouter();
  const [sourceProjects, setSourceProjects] = useState(initialSourceProjects);
  const [mode, setMode] = useState<'upload' | 'create'>('upload');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [sourceProjectId, setSourceProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [deadline, setDeadline] = useState<string>('');
  const [originalFilename, setOriginalFilename] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.md')) {
      // Store original filename
      setOriginalFilename(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;

        // Parse frontmatter
        const { data: frontmatter, content: markdownContent } = matter(text);

        // Set content (preserve original document with metadata)
        setContent(text);

        // Extract title from frontmatter or filename
        const extractedTitle = frontmatter.title || file.name.replace('.md', '');
        setTitle(extractedTitle);

        // Generate slug from title with random suffix for uniqueness
        const base = extractedTitle
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        const suffix = Math.random().toString(36).substring(2, 7);
        setSlug(base ? `${base}-${suffix}` : '');

        // Extract labels from frontmatter
        const extractedLabels: string[] = [];
        if (frontmatter.day) extractedLabels.push(`day${frontmatter.day}`);
        if (frontmatter.verse_tag) extractedLabels.push(frontmatter.verse_tag);
        if (frontmatter.hero) extractedLabels.push(frontmatter.hero);
        if (frontmatter.subtitle) extractedLabels.push(frontmatter.subtitle);

        setLabels(extractedLabels);
        setMode('create');
      };
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.md')) {
      // Store original filename
      setOriginalFilename(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;

        // Parse frontmatter
        const { data: frontmatter, content: markdownContent } = matter(text);

        // Set content (preserve original document with metadata)
        setContent(text);

        // Extract title from frontmatter or filename
        const extractedTitle = frontmatter.title || file.name.replace('.md', '');
        setTitle(extractedTitle);

        // Generate slug from title with random suffix for uniqueness
        const base = extractedTitle
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        const suffix = Math.random().toString(36).substring(2, 7);
        setSlug(base ? `${base}-${suffix}` : '');

        // Extract labels from frontmatter
        const extractedLabels: string[] = [];
        if (frontmatter.day) extractedLabels.push(`day${frontmatter.day}`);
        if (frontmatter.verse_tag) extractedLabels.push(frontmatter.verse_tag);
        if (frontmatter.hero) extractedLabels.push(frontmatter.hero);
        if (frontmatter.subtitle) extractedLabels.push(frontmatter.subtitle);

        setLabels(extractedLabels);
        setMode('create');
      };
      reader.readAsText(file);
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    // Always auto-generate slug from title with random suffix for uniqueness
    const base = value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const suffix = Math.random().toString(36).substring(2, 7);
    setSlug(base ? `${base}-${suffix}` : '');
  };

  const addLabel = () => {
    if (labelInput && !labels.includes(labelInput)) {
      setLabels([...labels, labelInput]);
      setLabelInput('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
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
      // Add the new project to the list
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

      const document = await createDocumentAction({
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

      <div className="container mx-auto px-4 py-8">
        <Card className="p-8">
          {mounted ? (
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
                      <p className="text-xs text-gray-500 mt-1">Determines the file path in the content repository</p>
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

                    <div>
                      <Label htmlFor="content">Content (Markdown) *</Label>
                      <Textarea
                        id="content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        required
                        placeholder="# Your markdown content here..."
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
                      <Button type="submit" disabled={loading || !sourceProjectId || sourceProjects.length === 0}>
                        {loading ? 'Creating...' : 'Create Document'}
                      </Button>
                    </div>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                  <button
                    type="button"
                    disabled
                    className={cn(
                      'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                      mode === 'upload' && 'bg-background shadow-sm',
                    )}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </button>
                  <button
                    type="button"
                    disabled
                    className={cn(
                      'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                      mode === 'create' && 'bg-background shadow-sm',
                    )}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Create New
                  </button>
                </div>
              </div>
              {mode === 'upload' ? (
                <div className="text-center">
                  <div className="border-2 border-dashed rounded-lg p-12 text-center border-gray-300">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">Drag and drop your markdown file here</p>
                    <p className="text-gray-600 mb-4">or</p>
                    <Button type="button" variant="outline" disabled>
                      Browse Files
                    </Button>
                    <p className="text-xs text-gray-500 mt-4">Only .md files are supported</p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">Loading form...</div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
