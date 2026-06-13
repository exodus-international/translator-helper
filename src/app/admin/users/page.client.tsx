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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { updateUserRoleAction, adminUpdateUserProfileAction } from '@/domain/user/user.actions';
import {
  createInvitationAction,
  revokeInvitationAction,
} from '@/domain/invitation/invitation.actions';
import { adminSetUserLanguagesAction } from '@/domain/user-language/user-language.actions';
import {
  getInvitationDisplayStatus,
  type InvitationDisplayStatus,
} from '@/domain/invitation/invitation.display-status';
import { authClient } from '@/lib/auth-client';
import { Role, InvitationStatus, TShirtSize } from '@prisma/client';
import { Ban, Check, ChevronLeft, ChevronRight, Clock, Copy, Globe, Key, Link2, Pencil, Plus, Shield, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const T_SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
const NONE_VALUE = '__none__';

// ─── Types ──────────────────────────────────────────────────

interface LanguageInfo {
  id: string;
  name: string;
  code: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  image?: string | null;
  banned?: boolean;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  tShirtSize?: TShirtSize | null;
  exodus90AppId?: string | null;
  onboarded?: boolean;
  createdAt: Date;
  updatedAt: Date;
  languages: Array<{ language: LanguageInfo }>;
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
  languages: Array<{ language: LanguageInfo }>;
}

interface UsersClientProps {
  users: User[];
  invitations: Invitation[];
  languages: LanguageInfo[];
}

// ─── Helpers ────────────────────────────────────────────────

function invitationStatusBadge(status: InvitationDisplayStatus) {
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

const INVITATIONS_PER_PAGE = 10;

type InvitationFilter = 'active' | 'inactive';

// ─── Component ──────────────────────────────────────────────

export default function UsersClient({ users: initialUsers, invitations: initialInvitations, languages: availableLanguages }: UsersClientProps) {
  // Users state
  const [users, setUsers] = useState(initialUsers);
  const [userFilter, setUserFilter] = useState<'active' | 'banned'>('active');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [loading, setLoading] = useState(false);

  // Password reset state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Language edit state
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const [languageUser, setLanguageUser] = useState<User | null>(null);
  const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>([]);

  // Profile edit state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileStreet, setProfileStreet] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileState, setProfileState] = useState('');
  const [profileZip, setProfileZip] = useState('');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileTShirtSize, setProfileTShirtSize] = useState('');
  const [profileExodus90, setProfileExodus90] = useState('');

  // Invitations state
  const [invitations, setInvitations] = useState(initialInvitations);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [inviteLanguageIds, setInviteLanguageIds] = useState<string[]>([]);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [invitationFilter, setInvitationFilter] = useState<InvitationFilter>('active');
  const [invitationPage, setInvitationPage] = useState(1);

  // ─── Filtered & paginated invitations ───────────────────

  const filteredInvitations = useMemo(() => {
    return invitations.filter((inv) => {
      const status = getInvitationDisplayStatus(inv);
      return invitationFilter === 'active' ? status === 'active' : status !== 'active';
    });
  }, [invitations, invitationFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvitations.length / INVITATIONS_PER_PAGE));
  const clampedPage = Math.min(invitationPage, totalPages);
  const paginatedInvitations = filteredInvitations.slice(
    (clampedPage - 1) * INVITATIONS_PER_PAGE,
    clampedPage * INVITATIONS_PER_PAGE,
  );

  const handleFilterChange = (filter: InvitationFilter) => {
    setInvitationFilter(filter);
    setInvitationPage(1);
  };

  // ─── Filtered users ─────────────────────────────────────

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      userFilter === 'active' ? !u.banned : !!u.banned,
    );
  }, [users, userFilter]);

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
      await authClient.admin.banUser({ userId });
      setUsers(users.map((u) => (u.id === userId ? { ...u, banned: true } : u)));
      toast.success('User banned');
    } catch (error: any) {
      toast.error(error.message || 'Failed to ban user');
    } finally {
      setLoading(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setLoading(true);
    try {
      await authClient.admin.unbanUser({ userId });
      setUsers(users.map((u) => (u.id === userId ? { ...u, banned: false } : u)));
      toast.success('User unbanned');
    } catch (error: any) {
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

  // ─── Password reset ─────────────────────────────────────

  const openPasswordDialog = (user: User) => {
    setPasswordUser(user);
    setNewPassword('');
    setPasswordDialogOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser || newPassword.length < 8) return;
    setLoading(true);
    try {
      const result = await authClient.admin.setUserPassword({
        userId: passwordUser.id,
        newPassword,
      });
      if (result.error) throw new Error(result.error.message);
      toast.success(`Password reset for ${passwordUser.name}`);
      setPasswordDialogOpen(false);
      setPasswordUser(null);
      setNewPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  // ─── Language editing ──────────────────────────────────

  const openLanguageDialog = (user: User) => {
    setLanguageUser(user);
    setSelectedLanguageIds(user.languages.map((ul) => ul.language.id));
    setLanguageDialogOpen(true);
  };

  const handleSaveLanguages = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!languageUser) return;
    setLoading(true);
    try {
      await adminSetUserLanguagesAction(languageUser.id, selectedLanguageIds);
      setUsers(users.map((u) =>
        u.id === languageUser.id
          ? { ...u, languages: selectedLanguageIds.map((id) => ({ language: availableLanguages.find((l) => l.id === id)! })) }
          : u,
      ));
      toast.success(`Languages updated for ${languageUser.name}`);
      setLanguageDialogOpen(false);
      setLanguageUser(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update languages');
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguageSelection = (languageId: string) => {
    setSelectedLanguageIds((prev) =>
      prev.includes(languageId) ? prev.filter((id) => id !== languageId) : [...prev, languageId],
    );
  };

  // ─── Profile editing ──────────────────────────────────

  const openProfileDialog = (user: User) => {
    setProfileUser(user);
    setProfileName(user.name);
    setProfileStreet(user.streetAddress ?? '');
    setProfileCity(user.city ?? '');
    setProfileState(user.state ?? '');
    setProfileZip(user.zipCode ?? '');
    setProfileCountry(user.country ?? '');
    setProfileTShirtSize(user.tShirtSize ?? '');
    setProfileExodus90(user.exodus90AppId ?? '');
    setProfileDialogOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileUser || !profileName.trim()) return;
    setLoading(true);
    try {
      await adminUpdateUserProfileAction(profileUser.id, {
        name: profileName.trim(),
        streetAddress: profileStreet.trim() || null,
        city: profileCity.trim() || null,
        state: profileState.trim() || null,
        zipCode: profileZip.trim() || null,
        country: profileCountry.trim() || null,
        tShirtSize: profileTShirtSize || null,
        exodus90AppId: profileExodus90.trim() || null,
      });
      setUsers(users.map((u) =>
        u.id === profileUser.id
          ? {
              ...u,
              name: profileName.trim(),
              streetAddress: profileStreet.trim() || null,
              city: profileCity.trim() || null,
              state: profileState.trim() || null,
              zipCode: profileZip.trim() || null,
              country: profileCountry.trim() || null,
              tShirtSize: (profileTShirtSize || null) as TShirtSize | null,
              exodus90AppId: profileExodus90.trim() || null,
            }
          : u,
      ));
      toast.success(`Profile updated for ${profileName.trim()}`);
      setProfileDialogOpen(false);
      setProfileUser(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
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
        languageIds: inviteLanguageIds.length > 0 ? inviteLanguageIds : undefined,
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
    setInviteLanguageIds([]);
    setCreatedInviteUrl(null);
  };

  const toggleInviteLanguage = (languageId: string) => {
    setInviteLanguageIds((prev) =>
      prev.includes(languageId) ? prev.filter((id) => id !== languageId) : [...prev, languageId],
    );
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-600">Manage users, roles, and invitations</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>

          {/* ── Users Tab ──────────────────────────────────── */}
          <TabsContent value="users">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant={userFilter === 'active' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUserFilter('active')}
              >
                Active
              </Button>
              <Button
                variant={userFilter === 'banned' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUserFilter('banned')}
              >
                Banned
              </Button>
            </div>

            {filteredUsers.length === 0 ? (
              <Card className="p-6 text-center text-gray-500">
                {userFilter === 'active' ? 'No active users.' : 'No banned users.'}
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredUsers.map((user) => (
                  <Card key={user.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">{user.name}</h3>
                          <Badge variant={user.role === Role.ADMIN ? 'primary' : 'secondary'}>
                            {user.role === Role.ADMIN ? <Shield className="h-3 w-3 mr-1" /> : null}
                            {user.role}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{user.email}</p>
                        {user.languages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {user.languages.map((ul) => (
                              <Badge key={ul.language.id} variant="outline" size="xs">
                                {ul.language.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {user.banned && (
                          <Badge variant="destructive" size="sm">Banned</Badge>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!user.banned && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openProfileDialog(user)} disabled={loading}>
                              <Pencil className="h-4 w-4 mr-1" />
                              Profile
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openLanguageDialog(user)} disabled={loading}>
                              <Globe className="h-4 w-4 mr-1" />
                              Languages
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openPasswordDialog(user)} disabled={loading}>
                              <Key className="h-4 w-4 mr-1" />
                              Password
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openRoleDialog(user)} disabled={loading}>
                              Change Role
                            </Button>
                          </>
                        )}
                        {user.banned ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={loading}>
                                Unban
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Unban User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to unban {user.name}? They will be able to log in and access the system again.
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
                                <Ban className="h-4 w-4 mr-1" />
                                Ban
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Ban User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to ban {user.name}? They will be signed out and unable to access the system.
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
            )}
          </TabsContent>

          {/* ── Invitations Tab ────────────────────────────── */}
          <TabsContent value="invitations">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={invitationFilter === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilterChange('active')}
                >
                  Active
                </Button>
                <Button
                  variant={invitationFilter === 'inactive' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilterChange('inactive')}
                >
                  Inactive
                </Button>
              </div>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Invitation
              </Button>
            </div>

            {filteredInvitations.length === 0 ? (
              <Card className="p-6 text-center text-gray-500">
                {invitationFilter === 'active'
                  ? 'No active invitations. Create one to invite translators.'
                  : 'No inactive invitations.'}
              </Card>
            ) : (
              <>
                <div className="grid gap-3">
                  {paginatedInvitations.map((inv) => {
                    const displayStatus = getInvitationDisplayStatus(inv);
                    return (
                      <Card key={inv.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <code className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">
                                {truncateToken(inv.token)}
                              </code>
                              {invitationStatusBadge(displayStatus)}
                            </div>
                            <div className="flex gap-4 mt-2 text-sm text-gray-600">
                              <span>
                                Uses: {inv.usedCount}/{inv.maxUses ?? '\u221e'}
                              </span>
                              <span>
                                Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                              </span>
                              <span>
                                By: {inv.createdBy.name}
                              </span>
                            </div>
                            {inv.languages.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {inv.languages.map((il) => (
                                  <Badge key={il.language.id} variant="outline" size="xs">
                                    {il.language.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-gray-500">
                      {filteredInvitations.length} invitation{filteredInvitations.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={clampedPage <= 1}
                        onClick={() => setInvitationPage(clampedPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-gray-600">
                        {clampedPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={clampedPage >= totalPages}
                        onClick={() => setInvitationPage(clampedPage + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
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

      {/* ── Reset Password Dialog ────────────────────────── */}
      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) { setPasswordUser(null); setNewPassword(''); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {passwordUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || newPassword.length < 8}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Languages Dialog ────────────────────────── */}
      <Dialog
        open={languageDialogOpen}
        onOpenChange={(open) => {
          setLanguageDialogOpen(open);
          if (!open) { setLanguageUser(null); setSelectedLanguageIds([]); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Languages for {languageUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveLanguages} className="space-y-4">
            <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-1">
              {availableLanguages.map((lang) => (
                <label key={lang.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedLanguageIds.includes(lang.id)}
                    onChange={() => toggleLanguageSelection(lang.id)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">{lang.name}</span>
                  <span className="text-xs text-gray-500">({lang.code})</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLanguageDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Languages'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Profile Dialog ──────────────────────────── */}
      <Dialog
        open={profileDialogOpen}
        onOpenChange={(open) => {
          setProfileDialogOpen(open);
          if (!open) setProfileUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile for {profileUser?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <Label htmlFor="admin-profile-name">Full Name</Label>
              <Input id="admin-profile-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="admin-profile-street">Street Address</Label>
              <Input
                id="admin-profile-street"
                value={profileStreet}
                onChange={(e) => setProfileStreet(e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="admin-profile-city">City</Label>
                <Input id="admin-profile-city" value={profileCity} onChange={(e) => setProfileCity(e.target.value)} placeholder="City" />
              </div>
              <div>
                <Label htmlFor="admin-profile-state">State / Province</Label>
                <Input id="admin-profile-state" value={profileState} onChange={(e) => setProfileState(e.target.value)} placeholder="State or province" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="admin-profile-zip">Zip / Postal Code</Label>
                <Input id="admin-profile-zip" value={profileZip} onChange={(e) => setProfileZip(e.target.value)} placeholder="Zip code" />
              </div>
              <div>
                <Label htmlFor="admin-profile-country">Country</Label>
                <Input id="admin-profile-country" value={profileCountry} onChange={(e) => setProfileCountry(e.target.value)} placeholder="Country" />
              </div>
            </div>
            <div>
              <Label htmlFor="admin-profile-tshirt">T-Shirt Size</Label>
              <Select value={profileTShirtSize || NONE_VALUE} onValueChange={(v) => setProfileTShirtSize(v === NONE_VALUE ? '' : v)}>
                <SelectTrigger id="admin-profile-tshirt">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                  {T_SHIRT_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="admin-profile-exodus90">Exodus90 App ID</Label>
              <Input
                id="admin-profile-exodus90"
                value={profileExodus90}
                onChange={(e) => setProfileExodus90(e.target.value)}
                placeholder="Exodus90 app ID"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || !profileName.trim()}>
                {loading ? 'Saving...' : 'Save Profile'}
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
              {availableLanguages.length > 0 && (
                <div>
                  <Label>Languages (assigned on registration)</Label>
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1 mt-1">
                    {availableLanguages.map((lang) => (
                      <label key={lang.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={inviteLanguageIds.includes(lang.id)}
                          onChange={() => toggleInviteLanguage(lang.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{lang.name}</span>
                        <span className="text-xs text-gray-500">({lang.code})</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Users registering with this link will be assigned these languages.</p>
                </div>
              )}
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
