'use client';

import { UserAvatar } from '@/components/user-avatar';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { capture } from '@/lib/analytics';
import { createInvitationAction, revokeInvitationAction } from '@/domain/invitation/invitation.actions';
import {
  getInvitationDisplayStatus,
  type InvitationDisplayStatus,
} from '@/domain/invitation/invitation.display-status';
import { adminSetUserLanguagesAction } from '@/domain/user-language/user-language.actions';
import { buildUserCsv } from '@/domain/user/user-csv';
import { compareByLanguageThenName, matchesSearch, resolveSelectedLanguages } from '@/domain/user/user-table';
import { formatExactDateTime, formatLastActive, formatUnambiguousDate } from '@/lib/format';
import { downloadCsv } from '@/lib/download';
import { adminUpdateUserProfileAction, updateUserRoleAction } from '@/domain/user/user.actions';
import { useDataTable } from '@/hooks/use-data-table';
import { authClient } from '@/lib/auth-client';
import { InvitationStatus, Role, TShirtSize } from '@prisma/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Globe,
  Key,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const T_SHIRT_SIZES = Object.values(TShirtSize);
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
  lastSeenAt?: Date | null;
  lastDocumentEditAt?: Date | null;
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
      return (
        <Badge variant="success">
          <Clock className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case 'revoked':
      return (
        <Badge variant="destructive">
          <X className="h-3 w-3 mr-1" />
          Revoked
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Expired
        </Badge>
      );
    case 'exhausted':
      return (
        <Badge variant="secondary">
          <Check className="h-3 w-3 mr-1" />
          Fully Used
        </Badge>
      );
  }
}

function truncateToken(token: string) {
  return token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : token;
}

const INVITATIONS_PER_PAGE = 10;

const ROLE_OPTIONS = [
  { label: 'Admin', value: Role.ADMIN },
  { label: 'User', value: Role.USER },
];

function lastActivityColumn(id: 'lastSeenAt' | 'lastDocumentEditAt', label: string): ColumnDef<User> {
  return {
    id,
    accessorFn: (row) => (row[id] ? new Date(row[id]).getTime() : 0),
    header: ({ column }) => <DataTableColumnHeader column={column} label={label} />,
    cell: ({ row }) => {
      const value = row.original[id];
      return (
        <span className="text-sm text-gray-600" title={value ? formatExactDateTime(value) : undefined}>
          {formatLastActive(value)}
        </span>
      );
    },
    meta: { label },
  };
}

type InvitationFilter = 'active' | 'inactive';

// ─── Component ──────────────────────────────────────────────

