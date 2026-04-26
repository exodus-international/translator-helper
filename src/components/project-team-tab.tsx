'use client';

import React from 'react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createProjectMemberAction,
  deleteProjectMemberAction,
  deleteProjectMembersByUserAction,
  listProjectMembersAction,
} from '@/domain/project-member/project-member.actions';
import { listUsersAction } from '@/domain/user/user.actions';
import { SessionUser } from '@/lib/session';
import { ProjectRole } from '@prisma/client';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ProjectTeamTabProps {
  translationProjectId: string | null;
  user: SessionUser;
  canManage: boolean;
  selectedLanguageName: string;
}

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

function RoleCombobox({
  value,
  onChange,
  disabledRoles = [],
}: {
  value: ProjectRole[];
  onChange: (roles: ProjectRole[]) => void;
  disabledRoles?: ProjectRole[];
}) {
  const anchor = useComboboxAnchor();
  const availableRoles = ALL_ROLES.filter((r) => !disabledRoles.includes(r));

  return (
    <Combobox
      multiple
      autoHighlight
      items={availableRoles}
      value={value}
      onValueChange={onChange}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: ProjectRole[]) => (
            <React.Fragment>
              {values.map((role) => (
                <ComboboxChip key={role}>{ROLE_LABELS[role]}</ComboboxChip>
              ))}
              <ComboboxChipsInput placeholder={values.length === 0 ? 'Select roles...' : ''} />
            </React.Fragment>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No roles available.</ComboboxEmpty>
        <ComboboxList>
          {(item: ProjectRole) => (
            <ComboboxItem key={item} value={item}>
              {ROLE_LABELS[item]}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export default function ProjectTeamTab({
  translationProjectId,
  canManage,
  selectedLanguageName,
}: ProjectTeamTabProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRoles, setNewMemberRoles] = useState<ProjectRole[]>([ProjectRole.TRANSLATOR]);
  const [adding, setAdding] = useState(false);
  const [editingMember, setEditingMember] = useState<{
    userId: string;
    name: string;
    currentRoles: { id: string; role: ProjectRole }[];
  } | null>(null);
  const [editRoles, setEditRoles] = useState<ProjectRole[]>([]);
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
        listProjectMembersAction(translationProjectId),
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

  const groupedMembers = useMemo(() => {
    const grouped = new Map<string, { user: any; roles: { id: string; role: ProjectRole }[] }>();

    members.forEach((member) => {
      const userId = member.user.id;
      if (!grouped.has(userId)) {
        grouped.set(userId, { user: member.user, roles: [] });
      }
      grouped.get(userId)!.roles.push({ id: member.id, role: member.role });
    });

    return Array.from(grouped.values()).sort((a, b) => a.user.name.localeCompare(b.user.name));
  }, [members]);

  async function handleAddMember() {
    if (!translationProjectId || !newMemberUserId || newMemberRoles.length === 0) return;

    setAdding(true);
    try {
      await Promise.all(
        newMemberRoles.map((role) =>
          createProjectMemberAction({
            translationProjectId,
            userId: newMemberUserId,
            role,
          }),
        ),
      );
      toast.success('Member added successfully');
      setAddDialogOpen(false);
      setNewMemberUserId('');
      setNewMemberRoles([ProjectRole.TRANSLATOR]);
      await loadMembers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  function openEditDialog(userId: string, name: string, roles: { id: string; role: ProjectRole }[]) {
    setEditingMember({ userId, name, currentRoles: roles });
    setEditRoles(roles.map((r) => r.role));
  }

  async function handleSaveEdit() {
    if (!editingMember || !translationProjectId) return;

    setEditSaving(true);
    try {
      const currentRoleSet = new Set(editingMember.currentRoles.map((r) => r.role));
      const newRoleSet = new Set(editRoles);

      // Roles to add
      const toAdd = editRoles.filter((r) => !currentRoleSet.has(r));
      // Roles to remove
      const toRemove = editingMember.currentRoles.filter((r) => !newRoleSet.has(r.role));

      await Promise.all([
        ...toAdd.map((role) =>
          createProjectMemberAction({
            translationProjectId,
            userId: editingMember.userId,
            role,
          }),
        ),
        ...toRemove.map((r) => deleteProjectMemberAction(r.id)),
      ]);

      toast.success('Roles updated successfully');
      setEditingMember(null);
      await loadMembers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update roles');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRemoveMember(userId: string, userName: string) {
    if (!translationProjectId) return;

    try {
      await deleteProjectMembersByUserAction(userId, translationProjectId);
      toast.success(`${userName} removed from team`);
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

  // Roles the selected user already has (for disabling in add dialog)
  const existingRolesForNewUser = members
    .filter((m) => m.user.id === newMemberUserId)
    .map((m) => m.role as ProjectRole);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Team Members ({groupedMembers.length})</h2>
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
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>User</Label>
                  <Select
                    value={newMemberUserId}
                    onValueChange={(v) => {
                      setNewMemberUserId(v);
                      const existing = members.filter((m) => m.user.id === v).map((m) => m.role as ProjectRole);
                      const defaultRole = ALL_ROLES.find((r) => !existing.includes(r));
                      setNewMemberRoles(defaultRole ? [defaultRole] : []);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers
                        .filter((u) => !groupedMembers.some((m) => m.user.id === u.id))
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Roles</Label>
                  <RoleCombobox
                    value={newMemberRoles}
                    onChange={setNewMemberRoles}
                    disabledRoles={existingRolesForNewUser}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddMember} disabled={!newMemberUserId || newMemberRoles.length === 0 || adding}>
                  {adding ? 'Adding...' : 'Add Member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {groupedMembers.length === 0 ? (
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
                <TableHead>Roles</TableHead>
                {canManage && <TableHead className="w-[100px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedMembers.map(({ user: member, roles }) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="sm" name={member.name || undefined}>
                        <AvatarFallback name={member.name || undefined}>
                          {member.name
                            .split(' ')
                            .map((n: string) => n.charAt(0))
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{member.name}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {roles.map(({ id, role }) => (
                        <Badge key={id} variant="secondary" size="sm">
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(member.id, member.name, roles)}
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
                                Are you sure you want to remove {member.name} from this team? This will remove all their
                                roles.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveMember(member.id, member.name)}>
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

      {/* Edit member roles dialog */}
      <Dialog
        modal={false}
        open={!!editingMember}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roles — {editingMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Label>Roles</Label>
            <RoleCombobox value={editRoles} onChange={setEditRoles} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || editRoles.length === 0}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
