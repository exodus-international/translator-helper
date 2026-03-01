'use client';

import ProjectCard from '@/components/project-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_STATUS_CONFIGS } from '@/constants/document-status';
import { createSourceProjectAction } from '@/domain/source-project/source-project.actions';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus } from '@prisma/client';
import { ArrowRight, ClipboardList, Eye, FolderOpen, Plus, Rocket, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

type VersionWithDetails = {
  id: string;
  status: DocumentStatus;
  updatedAt: string | Date;
  document: {
    id: string;
    title: string;
    slug: string;
    sourceProject: {
      id: string;
      name: string;
    } | null;
  };
  language: {
    id: string;
    name: string;
    code: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  reviewer: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

interface DashboardClientProps {
  user: SessionUser;
  projects: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    _count: {
      documents: number;
      translationProjects: number;
    };
    translationProjects: {
      id: string;
      languageId: string;
      language: {
        id: string;
        name: string;
        code: string;
      };
      _count: {
        members: number;
      };
    }[];
  }[];
  assignments: {
    id: string;
    documentId: string;
    deadline: string | Date | null;
    document: {
      id: string;
      title: string;
      slug: string;
      sourceProject: {
        id: string;
        name: string;
      } | null;
      versions: {
        id: string;
        status: DocumentStatus;
        languageId: string;
        language: {
          id: string;
          name: string;
          code: string;
        };
      }[];
    };
    translationProject: {
      id: string;
      language: {
        id: string;
        name: string;
        code: string;
      };
      sourceProject: {
        id: string;
        name: string;
      };
    };
  }[];
  approvedVersions: VersionWithDetails[];
  reviewAssignments: VersionWithDetails[];
  translatingVersions: VersionWithDetails[];
}

function getDocumentUrl(assignment: DashboardClientProps['assignments'][number]): string {
  const doc = assignment.document;
  const langId = assignment.translationProject.language.id;
  const version = doc.versions.find((v) => v.languageId === langId);

  if (!version) {
    return `/documents/${doc.id}/translate?lang=${langId}`;
  }

  if (version.status === DocumentStatus.PENDING_TRANSLATION || version.status === DocumentStatus.IN_PROGRESS) {
    return `/documents/${doc.id}/translate?lang=${langId}&version=${version.id}`;
  }

  return `/documents/${doc.id}/review?version=${version.id}`;
}

function getVersionStatus(assignment: DashboardClientProps['assignments'][number]): DocumentStatus | null {
  const langId = assignment.translationProject.language.id;
  const version = assignment.document.versions.find((v) => v.languageId === langId);
  return version?.status || null;
}

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function getVersionUrl(version: VersionWithDetails): string {
  if (version.status === DocumentStatus.PENDING_TRANSLATION || version.status === DocumentStatus.IN_PROGRESS) {
    return `/documents/${version.document.id}/translate?lang=${version.language.id}&version=${version.id}`;
  }
  return `/documents/${version.document.id}/review?version=${version.id}`;
}

type WorkItem = {
  key: string;
  documentId: string;
  documentTitle: string;
  projectName: string | null;
  languageName: string;
  role: 'Translator' | 'Reviewer';
  status: DocumentStatus | null;
  deadline: Date | string | null;
  url: string;
  translatorName: string | null;
  reviewerName: string | null;
};

function buildWorkItems(
  translatingVersions: VersionWithDetails[],
  reviewAssignments: VersionWithDetails[],
  assignments: DashboardClientProps['assignments'],
): WorkItem[] {
  const itemMap = new Map<string, WorkItem>();

  // 1. Add translating versions as Translator entries
  for (const v of translatingVersions) {
    const key = `${v.document.id}:${v.language.id}`;
    itemMap.set(key, {
      key,
      documentId: v.document.id,
      documentTitle: v.document.title,
      projectName: v.document.sourceProject?.name ?? null,
      languageName: v.language.name,
      role: 'Translator',
      status: v.status,
      deadline: null,
      url: getVersionUrl(v),
      translatorName: v.user?.name ?? null,
      reviewerName: v.reviewer?.name ?? null,
    });
  }

  // 2. Add review assignments as Reviewer entries
  for (const v of reviewAssignments) {
    const key = `${v.document.id}:${v.language.id}:reviewer`;
    itemMap.set(key, {
      key,
      documentId: v.document.id,
      documentTitle: v.document.title,
      projectName: v.document.sourceProject?.name ?? null,
      languageName: v.language.name,
      role: 'Reviewer',
      status: v.status,
      deadline: null,
      url: `/documents/${v.document.id}/review?version=${v.id}`,
      translatorName: v.user?.name ?? null,
      reviewerName: v.reviewer?.name ?? null,
    });
  }

  // 3. Merge assignments — enrich existing or add new
  for (const a of assignments) {
    const langId = a.translationProject.language.id;
    const key = `${a.document.id}:${langId}`;
    const existing = itemMap.get(key);

    if (existing) {
      // Enrich with deadline from assignment
      existing.deadline = a.deadline;
    } else {
      // Not yet present — add as new translator entry
      const version = a.document.versions.find((v) => v.languageId === langId);
      const status = version?.status ?? null;
      const url = getDocumentUrl(a);

      itemMap.set(key, {
        key,
        documentId: a.document.id,
        documentTitle: a.document.title,
        projectName: a.translationProject.sourceProject?.name ?? null,
        languageName: a.translationProject.language.name,
        role: 'Translator',
        status,
        deadline: a.deadline,
        url,
        translatorName: null,
        reviewerName: null,
      });
    }
  }

  // Sort: deadline first (earliest), then nulls last
  return Array.from(itemMap.values()).sort((a, b) => {
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

const headClass = 'text-[11px] uppercase tracking-wider text-muted-foreground font-medium';

export default function DashboardClient({
  user,
  projects,
  assignments,
  approvedVersions,
  reviewAssignments,
  translatingVersions,
}: DashboardClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [deployLanguageFilter, setDeployLanguageFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dashboard:deployLanguageFilter') || 'all';
    }
    return 'all';
  });

  const handleDeployLanguageFilterChange = (value: string) => {
    setDeployLanguageFilter(value);
    localStorage.setItem('dashboard:deployLanguageFilter', value);
  };
  const workItems = useMemo(
    () => buildWorkItems(translatingVersions, reviewAssignments, assignments),
    [translatingVersions, reviewAssignments, assignments],
  );

  const deployLanguages = useMemo(() => {
    const langMap = new Map<string, string>();
    for (const v of approvedVersions) {
      langMap.set(v.language.id, v.language.name);
    }
    return Array.from(langMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [approvedVersions]);

  const filteredApprovedVersions = useMemo(() => {
    if (deployLanguageFilter === 'all') return approvedVersions;
    return approvedVersions.filter((v) => v.language.id === deployLanguageFilter);
  }, [approvedVersions, deployLanguageFilter]);

  // Create project dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectIdentifier, setNewProjectIdentifier] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      await createSourceProjectAction({
        name: newProjectName,
        description: newProjectDescription || null,
        identifier: newProjectIdentifier || null,
      });
      toast.success('Project created');
      setCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectIdentifier('');
      router.refresh();
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error(error.message || 'Failed to create project');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredProjects = projects.filter((project) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      (project.description && project.description.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar size="sm" name={user.name || undefined}>
                    <AvatarFallback name={user.name || undefined}>
                      {user.name
                        .split(' ')
                        .map((name) => name.charAt(0))
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-gray-600">Welcome back, {user.name}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-8">
        {/* Projects section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">My Projects</h2>
            {isDeployerClient(user) && (
              <Dialog open={createDialogOpen} onOpenChange={(open) => {
                setCreateDialogOpen(open);
                if (!open) {
                  setNewProjectName('');
                  setNewProjectDescription('');
                  setNewProjectIdentifier('');
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateProject} className="space-y-4">
                    <div>
                      <Label htmlFor="new-project-name">Project Name *</Label>
                      <Input
                        id="new-project-name"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g., Exodus90, Daily Readings"
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-project-description">Description</Label>
                      <Textarea
                        id="new-project-description"
                        value={newProjectDescription}
                        onChange={(e) => setNewProjectDescription(e.target.value)}
                        placeholder="Optional description of the project"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-project-identifier">Repository Identifier</Label>
                      <Input
                        id="new-project-identifier"
                        value={newProjectIdentifier}
                        onChange={(e) => setNewProjectIdentifier(e.target.value)}
                        placeholder="e.g., exodus90, lent2026"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">GITHUB: Folder name in the content repository</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createLoading || !newProjectName.trim()}>
                        {createLoading ? 'Creating...' : 'Create Project'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">{searchQuery ? 'No projects match your search' : 'No projects available'}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>

        {/* Waiting for Deploy section - deployers only */}
        {isDeployerClient(user) && approvedVersions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Waiting for Deploy
                <Badge variant="secondary" size="sm" className="ml-2">
                  {filteredApprovedVersions.length}
                </Badge>
              </h2>
              {deployLanguages.length > 1 && (
                <Select value={deployLanguageFilter} onValueChange={handleDeployLanguageFilterChange}>
                  <SelectTrigger className="w-[180px] h-8 text-sm">
                    <SelectValue placeholder="All languages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All languages</SelectItem>
                    {deployLanguages.map((lang) => (
                      <SelectItem key={lang.id} value={lang.id}>{lang.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Card>
              <Table>
                <TableHeader>
                  {/* <TableRow> */}
                  <TableHead className={headClass}>Document</TableHead>
                  <TableHead className={headClass}>Project</TableHead>
                  <TableHead className={headClass}>Language</TableHead>
                  <TableHead className={headClass}>Translator</TableHead>
                  <TableHead className={headClass}>Reviewer</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                  <TableHead className="w-[60px]" />
                  {/* </TableRow> */}
                </TableHeader>
                <TableBody>
                  {filteredApprovedVersions.map((version) => {
                    const url = `/documents/${version.document.id}/review?version=${version.id}`;
                    const statusConfig = DOCUMENT_STATUS_CONFIGS[version.status];
                    return (
                      <TableRow key={version.id} className="group cursor-pointer" onClick={() => router.push(url)}>
                        <TableCell>
                          <span className="font-medium text-sm">{version.document.title}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {version.document.sourceProject?.name ?? '\u2014'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{version.language.name}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{version.user?.name ?? '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{version.reviewer?.name ?? '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 ${statusConfig.color.badgeClass}`}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: statusConfig.color.hex }}
                            />
                            {statusConfig.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link href={url} onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </section>
        )}

        {/* My Work section - unified view of translations, reviews, and assignments */}
        <section>
          <h2 className="text-lg font-semibold mb-4">
            My Work
            {workItems.length > 0 && (
              <Badge variant="secondary" size="sm" className="ml-2">
                {workItems.length}
              </Badge>
            )}
          </h2>
          {workItems.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No active work assigned to you</p>
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  {/* <TableRow> */}
                  <TableHead className={headClass}>Document</TableHead>
                  <TableHead className={headClass}>Project</TableHead>
                  <TableHead className={headClass}>Language</TableHead>
                  <TableHead className={headClass}>Translator</TableHead>
                  <TableHead className={headClass}>Reviewer</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                  <TableHead className={headClass}>Deadline</TableHead>
                  <TableHead className="w-[60px]" />
                  {/* </TableRow> */}
                </TableHeader>
                <TableBody>
                  {workItems.map((item) => {
                    const statusConfig = item.status ? DOCUMENT_STATUS_CONFIGS[item.status] : null;

                    return (
                      <TableRow key={item.key} className="group cursor-pointer" onClick={() => router.push(item.url)}>
                        <TableCell>
                          <span className="font-medium text-sm">{item.documentTitle}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{item.projectName ?? '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{item.languageName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{item.translatorName ?? '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{item.reviewerName ?? '\u2014'}</span>
                        </TableCell>
                        <TableCell>
                          {statusConfig ? (
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 ${statusConfig.color.badgeClass}`}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: statusConfig.color.hex }}
                              />
                              {statusConfig.name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 border border-gray-200 bg-gray-50 text-gray-500">
                              Not started
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.deadline ? (
                            <span className="text-sm text-muted-foreground">
                              {shortDateFormatter.format(new Date(item.deadline))}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">{'\u2014'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={item.url} onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {item.role === 'Reviewer' ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <ArrowRight className="h-4 w-4" />
                              )}
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
