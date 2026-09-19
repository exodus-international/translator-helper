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
import { capture } from '@/lib/analytics';
import type { Prisma } from '@/generated/prisma/client';
import { Calendar, FileText, Plus, Trash2, User } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface TranslationProjectClientProps {
  translationProject: Prisma.TranslationProjectGetPayload<{
    include: {
      language: true;
      sourceProject: true;
    };
  }>;
  /**
   * The language team, read-only here: one role per user, shared by every
   * project in this language. Assignment offers these people; who is on the
   * team is decided at /languages/[code]/team.
   */
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
}

const UNASSIGNED_VALUE = '__unassigned__';


export default function TranslationProjectClient({
  translationProject,
  members,
  versions: initialVersions,
  documents,
}: TranslationProjectClientProps) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);

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

  const resetAssignmentForm = () => {
    setSelectedDocumentId('');
    setSelectedAssigneeId(null);
    setDeadline('');
  };

  // Every document can be assigned; the dialog offers those without a translator.
  const versionByDocumentId = new Map(versions.map((version) => [version.documentId, version]));
  const unassignedDocuments = documents.filter((doc) => !versionByDocumentId.get(doc.id)?.userId);

  // Assignment offers the language's members: the roster is read here, and
  // edited at /languages/[code]/team.
  const sortedMembers = [...members].sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''));

  const assignedVersions = versions.filter((version) => version.userId);
  const unassignedVersions = versions.filter((version) => !version.userId);

  return (
    <>
      <PageHeader
        title={translationProject.name}
        description={`${translationProject.language.name} (${translationProject.language.code})`}
      />

      <div className="px-4 py-4">
        <div className="grid gap-4">
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
                <DialogTrigger render={<Button disabled={unassignedDocuments.length === 0} />}>
                  <Plus className="h-4 w-4 mr-2" />
                  Assign Document
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Document</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAssignDocument} className="space-y-4">
                    <div>
                      <Label htmlFor="document">Document *</Label>
                      <Select
                        value={selectedDocumentId || null}
                        onValueChange={(v) => setSelectedDocumentId(v ?? '')}
                        required
                        items={Object.fromEntries(unassignedDocuments.map((doc) => [doc.id, doc.title]))}
                      >
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
                          setSelectedAssigneeId(!value || value === UNASSIGNED_VALUE ? null : value)
                        }
                        items={{
                          [UNASSIGNED_VALUE]: 'Unassigned (visible to all)',
                          ...Object.fromEntries(sortedMembers.map((member) => [member.userId, member.user.name ?? ''])),
                        }}
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
                  <h3 className="text-sm font-medium text-foreground mb-2">Assigned Documents</h3>
                  <div className="space-y-2">
                    {assignedVersions.map((version) => (
                      <Card key={version.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{version.document.title}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
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
                            <AlertDialogTrigger render={<Button variant="outline" disabled={loading} />}>
                              <Trash2 className="h-4 w-4" />
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
                  <h3 className="text-sm font-medium text-foreground mb-2">Unassigned Documents</h3>
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
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No documents in this project yet.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
