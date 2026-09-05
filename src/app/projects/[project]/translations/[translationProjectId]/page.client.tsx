'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { VersionAssignment } from '@/domain/document-version/document-version.repository';
import type { DocumentList } from '@/domain/document/document.repository';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignTranslatorToVersionAction } from '@/domain/document-version/document-version.actions';
import { removeLanguageMemberAction, setLanguageMemberRoleAction } from '@/domain/user-language/user-language.actions';
import { capture } from '@/lib/analytics';
import { Prisma } from '@/generated/prisma/client';
import { ProjectRole } from '@/generated/prisma/enums';
import { Calendar, FileText, Plus, Trash2, User, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { buildProjectTranslationsPath } from '@/domain/source-project/source-project-url';

interface TranslationProjectClientProps {
  translationProject: Prisma.TranslationProjectGetPayload<{
    include: {
      language: true;
      sourceProject: true;
    };
  }>;
  /** The language team: one role per user, shared by every project in this language. */
  members: Prisma.UserLanguageGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>[];
  /** One version per document in this project's language; assignment lives on it. */
  versions: VersionAssignment[];
  documents: DocumentList[];
  users: Prisma.UserGetPayload<{
    include: {
      languages: {
        include: {
          language: true;
        };
      };
    };
  }>[];
}

const UNASSIGNED_VALUE = '__unassigned__';

const ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: 'Project Manager',
  REVIEWER: 'Reviewer',
  EDITOR: 'Editor',
  TRANSLATOR: 'Translator',
};

