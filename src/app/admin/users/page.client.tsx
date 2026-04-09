'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateUserRoleAction } from '@/domain/user/user.actions';
import {
  createInvitationAction,
  revokeInvitationAction,
} from '@/domain/invitation/invitation.actions';
import { authClient } from '@/lib/auth-client';
import { Role, InvitationStatus } from '@prisma/client';
import {
  getInvitationDisplayStatus,
  type InvitationDisplayStatus,
} from '@/domain/invitation/invitation.display-status';
import { Ban, Check, Clock, Copy, Link2, Plus, Shield, Unlock, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  image?: string | null;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Invitation {
  id: string;
  token: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date;
  status: InvitationStatus;
  createdAt: Date;
  createdBy: { id: string; name: string; email: string };
}

interface UsersClientProps {
  users: User[];
  invitations: Invitation[];
}

// ─── Helpers ────────────────────────────────────────────────

function statusBadge(status: InvitationDisplayStatus) {
  switch (status) {
    case 'active':
      return <Badge variant="success"><Clock className="h-3 w-3 mr-1" />Active</Badge>;
    case 'revoked':
      return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Revoked</Badge>;
    case 'expired':
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    case 'exhausted':
      return <Badge variant="secondary"><Check className="h-3 w-3 mr-1" />Fully Used</Badge>;
  }
}

function truncateToken(token: string) {
  return token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : token;
}

// ─── Component ──────────────────────────────────────────────

export default function UsersClient({ users: initialUsers, invitations: initialInvitations }: UsersClientProps) {
  // Users state
  const [users, setUsers] = useState(initialUsers);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [loading, setLoading] = useState(false);

  // Invitations state
  const [invitations, setInvitations] = useState(initialInvitations);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  // ─── User actions ───────────────────────────────────────

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setLoading(true);
    try {
      await updateUserRoleAction(userId, newRole);
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      toast.success('User role updated successfully');
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string) => {
    setLoading(true);
    try {
      const result = await authClient.admin.banUser({ userId });
      if (result.error) throw new Error(result.error.message);
      setUsers(
        users.map((u) =>
          u.id === userId
            ? {
                ...u,
                banned: true,
                banReason: result.data?.user?.banReason || null,
                banExpires: result.data?.user?.banExpires ? new Date(result.data.user.banExpires) : null,
              }
            : u,
        ),
      );
      toast.success('User banned successfully');
    } catch (error: any) {
      console.error('Error banning user:', error);
      toast.error(error.message || 'Failed to ban user');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setLoading(true);
    try {
      const result = await authClient.admin.unbanUser({ userId });
      if (result.error) throw new Error(result.error.message);
      setUsers(users.map((u) => (u.id === userId ? { ...u, banned: false, banReason: null, banExpires: null } : u)));
      toast.success('User unbanned successfully');
    } catch (error: any) {
      console.error('Error unbanning user:', error);
      toast.error(error.message || 'Failed to unban user');
    } finally {
      setLoading(false);
    }
  };

  const openRoleDialog = (user: User) => {
    setEditingUser(user);
    setSelectedRole(user.role);
    setRoleDialogOpen(true);
  };

  const handleRoleDialogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !selectedRole) return;
    setLoading(true);
    try {
      await handleRoleChange(editingUser.id, selectedRole);
      setRoleDialogOpen(false);
      setEditingUser(null);
      setSelectedRole('');
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  // ─── Invitation actions ─────────────────────────────────

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const expiresAt = expiresInDays
        ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
        : undefined;
      const result = await createInvitationAction({
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt,
      });
      setCreatedInviteUrl(result.inviteUrl);
      setInvitations([
        {
          ...result,
          usedCount: 0,
          status: 'ACTIVE' as InvitationStatus,
          createdBy: { id: '', name: 'You', email: '' },
        },
        ...invitations,
      ]);
      toast.success('Invitation created');
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      toast.error(error.message || 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('Invite link copied to clipboard');
  };

  const handleRevoke = async (id: string) => {
    setLoading(true);
    try {
      await revokeInvitationAction(id);
      setInvitations(invitations.map((inv) => (inv.id === id ? { ...inv, status: 'REVOKED' as InvitationStatus } : inv)));
      toast.success('Invitation revoked');
    } catch (error: any) {
      console.error('Error revoking invitation:', error);
      toast.error(error.message || 'Failed to revoke invitation');
    } finally {
      setLoading(false);
    }
  };

  const resetCreateDialog = () => {
    setCreateDialogOpen(false);
    setMaxUses('');
    setExpiresInDays('30');
    setCreatedInviteUrl(null);
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-gray-600">Manage users, roles, bans, and invitations</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 space-y-8">
        {/* ── Invitations Section ────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Invitations</h2>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Invitation
            </Button>
          </div>

          {invitations.length === 0 ? (
            <Card className="p-6 text-center text-gray-500">
              No invitations yet. Create one to invite translators.
            </Card>
          ) : (
            <div className="grid gap-3">
              {invitations.map((inv) => {
                const displayStatus = getInvitationDisplayStatus(inv);
                return (
                  <Card key={inv.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <code className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">
                            {truncateToken(inv.token)}
                          </code>
                          {statusBadge(displayStatus)}
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-gray-600">
                          <span>
                            Uses: {inv.usedCount}/{inv.maxUses ?? '∞'}
                          </span>
                          <span>
                            Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                          <span>
                            By: {inv.createdBy.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {displayStatus === 'active' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyUrl(`${baseUrl}/register/${inv.token}`)}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              Copy Link
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" disabled={loading}>
                                  <X className="h-4 w-4 mr-1" />
                                  Revoke
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently invalidate this invitation link. Anyone with the link will no longer be able to register.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRevoke(inv.id)}>Revoke</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Users Section ──────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Users</h2>
          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{user.name}</h3>
                      <Badge variant={user.role === Role.ADMIN ? 'primary' : 'secondary'}>
                        {user.role === Role.ADMIN ? <Shield className="h-3 w-3 mr-1" /> : null}
                        {user.role}
                      </Badge>
                      {user.banned && (
                        <Badge variant="destructive">
                          <Ban className="h-3 w-3 mr-1" />
                          Banned
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                    {user.banned && user.banReason && (
                      <p className="text-sm text-red-600 mt-1">Reason: {user.banReason}</p>
                    )}
                    {user.banned && user.banExpires && (
                      <p className="text-sm text-gray-500 mt-1">
                        Expires: {new Date(user.banExpires).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openRoleDialog(user)} disabled={loading}>
                      Change Role
                    </Button>
                    {user.banned ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={loading}>
                            <Unlock className="h-4 w-4 mr-2" />
                            Unban
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unban User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to unban {user.name}? They will be able to access the system again.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleUnbanUser(user.id)}>Unban</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={loading}>
                            <Ban className="h-4 w-4 mr-2" />
                            Ban
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Ban User</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to ban {user.name}? This will prevent them from accessing the system.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleBanUser(user.id)}>Ban</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {/* ── Role Change Dialog ────────────────────────────── */}
      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) {
            setEditingUser(null);
            setSelectedRole('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRoleDialogSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Role</label>
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as Role)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.USER}>User</SelectItem>
                  <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !selectedRole}>
                {loading ? 'Updating...' : 'Update Role'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Create Invitation Dialog ──────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) resetCreateDialog(); else setCreateDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createdInviteUrl ? 'Invitation Created' : 'Create Invitation'}
            </DialogTitle>
          </DialogHeader>

          {createdInviteUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Share this link with the person you want to invite:
              </p>
              <div className="flex items-center gap-2">
                <Input value={createdInviteUrl} readOnly className="font-mono text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyUrl(createdInviteUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={resetCreateDialog}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateInvitation} className="space-y-4">
              <div>
                <Label htmlFor="max-uses">Max Uses</Label>
                <Input
                  id="max-uses"
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Leave empty for unlimited"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How many people can register with this link. Empty = unlimited.
                </p>
              </div>
              <div>
                <Label htmlFor="expires-in">Expires In (days)</Label>
                <Input
                  id="expires-in"
                  type="number"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="30"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetCreateDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  <Link2 className="h-4 w-4 mr-2" />
                  {loading ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
