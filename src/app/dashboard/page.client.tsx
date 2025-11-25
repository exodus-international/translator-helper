'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from '@/components/ui/shadcn-io/kanban';
import { DOCUMENT_STATUS_CONFIGS } from '@/constants/document-status';
import { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import { getDashboardDocumentsAction } from '@/domain/document/document.actions';
import { SessionUser } from '@/lib/session';
import { DocumentStatus, Language } from '@prisma/client';
import { FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface DashboardClientProps {
  user: SessionUser;
  languages: Language[];
  translationProjects: any[];
  initialFilters: {
    language?: string;
    status?: string;
    translationProject?: string;
    search?: string;
  };
}

type KanbanCardData = {
  id: string;
  name: string;
  column: string;
  document: any;
  versionId?: string;
};

type KanbanColumn = {
  id: string;
  name: string;
  color: string;
  status?: DocumentStatus | null;
};

// Map statuses to columns
const getColumnForStatus = (status: DocumentStatus | null | undefined, hasVersion: boolean): string => {
  if (!hasVersion || !status) return 'pending';

  switch (status) {
    case DocumentStatus.PENDING_TRANSLATION:
      return 'pending';
    case DocumentStatus.IN_PROGRESS:
      return 'in-progress';
    case DocumentStatus.PENDING_REVIEW:
      return 'review';
    case DocumentStatus.APPROVED:
      return 'approved';
    case DocumentStatus.DEPLOYED:
      return 'deployed';
    default:
      return 'pending';
  }
};

const getStatusForColumn = (columnId: string): DocumentStatus | null => {
  switch (columnId) {
    case 'pending':
      return DocumentStatus.PENDING_TRANSLATION;
    case 'in-progress':
      return DocumentStatus.IN_PROGRESS;
    case 'review':
      return DocumentStatus.PENDING_REVIEW;
    case 'approved':
      return DocumentStatus.APPROVED;
    case 'deployed':
      return DocumentStatus.DEPLOYED;
    default:
      return null;
  }
};

export default function DashboardClient({
  user,
  languages,
  translationProjects,
  initialFilters,
}: DashboardClientProps) {
  const LANGUAGE_STORAGE_KEY = 'dashboard:selectedLanguage';
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialFilters.language || languages[0]?.id || '');
  const [selectedTranslationProject, setSelectedTranslationProject] = useState<string>(
    initialFilters.translationProject || 'all',
  );
  const [searchQuery, setSearchQuery] = useState<string>(initialFilters.search || '');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Get translation project ID from selected project
  const selectedTranslationProjectId = selectedTranslationProject !== 'all' ? selectedTranslationProject : undefined;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage && languages.some((lang) => lang.id === storedLanguage)) {
      setSelectedLanguage(storedLanguage);
    }
  }, [languages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedLanguage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [selectedLanguage]);

  // Get translation projects for the selected language
  const languageTranslationProjects = translationProjects.filter((tp) => tp.languageId === selectedLanguage);

  useEffect(() => {
    loadDocuments();
  }, [selectedLanguage, selectedTranslationProjectId]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await getDashboardDocumentsAction(selectedLanguage, selectedTranslationProjectId);
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredDocuments = documents.filter((doc) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(query) || doc.slug.toLowerCase().includes(query);
    }
    return true;
  });

  // Define Kanban columns based on active tab
  const columns: KanbanColumn[] = [
    {
      id: 'pending',
      name: 'To Do',
      color: DOCUMENT_STATUS_CONFIGS[DocumentStatus.PENDING_TRANSLATION].color.hex,
      status: DocumentStatus.PENDING_TRANSLATION,
    },
    {
      id: 'in-progress',
      name: 'In Progress',
      color: DOCUMENT_STATUS_CONFIGS[DocumentStatus.IN_PROGRESS].color.hex,
      status: DocumentStatus.IN_PROGRESS,
    },
    {
      id: 'review',
      name: 'Texts in review',
      color: DOCUMENT_STATUS_CONFIGS[DocumentStatus.PENDING_REVIEW].color.hex,
      status: DocumentStatus.PENDING_REVIEW,
    },
    {
      id: 'approved',
      name: 'Texts approved',
      color: DOCUMENT_STATUS_CONFIGS[DocumentStatus.APPROVED].color.hex,
      status: DocumentStatus.APPROVED,
    },
    {
      id: 'deployed',
      name: 'Texts deployed',
      color: DOCUMENT_STATUS_CONFIGS[DocumentStatus.DEPLOYED].color.hex,
      status: DocumentStatus.DEPLOYED,
    },
  ];

  const activeColumnIds = new Set(columns.map((column) => column.id));

  // Transform documents to Kanban card format
  const kanbanData: KanbanCardData[] = filteredDocuments
    .map((doc) => {
      const hasVersion = doc.versions && doc.versions.length > 0;
      const version = hasVersion ? doc.versions[0] : null;
      const status = version?.status || null;
      const column = getColumnForStatus(status, hasVersion);

      return {
        id: doc.id,
        name: doc.title,
        column,
        document: doc,
        versionId: version?.id,
      };
    })
    .filter((card) => activeColumnIds.has(card.column));

  // Handle drag and drop
  async function handleDataChange(newData: KanbanCardData[]) {
    // Find cards that changed columns
    for (const newCard of newData) {
      const oldCard = kanbanData.find((c) => c.id === newCard.id);
      if (oldCard && oldCard.column !== newCard.column) {
        const newStatus = getStatusForColumn(newCard.column);
        // Get version ID from the document
        const doc = newCard.document || oldCard.document;
        const hasVersion = doc.versions && doc.versions.length > 0;
        const versionId = hasVersion ? doc.versions[0].id : null;

        if (newStatus && versionId) {
          try {
            // Update document version status
            await updateDocumentVersionStatusAction(versionId, newStatus);
            // Reload documents to reflect changes
            await loadDocuments();
          } catch (error) {
            console.error('Error updating document status:', error);
            // Reload anyway to revert UI changes if update failed
            await loadDocuments();
          }
        }
      }
    }
  }

  const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold">Translation Dashboard</h1>
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
            <Link href="/documents/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </Link>
          </div>

          <div className="mt-4 flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.id} value={lang.id}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Select value={selectedTranslationProject} onValueChange={setSelectedTranslationProject}>
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All translation projects</SelectItem>
                  {languageTranslationProjects.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mt-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No documents found</p>
            </div>
          ) : (
            <div className="h-[calc(100vh-300px)]">
              <KanbanProvider columns={columns} data={kanbanData} onDataChange={handleDataChange}>
                {(column) => (
                  <KanbanBoard id={column.id} key={column.id}>
                    <KanbanHeader>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
                        <span>{column.name}</span>
                      </div>
                    </KanbanHeader>
                    <KanbanCards id={column.id}>
                      {(card: KanbanCardData) => {
                        const doc = card.document;
                        const hasVersion = doc.versions && doc.versions.length > 0;
                        const version = hasVersion ? doc.versions[0] : null;
                        const assignment = doc.assignments?.[0];
                        const language = version?.language || languages.find((l) => l.id === selectedLanguage);
                        const deadline = assignment?.deadline || doc.deadline;

                        const getDocumentUrl = () => {
                          if (
                            hasVersion &&
                            (version?.status === 'PENDING_TRANSLATION' || version?.status === 'IN_PROGRESS')
                          ) {
                            return `/documents/${doc.id}/translate?lang=${selectedLanguage}&version=${version.id}`;
                          }
                          if (hasVersion && version?.status === 'PENDING_REVIEW') {
                            return `/documents/${doc.id}/review?version=${version.id}`;
                          }
                          if (hasVersion) {
                            return `/documents/${doc.id}/review?version=${version.id}`;
                          }
                          return `/documents/${doc.id}/translate?lang=${selectedLanguage}`;
                        };

                        return (
                          <KanbanCard column={column.id} id={card.id} key={card.id} name={card.name}>
                            <Link
                              href={getDocumentUrl()}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Open document"
                            >
                              <div className="flex flex-col gap-2">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="m-0 flex-1 font-medium text-sm">{doc.title}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {(() => {
                                      // Helper function to check if user has the selected language
                                      const userHasLanguage = (user: any) => {
                                        if (!user?.languages) return false;
                                        return user.languages.some((ul: any) => ul.languageId === selectedLanguage);
                                      };

                                      // Filter users based on language preference
                                      const assignmentUser =
                                        assignment?.user && userHasLanguage(assignment.user) ? assignment.user : null;
                                      const versionUser =
                                        version?.user && userHasLanguage(version.user) ? version.user : null;
                                      const shouldShowVersionUser =
                                        versionUser && (!assignmentUser || versionUser.id !== assignmentUser.id);

                                      if (!assignmentUser && !shouldShowVersionUser) {
                                        return null;
                                      }

                                      return (
                                        <div className="flex items-center gap-1 -space-x-1">
                                          {assignmentUser && (
                                            <Avatar
                                              size="sm"
                                              name={assignmentUser.name || undefined}
                                              className="border-2 border-background"
                                              title={assignmentUser.name || undefined}
                                            >
                                              <AvatarFallback name={assignmentUser.name || undefined}>
                                                {assignmentUser.name
                                                  .split(' ')
                                                  .map((name: string) => name.charAt(0))
                                                  .join('')}
                                              </AvatarFallback>
                                            </Avatar>
                                          )}
                                          {shouldShowVersionUser && (
                                            <Avatar
                                              size="sm"
                                              name={versionUser.name || undefined}
                                              className="border-2 border-background"
                                              title={versionUser.name || undefined}
                                            >
                                              <AvatarFallback name={versionUser.name || undefined}>
                                                {versionUser.name
                                                  .split(' ')
                                                  .map((name: string) => name.charAt(0))
                                                  .join('')}
                                              </AvatarFallback>
                                            </Avatar>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1 items-center">
                                  {doc.sourceProject && (
                                    <Badge variant="secondary" size="xs">
                                      {doc.sourceProject.name}
                                    </Badge>
                                  )}
                                  {language && (
                                    <Badge variant="secondary" size="xs">
                                      {language.name}
                                    </Badge>
                                  )}
                                  {deadline && (
                                    <Badge variant="outline" size="xs">
                                      {shortDateFormatter.format(new Date(deadline))}
                                    </Badge>
                                  )}
                                  {version && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                      className="ml-auto"
                                    >
                                      {/* <StatusDropdown
                                      currentStatus={version.status}
                                      versionId={version.id}
                                      user={user}
                                      documentId={doc.id}
                                      languageId={selectedLanguage}
                                    /> */}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Link>
                          </KanbanCard>
                        );
                      }}
                    </KanbanCards>
                  </KanbanBoard>
                )}
              </KanbanProvider>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