export default function TranslationProjectClient({
  translationProject,
  members: initialMembers,
  versions: initialVersions,
  documents,
  users,
}: TranslationProjectClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [versions, setVersions] = useState(initialVersions);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>(ProjectRole.TRANSLATOR);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);

  const upsertMemberRole = async (userId: string, role: ProjectRole) => {
    setLoading(true);
    try {
      const { language: _language, ...member } = await setLanguageMemberRoleAction({
        translationProjectId: translationProject.id,
        userId,
        role,
      });
      setMembers([...members.filter((m) => m.userId !== userId), member as (typeof members)[0]]);
      router.refresh();
      return true;
    } catch (error: any) {
      console.error('Error saving member role:', error);
      // Handle validation errors - server will check if user exists
      if (error?.issues) {
        const errorMessages = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
        toast.error(`Error: ${errorMessages}`);
      } else {
        toast.error(error?.message || 'Failed to save role. The user may not exist.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || selectedUserId.trim() === '') {
      toast.warning('Please select a user');
      return;
    }

    if (await upsertMemberRole(selectedUserId, selectedRole)) {
      capture('language_member_added', { role: selectedRole });
      setMemberDialogOpen(false);
      resetMemberForm();
    }
  };

  const handleChangeRole = async (userId: string, role: ProjectRole) => {
    if (await upsertMemberRole(userId, role)) {
      capture('language_member_role_changed', { role });
      toast.success('Role updated successfully');
    }
  };

  const handleRemoveUserFromLanguage = async (userId: string) => {
    setLoading(true);
    try {
      await removeLanguageMemberAction(userId, translationProject.id);
      setMembers(members.filter((m) => m.userId !== userId));
      capture('language_member_removed');
      router.refresh();
      toast.success(`User removed from the ${translationProject.language.name} team`);
    } catch (error: any) {
      console.error('Error removing user from language team:', error);
      toast.error(error.message || 'Failed to remove user from the language team');
    } finally {
      setLoading(false);
    }
  };

  /** Sets or clears the translator on a document's version in this language. */
  const saveAssignment = async (documentId: string, userId: string | null, versionDeadline: Date | null) => {
    const saved = await assignTranslatorToVersionAction({
      documentId,
      translationProjectId: translationProject.id,
      userId,
      deadline: versionDeadline,
    });
    setVersions((current) => {
      const next = current.filter((v) => v.documentId !== documentId);
      return [...next, saved as (typeof current)[0]];
    });
    router.refresh();
  };

  const handleAssignDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await saveAssignment(selectedDocumentId, selectedAssigneeId || null, deadline ? new Date(deadline) : null);
      capture('document_assigned', { context: 'translation_project' });
      setAssignmentDialogOpen(false);
      resetAssignmentForm();
      toast.success('Document assigned!');
    } catch (error: any) {
      console.error('Error assigning document:', error);
      toast.error(error.message || 'Failed to assign document');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clears the translator and deadline. The version itself stays — it holds the
   * translation, and every document in the language has one.
   */
  const handleClearAssignment = async (documentId: string) => {
    setLoading(true);
    try {
      await saveAssignment(documentId, null, null);
      capture('document_assignment_removed');
      toast.success('Assignment cleared');
    } catch (error: any) {
      console.error('Error clearing assignment:', error);
      toast.error(error.message || 'Failed to clear assignment');
    } finally {
      setLoading(false);
    }
  };

  const resetMemberForm = () => {
    setSelectedUserId('');
    setSelectedRole(ProjectRole.TRANSLATOR);
  };

  const resetAssignmentForm = () => {
    setSelectedDocumentId('');
    setSelectedAssigneeId(null);
    setDeadline('');
  };

  // Every document can be assigned; the dialog offers those without a translator.
  const versionByDocumentId = new Map(versions.map((version) => [version.documentId, version]));
  const unassignedDocuments = documents.filter((doc) => !versionByDocumentId.get(doc.id)?.userId);

  // One membership row per user, sorted for display
  const sortedMembers = [...members].sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''));
  const memberUserIds = new Set(members.map((m) => m.userId));

  // Get users that are not yet on the language team
  const availableUsers = users
    .filter((user) => !memberUserIds.has(user.id))
    .sort((a, b) => {
      const projectLanguageCode = translationProject.language.code;
      const aHasLanguage = a.languages.some((ul) => ul.language.code === projectLanguageCode);
      const bHasLanguage = b.languages.some((ul) => ul.language.code === projectLanguageCode);

      // Users with the project language come first
      if (aHasLanguage && !bHasLanguage) return -1;
      if (!aHasLanguage && bHasLanguage) return 1;

      // If both have or both don't have the language, sort alphabetically by name
      return (a.name || '').localeCompare(b.name || '');
    });

  const assignedVersions = versions.filter((version) => version.userId);
  const unassignedVersions = versions.filter((version) => !version.userId);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        back={{
          href: buildProjectTranslationsPath(translationProject.sourceProject.identifier),
          label: 'Back to Translations',
        }}
        title={translationProject.name}
        description={`${translationProject.language.name} (${translationProject.language.code})`}
      />

      <div className="container mx-auto px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Members Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                {translationProject.language.name} Team
              </h2>
              <Dialog
                open={memberDialogOpen}
                onOpenChange={(open) => {
                  setMemberDialogOpen(open);
                  if (!open) resetMemberForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add {translationProject.language.name} Team Member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddMember} className="space-y-4">
                    <div>
                      <Label htmlFor="user">User *</Label>
                      <Select
                        value={selectedUserId || undefined}
                        onValueChange={(userId) => {
                          if (userId && userId.trim() !== '') {
                            setSelectedUserId(userId);
                          }
                        }}
                        required
                        disabled={availableUsers.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={availableUsers.length === 0 ? 'No users available' : 'Select a user'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUsers.length > 0 ? (
                            availableUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name} ({user.email}) - {user.languages.map((l) => l.language.code).join(', ')}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-center text-sm text-muted-foreground">
                              No users available to add
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="role">Role *</Label>
                      <Select value={selectedRole} onValueChange={(role) => setSelectedRole(role as ProjectRole)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Grants this role on every {translationProject.language.name} translation project.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setMemberDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={loading || !selectedUserId}>
                        {loading ? 'Adding...' : 'Add Member'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <p className="text-sm text-gray-500 mb-2">
              These members work on every {translationProject.language.name} translation project.
            </p>
            <div className="space-y-2">
              {sortedMembers.map((member) => (
                <Card key={member.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{member.user.name}</div>
                      <div className="text-sm text-gray-600">{member.user.email}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleChangeRole(member.userId, value as ProjectRole)}
                          disabled={loading}
                        >
                          <SelectTrigger className="h-6 w-auto border-dashed">
                            <SelectValue placeholder="Change role" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={loading} className="ml-4">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove from {translationProject.language.name} Team</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove {member.user.name} from the{' '}
                            {translationProject.language.name} team? This removes their access to every{' '}
                            {translationProject.language.name} translation project, not just this one.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemoveUserFromLanguage(member.userId)}>
                            Remove from Team
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              ))}
              {sortedMembers.length === 0 && (
                <Card className="p-6 text-center">
                  <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No members yet. Add one to get started.</p>
                </Card>
              )}
            </div>
          </div>

          {/* Document Assignments Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Assignments
              </h2>
              <Dialog
                open={assignmentDialogOpen}
                onOpenChange={(open) => {
                  setAssignmentDialogOpen(open);
                  if (!open) resetAssignmentForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" disabled={unassignedDocuments.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Document
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Document</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAssignDocument} className="space-y-4">
                    <div>
                      <Label htmlFor="document">Document *</Label>
                      <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a document" />
                        </SelectTrigger>
                        <SelectContent>
                          {unassignedDocuments.map((doc) => (
                            <SelectItem key={doc.id} value={doc.id}>
                              {doc.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="assignee">Assign To (optional)</Label>
                      <Select
                        value={selectedAssigneeId || UNASSIGNED_VALUE}
                        onValueChange={(value) =>
                          setSelectedAssigneeId(value === UNASSIGNED_VALUE ? null : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned (visible to all)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VALUE}>Unassigned (visible to all)</SelectItem>
                          {sortedMembers.map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="deadline">Deadline (optional)</Label>
                      <Input
                        id="deadline"
                        type="datetime-local"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setAssignmentDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={loading || !selectedDocumentId}>
                        {loading ? 'Assigning...' : 'Assign'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-4">
              {/* Assigned Documents */}
              {assignedVersions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Assigned Documents</h3>
                  <div className="space-y-2">
                    {assignedVersions.map((version) => (
                      <Card key={version.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{version.document.title}</div>
                            <div className="text-sm text-gray-600 flex items-center gap-4 mt-1">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {version.user?.name || 'Unknown'}
                              </span>
                              {version.deadline && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(version.deadline).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={loading}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Clear Assignment</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Unassign {version.user?.name || 'this translator'} from {version.document.title}? The
                                  document stays in the project, open to the whole team, and any translation already
                                  done is kept.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleClearAssignment(version.documentId)}>
                                  Clear
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Unassigned Documents */}
              {unassignedVersions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Unassigned Documents</h3>
                  <div className="space-y-2">
                    {unassignedVersions.map((version) => (
                      <Card key={version.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{version.document.title}</div>
                            <Badge variant="outline" className="mt-1">
                              Unassigned
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {versions.length === 0 && (
                <Card className="p-6 text-center">
                  <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No documents in this project yet.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
