'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from '@/components/ui/shadcn-io/kanban';
import { DOCUMENT_STATUS_CONFIGS } from '@/constants/document-status';
import {
  createDocumentAssignmentAction,
  updateDocumentAssignmentAction,
} from '@/domain/document-assignment/document-assignment.actions';
import { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import { getDashboardDocumentsAction } from '@/domain/document/document.actions';
import { listProjectMembersAction } from '@/domain/project-member/project-member.actions';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { DocumentStatus, Language } from '@prisma/client';
import { FileCheck, FileText, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';

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

interface ProjectKanbanBoardProps {
  user: SessionUser;
  languages: Language[];
  selectedLanguage: string;
  sourceProjectId?: string;
  translationProjectId?: string | null;
}

export default function ProjectKanbanBoard({
  user,
  languages,
  selectedLanguage,
  sourceProjectId,
  translationProjectId,
}: ProjectKanbanBoardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDocId, setAssignDocId] = useState<string | null>(null);
  const [assignExistingId, setAssignExistingId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{ id: string; userId: string; user: { id: string; name: string | null; email: string } }[]>([]);

  const isDeployer = isDeployerClient(user);

  useEffect(() => {
    loadDocuments();
  }, [selectedLanguage, sourceProjectId]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await getDashboardDocumentsAction(selectedLanguage, sourceProjectId);
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (translationProjectId && isDeployer) {
      listProjectMembersAction(translationProjectId).then((members) => {
        const seen = new Map<string, typeof members[number]>();
        for (const m of members) {
          if (!seen.has(m.user.id)) seen.set(m.user.id, m);
        }
        setProjectMembers(Array.from(seen.values()));
      }).catch(console.error);
    }
  }, [translationProjectId, isDeployer]);

  function openAssignDialog(docId: string, existingAssignmentId: string | null) {
    setAssignDocId(docId);
    setAssignExistingId(existingAssignmentId);
    setAssignUserId('');
    setAssignDeadline('');
    setAssignDialogOpen(true);
  }

  async function handleAssign() {
    if (!assignDocId || !assignUserId || !translationProjectId) return;
    setAssignSaving(true);
    try {
      if (assignExistingId) {
        await updateDocumentAssignmentAction(assignExistingId, {
          userId: assignUserId,
          deadline: assignDeadline ? new Date(assignDeadline) : null,
        });
      } else {
        await createDocumentAssignmentAction({
          documentId: assignDocId,
          translationProjectId,
          userId: assignUserId,
          deadline: assignDeadline ? new Date(assignDeadline) : null,
        });
      }
      setAssignDialogOpen(false);
      await loadDocuments();
    } catch (error) {
      console.error('Error assigning translator:', error);
    } finally {
      setAssignSaving(false);
    }
  }

  const availableUsers = useMemo(() => {
    const userMap = new Map<string, { id: string; name: string; email: string }>();

    documents.forEach((doc) => {
      doc.assignments?.forEach((assignment: any) => {
        if (assignment?.user) {
          userMap.set(assignment.user.id, {
            id: assignment.user.id,
            name: assignment.user.name,
            email: assignment.user.email,
          });
        }
      });

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
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!doc.title.toLowerCase().includes(query) && !doc.slug.toLowerCase().includes(query)) {
        return false;
      }
    }

    if (selectedUser === 'all') {
      return true;
    }

    if (selectedUser === 'me') {
      const hasAssignment = doc.assignments?.some((assignment: any) => assignment?.user?.id === user.id);
      const hasVersion = doc.versions?.some((version: any) => version?.user?.id === user.id);
      return hasAssignment || hasVersion;
    }

    const hasAssignment = doc.assignments?.some((assignment: any) => assignment?.user?.id === selectedUser);
    const hasVersion = doc.versions?.some((version: any) => version?.user?.id === selectedUser);
    return hasAssignment || hasVersion;
  });

  const getDeployedTimestamp = (version: any): Date | null => {
    if (!version?.activityLogs || version.activityLogs.length === 0) {
      return null;
    }

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

  const deployedCards = allCards.filter((card) => card.column === 'deployed');
  const otherCards = allCards.filter((card) => card.column !== 'deployed');

  const sortedDeployedCards = deployedCards.sort((a, b) => {
    const aVersion = a.document.versions?.[0];
    const bVersion = b.document.versions?.[0];
    const aTimestamp = aVersion ? getDeployedTimestamp(aVersion) : null;
    const bTimestamp = bVersion ? getDeployedTimestamp(bVersion) : null;

    if (aTimestamp && bTimestamp) {
      return bTimestamp.getTime() - aTimestamp.getTime();
    }
    if (aTimestamp && !bTimestamp) return -1;
    if (!aTimestamp && bTimestamp) return 1;
    return 0;
  });

  const sortedOtherCards = otherCards.sort((a, b) => {
    const aName = a.name || a.document.title || '';
    const bName = b.name || b.document.title || '';
    return bName.localeCompare(aName, undefined, { sensitivity: 'base' });
  });

  const kanbanData: KanbanCardData[] = [...sortedDeployedCards, ...sortedOtherCards];

  async function handleDataChange(newData: KanbanCardData[]) {
    for (const newCard of newData) {
      const oldCard = kanbanData.find((c) => c.id === newCard.id);
      if (oldCard && oldCard.column !== newCard.column) {
        const newStatus = getStatusForColumn(newCard.column);
        const doc = newCard.document || oldCard.document;
        const hasVersion = doc.versions && doc.versions.length > 0;
        const versionId = hasVersion ? doc.versions[0].id : null;

        if (newStatus && versionId) {
          try {
            await updateDocumentVersionStatusAction(versionId, newStatus);
            await loadDocuments();
          } catch (error) {
            console.error('Error updating document status:', error);
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
    <div>
      <div className="flex gap-4 items-center mb-4">
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
        <div className="flex gap-4 items-center text-sm text-gray-600">
          <span>Filters:</span>
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

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No documents found</p>
        </div>
      ) : (
        <div className="h-[calc(100vh-350px)]">
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

                    const cardsInColumn = kanbanData.filter((c) => c.column === column.id);
                    const cardIndexInColumn = cardsInColumn.findIndex((c) => c.id === card.id);
                    const prevCardInColumn = cardIndexInColumn > 0 ? cardsInColumn[cardIndexInColumn - 1] : null;
                    const prevCardHasLabel =
                      prevCardInColumn &&
                      prevCardInColumn.document.versions?.[0]?.status === DocumentStatus.PENDING_REVIEW &&
                      prevCardInColumn.document.labels?.includes('Waiting for final label');
                    const shouldShowSeparator = hasWaitingForFinalLabel && !prevCardHasLabel && prevCardInColumn;

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
                                    // Show relevant user based on document status
                                    const translator = version?.user;
                                    const reviewer = version?.reviewer;
                                    const isUnassigned = !assignment?.userId && !translator;

                                    // For PENDING_REVIEW: show reviewer
                                    // For IN_PROGRESS: show translator
                                    // For APPROVED/DEPLOYED: show both
                                    const usersToShow: { name: string; id: string }[] = [];

                                    if (version?.status === DocumentStatus.PENDING_REVIEW && reviewer) {
                                      usersToShow.push(reviewer);
                                    } else if (version?.status === DocumentStatus.IN_PROGRESS && translator) {
                                      usersToShow.push(translator);
                                    } else {
                                      if (translator) usersToShow.push(translator);
                                      if (reviewer && reviewer.id !== translator?.id) usersToShow.push(reviewer);
                                    }

                                    const canReassign = isDeployer && translationProjectId &&
                                      (!version?.status || version?.status === DocumentStatus.PENDING_TRANSLATION);

                                    if (isUnassigned && canReassign) {
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openAssignDialog(doc.id, assignment?.id || null);
                                          }}
                                          className="h-6 w-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-gray-400 hover:bg-gray-50 transition-colors"
                                          title="Assign translator"
                                        >
                                          <UserPlus className="h-3 w-3 text-gray-400" />
                                        </button>
                                      );
                                    }

                                    if (usersToShow.length === 0) return null;

                                    if (canReassign) {
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openAssignDialog(doc.id, assignment?.id || null);
                                          }}
                                          className="flex items-center gap-1 -space-x-1 cursor-pointer hover:opacity-70 transition-opacity"
                                          title="Reassign translator"
                                        >
                                          {usersToShow.map((u) => (
                                            <Avatar
                                              key={u.id}
                                              size="sm"
                                              name={u.name || undefined}
                                              className="border-2 border-background"
                                              title={u.name || undefined}
                                            >
                                              <AvatarFallback name={u.name || undefined}>
                                                {u.name
                                                  .split(' ')
                                                  .map((name: string) => name.charAt(0))
                                                  .join('')}
                                              </AvatarFallback>
                                            </Avatar>
                                          ))}
                                        </button>
                                      );
                                    }

                                    return (
                                      <div className="flex items-center gap-1 -space-x-1">
                                        {usersToShow.map((u) => (
                                          <Avatar
                                            key={u.id}
                                            size="sm"
                                            name={u.name || undefined}
                                            className="border-2 border-background"
                                            title={u.name || undefined}
                                          >
                                            <AvatarFallback name={u.name || undefined}>
                                              {u.name
                                                .split(' ')
                                                .map((name: string) => name.charAt(0))
                                                .join('')}
                                            </AvatarFallback>
                                          </Avatar>
                                        ))}
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

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Translator</DialogTitle>
            <DialogDescription>Select a team member to assign to this document.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Translator</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select translator..." />
                </SelectTrigger>
                <SelectContent>
                  {projectMembers.map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>
                      {m.user.name || m.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Deadline (optional)</Label>
              <Input
                type="date"
                value={assignDeadline}
                onChange={(e) => setAssignDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assignUserId || assignSaving}>
              {assignSaving ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
