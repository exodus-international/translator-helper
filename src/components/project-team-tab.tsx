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
import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listTranslationProjectMembersAction,
  removeLanguageMemberAction,
  setLanguageMemberRoleAction,
} from '@/domain/user-language/user-language.actions';
import { listUsersAction } from '@/domain/user/user.actions';
import { SessionUser } from '@/lib/session';
import { ProjectRole } from '@/generated/prisma/enums';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ProjectTeamTabProps {
  translationProjectId: string | null;
  user: SessionUser;
  canManage: boolean;
  selectedLanguageName: string;
}

type Member = {
  id: string;
  userId: string;
  role: ProjectRole;
  user: { id: string; name: string; email: string; image: string | null };
};

const ALL_ROLES = [
  ProjectRole.PROJECT_MANAGER,
  ProjectRole.REVIEWER,
  ProjectRole.EDITOR,
  ProjectRole.TRANSLATOR,
] as const;

const ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: 'Project Manager',
  REVIEWER: 'Reviewer',
  EDITOR: 'Editor',
  TRANSLATOR: 'Translator',
};

function RoleSelect({ value, onChange }: { value: ProjectRole; onChange: (role: ProjectRole) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProjectRole)}>
      <SelectTrigger>
        <SelectValue placeholder="Select role" />
      </SelectTrigger>
      <SelectContent>
        {ALL_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function ProjectTeamTab({ translationProjectId, canManage, selectedLanguageName }: ProjectTeamTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>(ProjectRole.TRANSLATOR);
  const [adding, setAdding] = useState(false);
  const [editingMember, setEditingMember] = useState<{ userId: string; name: string } | null>(null);
  const [editRole, setEditRole] = useState<ProjectRole>(ProjectRole.TRANSLATOR);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [translationProjectId]);

  async function loadMembers() {
    if (!translationProjectId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [membersData, usersData] = await Promise.all([
        listTranslationProjectMembersAction(translationProjectId),
        canManage ? listUsersAction() : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setAllUsers(usersData);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember() {
    if (!translationProjectId || !newMemberUserId) return;

    setAdding(true);
    try {
      await setLanguageMemberRoleAction({
        translationProjectId,
        userId: newMemberUserId,
        role: newMemberRole,
      });
      toast.success(`Member added to the ${selectedLanguageName} team`);
      setAddDialogOpen(false);
      setNewMemberUserId('');
      setNewMemberRole(ProjectRole.TRANSLATOR);
      await loadMembers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  function openEditDialog(userId: string, name: string, role: ProjectRole) {
    setEditingMember({ userId, name });
    setEditRole(role);
  }

  async function handleSaveEdit() {
    if (!editingMember || !translationProjectId) return;

    setEditSaving(true);
    try {
      await setLanguageMemberRoleAction({
        translationProjectId,
        userId: editingMember.userId,
        role: editRole,
      });
      toast.success('Role updated successfully');
      setEditingMember(null);
      await loadMembers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update role');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemoveMember(userId: string, userName: string) {
    if (!translationProjectId) return;

    try {
      await removeLanguageMemberAction(userId, translationProjectId);
      toast.success(`${userName} removed from the ${selectedLanguageName} team`);
      await loadMembers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove member');
    }
  }

  if (!translationProjectId) {
    return (
      <div className="text-center py-12">
        <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500">No translation project exists for {selectedLanguageName}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading team members...</p>
      </div>
    );
  }

  const availableUsers = allUsers.filter((u) => !members.some((m) => m.user.id === u.id));

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {selectedLanguageName} Team ({members.length})
          </h2>
          <p className="text-sm text-gray-500">
            Members work on every {selectedLanguageName} project, not just this one.
          </p>
        </div>
        {canManage && (
          <Dialog modal={false} open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add {selectedLanguageName} Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>User</Label>
                  <Select value={newMemberUserId} onValueChange={setNewMemberUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role</Label>
                  <RoleSelect value={newMemberRole} onChange={setNewMemberRole} />
                  <p className="text-xs text-gray-500 mt-1">
                    Grants this role on all {selectedLanguageName} translation projects.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddMember} disabled={!newMemberUserId || adding}>
                  {adding ? 'Adding...' : 'Add Member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No team members yet</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                {canManage && <TableHead className="w-[100px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={member.user.name}
                        image={member.user.image}
                        email={member.user.email}
                        size="sm"
                      />
                      <div>
                        <p className="font-medium text-sm">{member.user.name}</p>
                        <p className="text-xs text-gray-500">{member.user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" size="sm">
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(member.user.id, member.user.name, member.role)}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <Trash2 className="h-4 w-4 text-gray-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove team member</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {member.user.name} from the {selectedLanguageName} team?
                                This removes their access to every {selectedLanguageName} translation project.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveMember(member.user.id, member.user.name)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit member role dialog */}
      <Dialog
        modal={false}
        open={!!editingMember}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Role — {editingMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Label>Role</Label>
            <RoleSelect value={editRole} onChange={setEditRole} />
            <p className="text-xs text-gray-500 mt-1">Applies to all {selectedLanguageName} translation projects.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