export default function UsersClient({
  users: initialUsers,
  invitations: initialInvitations,
  languages: availableLanguages,
}: UsersClientProps) {
  // Users state
  const [users, setUsers] = useState(initialUsers);
  const [userFilter, setUserFilter] = useQueryState(
    'status',
    parseAsStringLiteral(['active', 'banned'] as const).withDefault('active'),
  );
  // The input stays responsive (nuqs updates its state immediately); only the
  // URL writes are throttled.
  const [search, setSearch] = useQueryState('search', parseAsString.withDefault('').withOptions({ throttleMs: 300 }));
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [loading, setLoading] = useState(false);

  // Password reset state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordResetInfo, setPasswordResetInfo] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

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

  // Ban / unban confirmation state; the dialog is open exactly when a target is set.
  const [banTarget, setBanTarget] = useState<User | null>(null);

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
    return users.filter((u) => (userFilter === 'active' ? !u.banned : !!u.banned));
  }, [users, userFilter]);

  const searchedUsers = useMemo(() => filteredUsers.filter((u) => matchesSearch(u, search)), [filteredUsers, search]);

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
      capture('user_banned');
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
      capture('user_unbanned');
      toast.success('User unbanned');
    } catch (error: any) {
      toast.error(error.message || 'Failed to unban user');
    } finally {
      setLoading(false);
    }
  };

  const openBanDialog = (user: User) => {
    setBanTarget(user);
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
      capture('user_role_changed', { role: selectedRole });
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
    setConfirmPassword('');
    setPasswordResetInfo(null);
    setPasswordDialogOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser || newPassword.length < 8 || newPassword !== confirmPassword) return;
    setLoading(true);
    try {
      const result = await authClient.admin.setUserPassword({
        userId: passwordUser.id,
        newPassword,
      });
      if (result.error) throw new Error(result.error.message);
      capture('admin_user_password_reset');
      // Keep the dialog open and surface a ready-to-send message for the admin.
      setPasswordResetInfo({
        name: passwordUser.name,
        email: passwordUser.email,
        password: newPassword,
      });
      toast.success(`Password reset for ${passwordUser.name}`);
      setNewPassword('');
      setConfirmPassword('');
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
      // Resolve against the user's current languages too: the dialog only offers
      // target languages, so an already-assigned English would not resolve.
      const knownLanguages = [...availableLanguages, ...languageUser.languages.map((ul) => ul.language)];
      setUsers(
        users.map((u) =>
          u.id === languageUser.id
            ? { ...u, languages: resolveSelectedLanguages(selectedLanguageIds, knownLanguages) }
            : u,
        ),
      );
      capture('admin_user_languages_updated', { language_count: selectedLanguageIds.length });
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
      setUsers(
        users.map((u) =>
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
        ),
      );
      capture('admin_user_profile_updated');
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
      const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000) : undefined;
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
      capture('invitation_created');
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
    capture('invitation_link_copied');
    toast.success('Invite link copied to clipboard');
  };

  const handleRevoke = async (id: string) => {
    setLoading(true);
    try {
      await revokeInvitationAction(id);
      setInvitations(
        invitations.map((inv) => (inv.id === id ? { ...inv, status: 'REVOKED' as InvitationStatus } : inv)),
      );
      capture('invitation_revoked');
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

  // ─── Users table ────────────────────────────────────────

  const languageOptions = useMemo(
    () => availableLanguages.map((l) => ({ label: l.name, value: l.id })),
    [availableLanguages],
  );

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <UserAvatar name={row.original.name} image={row.original.image} email={row.original.email} size="sm" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
        meta: { label: 'Name' },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Email" />,
        cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.email}</span>,
        meta: { label: 'Email' },
      },
      {
        id: 'languages',
        accessorFn: (row) => row.languages.map((ul) => ul.language.id),
        header: ({ column }) => <DataTableColumnHeader column={column} label="Languages" />,
        cell: ({ row }) =>
          row.original.languages.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.languages.map((ul) => (
                <Badge key={ul.language.id} variant="outline" size="xs">
                  {ul.language.name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          ),
        filterFn: 'arrIncludesSome',
        sortingFn: (rowA, rowB) => compareByLanguageThenName(rowA.original, rowB.original),
        enableColumnFilter: true,
        meta: {
          label: 'Languages',
          variant: 'multiSelect',
          options: languageOptions,
        },
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Role" />,
        cell: ({ row }) => (
          <Badge variant={row.original.role === Role.ADMIN ? 'primary' : 'secondary'} size="sm">
            {row.original.role === Role.ADMIN ? <Shield className="h-3 w-3 mr-1" /> : null}
            {row.original.role}
          </Badge>
        ),
        filterFn: (row, columnId, value: string[]) =>
          value.length === 0 || value.includes(row.getValue(columnId) as string),
        enableColumnFilter: true,
        meta: { label: 'Role', variant: 'multiSelect', options: ROLE_OPTIONS },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Joined" />,
        cell: ({ row }) => (
          <span className="text-sm text-gray-600">{formatUnambiguousDate(row.original.createdAt)}</span>
        ),
        meta: { label: 'Joined' },
      },
      lastActivityColumn('lastSeenAt', 'Last seen'),
      lastActivityColumn('lastDocumentEditAt', 'Last doc edit'),
      {
        id: 'address',
        accessorFn: (row) =>
          [row.streetAddress, row.city, row.state, row.zipCode, row.country].filter(Boolean).join(', '),
        header: ({ column }) => <DataTableColumnHeader column={column} label="Address" />,
        cell: ({ getValue }) => {
          const address = getValue<string>();
          return <span className="text-sm text-gray-600">{address || '—'}</span>;
        },
        meta: { label: 'Address' },
      },
      {
        id: 'tShirtSize',
        accessorKey: 'tShirtSize',
        header: ({ column }) => <DataTableColumnHeader column={column} label="T-Shirt" />,
        cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.tShirtSize ?? '—'}</span>,
        meta: { label: 'T-Shirt' },
      },
      {
        id: 'exodus90AppId',
        accessorKey: 'exodus90AppId',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Exodus90" />,
        cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.exodus90AppId ?? '—'}</span>,
        meta: { label: 'Exodus90 App ID' },
      },
      {
        id: 'onboarded',
        accessorKey: 'onboarded',
        header: ({ column }) => <DataTableColumnHeader column={column} label="Onboarded" />,
        cell: ({ row }) => (
          <Badge variant={row.original.onboarded ? 'success' : 'secondary'} size="xs">
            {row.original.onboarded ? 'Yes' : 'No'}
          </Badge>
        ),
        meta: { label: 'Onboarded' },
      },
      {
        id: 'actions',
        header: () => null,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open actions menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!user.banned ? (
                    <>
                      <DropdownMenuItem onClick={() => openProfileDialog(user)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openLanguageDialog(user)}>
                        <Globe className="h-4 w-4 mr-2" />
                        Edit Languages
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                        <Key className="h-4 w-4 mr-2" />
                        Reset Password
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openRoleDialog(user)}>
                        <Shield className="h-4 w-4 mr-2" />
                        Change Role
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => openBanDialog(user)}>
                        <Ban className="h-4 w-4 mr-2" />
                        Ban
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={() => openBanDialog(user)}>Unban</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // The dialog-open handlers only call state setters, so stale closures are
    // harmless — the memo only needs to react to the filter option lists.
    [languageOptions],
  );

  const { table } = useDataTable({
    data: searchedUsers,
    columns,
    // Deliberately client-side (not the server-side list-params stack used by
    // Documents/Projects): the last-seen / last-edit aggregates need
    // full-table scans regardless, the admin user count is small, and CSV
    // export operates on this same filtered/sorted view.
    initialState: {
      pagination: { pageIndex: 0, pageSize: 25 },
      sorting: [{ id: 'languages', desc: false }],
      columnVisibility: { address: false, tShirtSize: false, exodus90AppId: false, onboarded: false },
    },
    getRowId: (row) => row.id,
  });

  // Search and the active/banned toggle filter the data OUTSIDE the table's
  // filter pipeline, so the table doesn't reset pagination for them the way it
  // does for column filters — do it here (skipping mount so deep links keep
  // their page).
  const skipPageReset = useRef(true);
  useEffect(() => {
    if (skipPageReset.current) {
      skipPageReset.current = false;
      return;
    }
    table.setPageIndex(0);
  }, [search, userFilter, table]);

  const handleExportCsv = () => {
    const exportColumns = table
      .getVisibleLeafColumns()
      .filter((column) => column.id !== 'actions')
      .map((column) => ({
        id: column.id,
        label: (column.columnDef.meta?.label as string | undefined) ?? column.id,
      }));
    const rows = table.getSortedRowModel().rows.map((row) => row.original);

    if (rows.length === 0) {
      toast.error('No users to export for the current view.');
      return;
    }

    const csv = buildUserCsv(exportColumns, rows);
    downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exported ${rows.length} user${rows.length === 1 ? '' : 's'}`);
  };

  const passwordResetMessage = passwordResetInfo
    ? `Hey ${passwordResetInfo.name}, your new password is "${passwordResetInfo.password}" for your email ${passwordResetInfo.email}. Please change your password after logging in.`
    : '';

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="User Management" description="Manage users, roles, and invitations" />

      <div className="container mx-auto px-4 py-4">
        <Tabs defaultValue="users">
          <TabsList variant="line">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>

          {/* ── Users Tab ──────────────────────────────────── */}
          <TabsContent value="users">
            <div className="flex items-center justify-between gap-2 mb-4">
              <Tabs value={userFilter} onValueChange={(v) => setUserFilter(v as 'active' | 'banned')}>
                <TabsList>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="banned">Banned</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                placeholder="Search name, email, language…"
                value={search}
                onChange={(e) => setSearch(e.target.value || null)}
                className="h-9 w-72"
              />
            </div>

            <DataTable table={table}>
              <DataTableToolbar table={table}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" onClick={handleExportCsv}>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Exports what you see - the current filters, search, and visible columns. <br />
                      Adjust them or toggle columns in “View” to change the export.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DataTableToolbar>
            </DataTable>
          </TabsContent>

          {/* ── Invitations Tab ────────────────────────────── */}
          <TabsContent value="invitations">
            <div className="flex items-center justify-between mb-4">
              <Tabs value={invitationFilter} onValueChange={(v) => handleFilterChange(v as InvitationFilter)}>
                <TabsList>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="inactive">Inactive</TabsTrigger>
                </TabsList>
              </Tabs>
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
                              <span>Expires: {formatUnambiguousDate(inv.expiresAt)}</span>
                              <span>By: {inv.createdBy.name}</span>
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
                                        This will permanently invalidate this invitation link. Anyone with the link will
                                        no longer be able to register.
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
          if (!open) {
            setPasswordUser(null);
            setNewPassword('');
            setConfirmPassword('');
            setPasswordResetInfo(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {passwordResetInfo ? 'Password Reset' : `Reset Password for ${passwordUser?.name ?? ''}`}
            </DialogTitle>
          </DialogHeader>

          {passwordResetInfo ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Password updated. Copy this message and send it to the user:</p>
              <Textarea readOnly value={passwordResetMessage} rows={3} className="text-sm bg-gray-100" />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(passwordResetMessage);
                    toast.success('Message copied to clipboard');
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy message
                </Button>
                <Button type="button" onClick={() => setPasswordDialogOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
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
              <div>
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Re-enter the password"
                />
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Languages Dialog ────────────────────────── */}
      <Dialog
        open={languageDialogOpen}
        onOpenChange={(open) => {
          setLanguageDialogOpen(open);
          if (!open) {
            setLanguageUser(null);
            setSelectedLanguageIds([]);
          }
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
              <Button type="button" variant="outline" onClick={() => setLanguageDialogOpen(false)}>
                Cancel
              </Button>
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
              <Input
                id="admin-profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
              />
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
                <Input
                  id="admin-profile-city"
                  value={profileCity}
                  onChange={(e) => setProfileCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="admin-profile-state">State / Province</Label>
                <Input
                  id="admin-profile-state"
                  value={profileState}
                  onChange={(e) => setProfileState(e.target.value)}
                  placeholder="State or province"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="admin-profile-zip">Zip / Postal Code</Label>
                <Input
                  id="admin-profile-zip"
                  value={profileZip}
                  onChange={(e) => setProfileZip(e.target.value)}
                  placeholder="Zip code"
                />
              </div>
              <div>
                <Label htmlFor="admin-profile-country">Country</Label>
                <Input
                  id="admin-profile-country"
                  value={profileCountry}
                  onChange={(e) => setProfileCountry(e.target.value)}
                  placeholder="Country"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="admin-profile-tshirt">T-Shirt Size</Label>
              <Select
                value={profileTShirtSize || NONE_VALUE}
                onValueChange={(v) => setProfileTShirtSize(v === NONE_VALUE ? '' : v)}
              >
                <SelectTrigger id="admin-profile-tshirt">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                  {T_SHIRT_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
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
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !profileName.trim()}>
                {loading ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Ban / Unban Confirmation ─────────────────────── */}
      <AlertDialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{banTarget?.banned ? 'Unban User' : 'Ban User'}</AlertDialogTitle>
            <AlertDialogDescription>
              {banTarget?.banned
                ? `Are you sure you want to unban ${banTarget?.name}? They will be able to log in and access the system again.`
                : `Are you sure you want to ban ${banTarget?.name}? They will be signed out and unable to access the system.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!banTarget) return;
                if (banTarget.banned) {
                  handleUnbanUser(banTarget.id);
                } else {
                  handleBanUser(banTarget.id);
                }
                setBanTarget(null);
              }}
            >
              {banTarget?.banned ? 'Unban' : 'Ban'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Create Invitation Dialog ──────────────────────── */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetCreateDialog();
          else setCreateDialogOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdInviteUrl ? 'Invitation Created' : 'Create Invitation'}</DialogTitle>
          </DialogHeader>

          {createdInviteUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Share this link with the person you want to invite:</p>
              <div className="flex items-center gap-2">
                <Input value={createdInviteUrl} readOnly className="font-mono text-sm" />
                <Button type="button" variant="outline" size="sm" onClick={() => handleCopyUrl(createdInviteUrl)}>
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
                      <label
                        key={lang.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                      >
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
                  <p className="text-xs text-gray-500 mt-1">
                    Users registering with this link will be assigned these languages.
                  </p>
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
