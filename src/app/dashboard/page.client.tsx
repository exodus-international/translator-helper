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
import { FileCheck, FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

interface DashboardClientProps {
  user: SessionUser;
  languages: Language[];
  translationProjects: any[];
  initialFilters: {
    language?: string;
    status?: string;
    sourceProject?: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const LANGUAGE_STORAGE_KEY = 'dashboard:selectedLanguage';

  // Initialize from URL searchParams as fallback if initialFilters doesn't have it
  const urlSourceProject = searchParams.get('sourceProject');
  const initialSourceProject = initialFilters.sourceProject || urlSourceProject || 'all';

  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialFilters.language || languages[0]?.id || '');
  const [selectedSourceProject, setSelectedSourceProject] = useState<string>(initialSourceProject);
  const isInitialMount = useRef(true);

  const [searchQuery, setSearchQuery] = useState<string>(initialFilters.search || '');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Get source project ID from selected project
  const selectedSourceProjectId = selectedSourceProject !== 'all' ? selectedSourceProject : undefined;

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

  // Sync source project selection to URL (skip on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const currentUrlValue = params.get('sourceProject');

    // Only update if the value actually changed
    if (selectedSourceProject && selectedSourceProject !== 'all') {
      if (currentUrlValue !== selectedSourceProject) {
        params.set('sourceProject', selectedSourceProject);
        const newUrl = `/dashboard?${params.toString()}`;
        router.replace(newUrl, { scroll: false });
      }
    } else {
      if (currentUrlValue) {
        params.delete('sourceProject');
        const newUrl = `/dashboard?${params.toString()}`;
        router.replace(newUrl, { scroll: false });
      }
    }
  }, [selectedSourceProject, router, searchParams]);

  // Get unique source projects that the user has access to (through any translation project)
  // This shows all source projects the user can access, regardless of the selected language
  const languageSourceProjects = useMemo(() => {
    const sourceProjectsMap = new Map();
    translationProjects.forEach((tp) => {
      if (tp.sourceProject && !sourceProjectsMap.has(tp.sourceProject.id)) {
        sourceProjectsMap.set(tp.sourceProject.id, tp.sourceProject);
      }
    });
    return Array.from(sourceProjectsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [translationProjects, selectedLanguage]);

  useEffect(() => {
    loadDocuments();
  }, [selectedLanguage, selectedSourceProjectId]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await getDashboardDocumentsAction(selectedLanguage, selectedSourceProjectId);
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  }

  // Extract unique users from documents (from assignments and versions)
  const availableUsers = useMemo(() => {
    const userMap = new Map<string, { id: string; name: string; email: string }>();

    documents.forEach((doc) => {
      // Add users from assignments
      doc.assignments?.forEach((assignment: any) => {
        if (assignment?.user) {
          userMap.set(assignment.user.id, {
            id: assignment.user.id,
            name: assignment.user.name,
            email: assignment.user.email,
          });
        }
      });

      // Add users from versions
      doc.versions?.forEach((version: any) => {
        if (version?.user) {
          userMap.set(version.user.id, {
            id: version.user.id,
            name: version.user.name,
            email: version.user.email,
          });
        }
      });
    });

    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const filteredDocuments = documents.filter((doc) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!doc.title.toLowerCase().includes(query) && !doc.slug.toLowerCase().includes(query)) {
        return false;
      }
    }

    // User filter
    if (selectedUser === 'all') {
      return true;
    }

    if (selectedUser === 'me') {
      // Check if current user is in assignments or versions
      const hasAssignment = doc.assignments?.some((assignment: any) => assignment?.user?.id === user.id);
      const hasVersion = doc.versions?.some((version: any) => version?.user?.id === user.id);
      return hasAssignment || hasVersion;
    }

    // Filter by specific user
    const hasAssignment = doc.assignments?.some((assignment: any) => assignment?.user?.id === selectedUser);
    const hasVersion = doc.versions?.some((version: any) => version?.user?.id === selectedUser);
    return hasAssignment || hasVersion;
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

  // Helper function to get deployed timestamp from activity logs
  const getDeployedTimestamp = (version: any): Date | null => {
    if (!version?.activityLogs || version.activityLogs.length === 0) {
      return null;
    }

    // Find the first activity log entry where:
    // 1. action is "deployed", OR
    // 2. action is "status_updated" and details.status is "DEPLOYED"
    for (const log of version.activityLogs) {
      if (log.action === 'deployed') {
        return new Date(log.createdAt);
      }
      if (log.action === 'status_updated' && log.details) {
        const details = log.details as { status?: string };
        if (details.status === 'DEPLOYED') {
          return new Date(log.createdAt);
        }
      }
    }

    return null;
  };

  // Transform documents to Kanban card format
  const allCards: KanbanCardData[] = filteredDocuments
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

  // Separate cards by column
  const deployedCards = allCards.filter((card) => card.column === 'deployed');
  const otherCards = allCards.filter((card) => card.column !== 'deployed');

  // Sort deployed cards by deployed timestamp (newest first)
  const sortedDeployedCards = deployedCards.sort((a, b) => {
    const aVersion = a.document.versions?.[0];
    const bVersion = b.document.versions?.[0];
    const aTimestamp = aVersion ? getDeployedTimestamp(aVersion) : null;
    const bTimestamp = bVersion ? getDeployedTimestamp(bVersion) : null;

    // If both have timestamps, sort by timestamp (newest first)
    if (aTimestamp && bTimestamp) {
      return bTimestamp.getTime() - aTimestamp.getTime();
    }
    // If only one has timestamp, prioritize it
    if (aTimestamp && !bTimestamp) {
      return -1;
    }
    if (!aTimestamp && bTimestamp) {
      return 1;
    }
    // If neither has timestamp, maintain original order
    return 0;
  });

  // Sort other cards alphabetically Z-A by name
  const sortedOtherCards = otherCards.sort((a, b) => {
    const aName = a.name || a.document.title || '';
    const bName = b.name || b.document.title || '';
    return bName.localeCompare(aName, undefined, { sensitivity: 'base' });
  });

  // Combine: deployed cards (sorted by timestamp) + other cards (sorted Z-A)
  const kanbanData: KanbanCardData[] = [...sortedDeployedCards, ...sortedOtherCards];

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
            <div className="flex gap-4 items-center justify-end text-sm text-gray-600 ml-32">
              <div className="flex gap-4 items-center justify-end">Filters:</div>
              <div className="justify-end flex">
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
              <div className="justify-end flex">
                <Select value={selectedSourceProject} onValueChange={setSelectedSourceProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All source projects</SelectItem>
                    {languageSourceProjects.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="justify-end flex">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <SelectValue placeholder="All users" className="[&_div]:hidden! [&_span:last-child]:inline!" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="me">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm" name={user.name || undefined} className="pointer-events-none">
                          <AvatarFallback name={user.name || undefined}>
                            {user.name
                              .split(' ')
                              .map((name) => name.charAt(0))
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span>Me</span>
                      </div>
                    </SelectItem>
                    {availableUsers
                      .filter((u) => u.id !== user.id)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" name={u.name || undefined} className="pointer-events-none">
                              <AvatarFallback name={u.name || undefined}>
                                {u.name
                                  .split(' ')
                                  .map((name) => name.charAt(0))
                                  .join('')}
                              </AvatarFallback>
                            </Avatar>
                            <span>{u.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
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
                        const hasWaitingForFinalLabel =
                          version?.status === DocumentStatus.PENDING_REVIEW &&
                          doc.labels?.includes('Waiting for final label');

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

                        // Get all cards in this column to check previous card
                        const cardsInColumn = kanbanData.filter((c) => c.column === column.id);
                        const cardIndexInColumn = cardsInColumn.findIndex((c) => c.id === card.id);
                        const prevCardInColumn = cardIndexInColumn > 0 ? cardsInColumn[cardIndexInColumn - 1] : null;
                        const prevCardHasLabel =
                          prevCardInColumn &&
                          prevCardInColumn.document.versions?.[0]?.status === DocumentStatus.PENDING_REVIEW &&
                          prevCardInColumn.document.labels?.includes('Waiting for final label');
                        const shouldShowSeparator = hasWaitingForFinalLabel && !prevCardHasLabel && prevCardInColumn;

                        // Get open suggestions count for this document
                        const openSuggestionsCount = version ? (version as any).openSuggestionsCount ?? 0 : 0;

                        return (
                          <Fragment key={card.id}>
                            {shouldShowSeparator && (
                              <div key={`${card.id}__separator`} className="border-t-2 border-gray-300 my-2" />
                            )}
                            <KanbanCard
                              column={column.id}
                              id={card.id}
                              name={card.name}
                              className={hasWaitingForFinalLabel ? 'bg-green-50/50 border-green-800/40' : ''}
                            >
                              <Link
                                href={getDocumentUrl()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="hover:text-muted-foreground transition-colors"
                                title="Open document"
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    {hasWaitingForFinalLabel && <FileCheck className="h-4 w-4" />}
                                    <p className="m-0 flex-1 font-medium text-sm">{doc.title}</p>
                                    {openSuggestionsCount > 0 && (
                                      <Badge variant="primary" size="xs" className="shrink-0">
                                        {openSuggestionsCount}
                                      </Badge>
                                    )}
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
                          </Fragment>
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
