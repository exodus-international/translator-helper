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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createProjectMemberAction,
  deleteProjectMembersByUserAction,
  listProjectMembersAction,
} from '@/domain/project-member/project-member.actions';
import { listUsersAction } from '@/domain/user/user.actions';
import { SessionUser } from '@/lib/session';
import { ProjectRole } from '@prisma/client';
import { Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ProjectTeamTabProps {
  translationProjectId: string | null;
  user: SessionUser;
  canManage: boolean;
  selectedLanguageName: string;
}

const ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: 'Project Manager',
  REVIEWER: 'Reviewer',
  EDITOR: 'Editor',
  TRANSLATOR: 'Translator',
};

export default function ProjectTeamTab({
  translationProjectId,
  user,
  canManage,
  selectedLanguageName,
}: ProjectTeamTabProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>(ProjectRole.TRANSLATOR);
  const [adding, setAdding] = useState(false);

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

  // Group members by user
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
    if (!translationProjectId || !newMemberUserId) return;

    setAdding(true);
    try {
      await createProjectMemberAction({
        translationProjectId,
        userId: newMemberUserId,
        role: newMemberRole,
      });
      toast.success('Member added successfully');
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Team Members ({groupedMembers.length})
        </h2>
        {canManage && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
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
                  <Select value={newMemberUserId} onValueChange={setNewMemberUserId}>
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
                  <Label>Role</Label>
                  <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as ProjectRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                        <SelectItem key={role} value={role}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddMember} disabled={!newMemberUserId || adding} className="w-full">
                  {adding ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
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
                {canManage && <TableHead className="w-[60px]" />}
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
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
