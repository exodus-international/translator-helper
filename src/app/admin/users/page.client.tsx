"use client";

import { useState } from "react";
import { Role } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
import { updateUserRoleAction } from "@/domain/user/user.actions";
import { Shield, Ban, Unlock } from "lucide-react";

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

interface UsersClientProps {
  users: User[];
}

export default function UsersClient({ users: initialUsers }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | "">("");
  const [loading, setLoading] = useState(false);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setLoading(true);
    try {
      await updateUserRoleAction(userId, newRole);
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (error: any) {
      console.error("Error updating role:", error);
      alert(error.message || "Failed to update user role");
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!confirm("Are you sure you want to ban this user?")) {
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.admin.banUser({
        userId,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setUsers(
        users.map((u) =>
          u.id === userId
            ? {
                ...u,
                banned: true,
                banReason: result.data?.banReason || null,
                banExpires: result.data?.banExpires
                  ? new Date(result.data.banExpires)
                  : null,
              }
            : u
        )
      );
    } catch (error: any) {
      console.error("Error banning user:", error);
      alert(error.message || "Failed to ban user");
    } finally {
      setLoading(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    if (!confirm("Are you sure you want to unban this user?")) {
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.admin.unbanUser({
        userId,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      setUsers(
        users.map((u) =>
          u.id === userId
            ? { ...u, banned: false, banReason: null, banExpires: null }
            : u
        )
      );
    } catch (error: any) {
      console.error("Error unbanning user:", error);
      alert(error.message || "Failed to unban user");
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
      setSelectedRole("");
    } catch (error: any) {
      console.error("Error updating role:", error);
      alert(error.message || "Failed to update user role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-gray-600">Manage users, roles, and bans</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-4">
          {users.map((user) => (
            <Card key={user.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{user.name}</h3>
                    <Badge
                      variant={user.role === Role.DEPLOYER ? "primary" : "secondary"}
                    >
                      {user.role === Role.DEPLOYER ? (
                        <Shield className="h-3 w-3 mr-1" />
                      ) : null}
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
                    <p className="text-sm text-red-600 mt-1">
                      Reason: {user.banReason}
                    </p>
                  )}
                  {user.banned && user.banExpires && (
                    <p className="text-sm text-gray-500 mt-1">
                      Expires: {new Date(user.banExpires).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Joined: {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRoleDialog(user)}
                    disabled={loading}
                  >
                    Change Role
                  </Button>
                  {user.banned ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnbanUser(user.id)}
                      disabled={loading}
                    >
                      <Unlock className="h-4 w-4 mr-2" />
                      Unban
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBanUser(user.id)}
                      disabled={loading}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Ban
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) {
            setEditingUser(null);
            setSelectedRole("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRoleDialogSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Select Role
              </label>
              <Select
                value={selectedRole}
                onValueChange={(value) => setSelectedRole(value as Role)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.TRANSLATOR}>TRANSLATOR</SelectItem>
                  <SelectItem value={Role.DEPLOYER}>DEPLOYER</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !selectedRole}>
                {loading ? "Updating..." : "Update Role"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
