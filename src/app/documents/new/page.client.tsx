'use client';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
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
import { validateFilename } from '@/domain/document/validate-filename';
import { buildDefaultTitle, dayNumberFromFilename, parseDayNumber } from '@/domain/document/document-title';
import { createDocumentAction } from '@/domain/document/document.actions';
import { createSourceProjectAction } from '@/domain/source-project/source-project.actions';
import { capture } from '@/lib/analytics';
import { parseFrontmatter } from '@/lib/frontmatter';
import { FileText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DocumentType } from '@/generated/prisma/enums';
import { toast } from 'sonner';

interface NewDocumentClientProps {
  sourceProjects: Array<{
    id: string;
    name: string;
    status: string;
    acronym?: string | null;
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

// Mirrors `sourceProjectIdentifier` in source-project.types.ts. Checked here
// because the Create button is not a submit, so the input's `pattern` never
// runs, and a server action's zod error reaches production as a generic
// failure rather than something the user can act on.
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  // The file's own title, kept apart from `title` because the composed default
  // ("SML - DAY 03 - ...") is built from it and the slug stays derived from it.
  const [baseTitle, setBaseTitle] = useState('');
  const [dayNumber, setDayNumber] = useState<number | null>(null);
  // Once the title has been typed in, it stops following the project and type.
  const [titleEdited, setTitleEdited] = useState(false);
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectIdentifier, setNewProjectIdentifier] = useState('');
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
  const selectedProjectAcronym = sourceProjects.find((project) => project.id === sourceProjectId)?.acronym ?? null;

  // The acronym belongs to the project and the rule only applies to days, and
  // both of those are chosen after the file is dropped. So the default title is
  // recomputed as they change rather than being set once when the file is read.
  useEffect(() => {
    if (titleEdited || !baseTitle) return;
    setTitle(
      buildDefaultTitle({
        baseTitle,
        type: (documentType || null) as DocumentType | null,
        acronym: selectedProjectAcronym,
        day: dayNumber,
      }),
    );
  }, [baseTitle, documentType, dayNumber, selectedProjectAcronym, titleEdited]);

  const processFile = useCallback((file: File) => {
    setOriginalFilename(file.name);
    const isYaml = getContentFormat(file.name) === 'YAML';

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // YAML documents often start with a `---` line, which would
      // be misread as frontmatter and stripped from the content — so skip it for YAML.
      const { data: frontmatter } = isYaml ? { data: {} as Record<string, unknown> } : parseFrontmatter(text);

      setContent(text);

      const extractedTitle = String(frontmatter.title || file.name.replace(/\.(md|ya?ml)$/i, ''));
      setBaseTitle(extractedTitle);
      setTitle(extractedTitle);
      // Deliberately from the file's own title, not the composed one: the slug
      // is the document URL and cannot be changed after creation, so it should
      // not carry the acronym and day prefix.
      setSlug(generateSlug(extractedTitle));
      // Frontmatter first, then a bare "13.md". The composed title needs the
      // number itself, which the `day13` label throws away.
      setDayNumber(parseDayNumber(frontmatter.day) ?? dayNumberFromFilename(file.name));
      setTitleEdited(false);
      setLabels(extractLabelsFromFrontmatter(frontmatter));
      if (isYaml) setDocumentType('ROOT_FILE');
      setMode('create');
    };
    reader.readAsText(file);
  }, []);

  const acceptFile = useCallback(
    (file: File | undefined, method: 'drag_drop' | 'browse') => {
      if (!file) return;
      if (!/\.(md|ya?ml)$/i.test(file.name)) {
        capture('document_upload_rejected', { reason: 'invalid_type' });
        toast.error(`"${file.name}" is not supported. Upload a .md, .yml or .yaml file.`);
        return;
      }
      capture('document_upload_started', { method });
      processFile(file);
    },
    [processFile],
  );

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
      acceptFile(e.dataTransfer.files[0], 'drag_drop');
    },
    [acceptFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0], 'browse');
  };

  const handleTitleChange = (value: string) => {
    setTitleEdited(true);
    setTitle(value);
    setSlug(generateSlug(value));
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.warning('Please enter a project name');
      return;
    }
    const identifier = newProjectIdentifier.trim();
    if (!identifier) {
      toast.warning('Please enter a project identifier');
      return;
    }
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      toast.warning('Identifier can only contain lowercase letters, numbers and single dashes');
      return;
    }

    setCreatingProject(true);
    try {
      const project = await createSourceProjectAction({
        name: newProjectName.trim(),
        identifier,
      });
      setSourceProjects([
        ...sourceProjects,
        { id: project.id, name: project.name, status: (project as unknown as { status: string }).status ?? 'ACTIVE' },
      ]);
      setSourceProjectId(project.id);
      setShowNewProjectInput(false);
      setNewProjectName('');
      setNewProjectIdentifier('');
      capture('source_project_created', { location: 'document_new' });
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error(error.message || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  // These inputs sit inside the document form, so Enter would otherwise submit
  // that instead of creating the project.
  const handleNewProjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleCreateProject();
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

      capture('document_created', { content_source: originalFilename ? 'upload' : 'manual' });

      router.push('/dashboard');
    } catch (error: any) {
      console.error('Error creating document:', error);
      toast.error(error.message || 'Failed to create document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="New Document" description="Upload a markdown or YAML file, or create a new document" />

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
                  <p className="text-lg font-medium mb-2">Drag and drop your markdown or YAML file here</p>
                  <p className="text-gray-600 mb-4">or</p>
                  <label>
                    <input type="file" accept=".md,.yml,.yaml" onChange={handleFileSelect} className="hidden" />
                    <Button type="button" variant="outline" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </label>
                  <p className="text-xs text-gray-500 mt-4">Supported files: .md, .yml, .yaml</p>
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
                          <Input
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Enter project name"
                            onKeyDown={handleNewProjectKeyDown}
                          />
                          <Input
                            value={newProjectIdentifier}
                            onChange={(e) => setNewProjectIdentifier(e.target.value)}
                            placeholder="e.g., exodus90, lent2026"
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            onKeyDown={handleNewProjectKeyDown}
                          />
                          <p className="text-xs text-gray-500">
                            The identifier is used in document URLs and as the folder name in the content repository.
                            Lowercase letters, numbers and dashes.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={handleCreateProject}
                              disabled={creatingProject || !newProjectName.trim() || !newProjectIdentifier.trim()}
                            >
                              {creatingProject ? 'Creating...' : 'Create'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setShowNewProjectInput(false);
                                setNewProjectName('');
                                setNewProjectIdentifier('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
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
