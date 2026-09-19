'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { LanguageTabs } from '@/components/language-tabs';
import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECT_ROLE_LABELS, PROJECT_ROLE_SEQUENCE } from '@/constants/project-role';
import { ProjectRole } from '@/generated/prisma/enums';
import { removeLanguageMemberAction, setLanguageMemberRoleAction } from '@/domain/user-language/user-language.actions';
import { capture } from '@/lib/analytics';
import { useTrailStore } from '@/lib/page-trail';

interface Member {
  id: string;
  userId: string;
  role: ProjectRole;
  user: { id: string; name: string; email: string; image: string | null };
  openWork: number;
}

interface LanguageTeamClientProps {
  language: { id: string; code: string; name: string };
  members: Member[];
  users: { id: string; name: string; email: string }[];
}

export default function LanguageTeamClient({ language, members, users }: LanguageTeamClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<ProjectRole>(ProjectRole.TRANSLATOR);
  const [pending, setPending] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [demoting, setDemoting] = useState<{ member: Member; role: ProjectRole } | null>(null);

  useEffect(() => {
    capture('language_page_viewed', { language: language.code, tab: 'team' });
  }, [language.code]);

  const publishTrail = useTrailStore((s) => s.publish);
  useEffect(
    () =>
      publishTrail([
        { label: 'Languages', href: '/languages' },
        { label: language.name, href: `/languages/${encodeURIComponent(language.code)}` },
        { label: 'Team' },
      ]),
    [publishTrail, language.code, language.name],
  );

  const managers = members.filter((member) => member.role === ProjectRole.PROJECT_MANAGER);
  const available = users.filter((candidate) => !members.some((member) => member.userId === candidate.id));

  /** The last manager stepping down leaves nobody who can manage the language. */
  const isLastManager = (member: Member) =>
    member.role === ProjectRole.PROJECT_MANAGER && managers.length === 1;

  const handleRoleChange = async (member: Member, role: ProjectRole) => {
    if (role === member.role) return;

    // The last manager stepping down is worth a sentence before it happens,
    // not a toast afterwards. Everything else applies straight away.
    if (isLastManager(member) && role !== ProjectRole.PROJECT_MANAGER) {
      setDemoting({ member, role });
      return;
    }

    await applyRole(member, role);
  };

  const applyRole = async (member: Member, role: ProjectRole) => {
    setPending(member.userId);
    try {
      await setLanguageMemberRoleAction({ languageId: language.id, userId: member.userId, role });
      capture('language_member_role_changed', { role });
      toast.success(`${member.user.name} is now a ${PROJECT_ROLE_LABELS[role]}`);
      setDemoting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change the role');
    } finally {
      setPending(null);
    }
  };

  const handleAdd = async () => {
    if (!newUserId) return;

    setPending('new');
    try {
      await setLanguageMemberRoleAction({ languageId: language.id, userId: newUserId, role: newRole });
      capture('language_member_added', { role: newRole });
      toast.success(`Added to the ${language.name} team`);
      setAddOpen(false);
      setNewUserId('');
      setNewRole(ProjectRole.TRANSLATOR);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add the member');
    } finally {
      setPending(null);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;

    setPending(removing.userId);
    try {
      await removeLanguageMemberAction({ languageId: language.id, userId: removing.userId });
      capture('language_member_removed', { open_work: removing.openWork });
      toast.success(`${removing.user.name} removed from the ${language.name} team`);
      setRemoving(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove the member');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {language.name}
            <Badge variant="secondary">{language.code}</Badge>
          </span>
        }
        description={`Everything scoped to ${language.name} lives here.`}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button />}>
              <Plus />
              Add member
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a {language.name} member</DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <Label>User</Label>
                  <Select
                    value={newUserId || null}
                    onValueChange={(value) => setNewUserId(value ?? '')}
                    items={Object.fromEntries(available.map((u) => [u.id, `${u.name} (${u.email})`]))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name} ({candidate.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role</Label>
                  <RoleSelect value={newRole} onChange={setNewRole} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={!newUserId || pending === 'new'}>
                  {pending === 'new' ? 'Adding…' : 'Add member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        <LanguageTabs code={language.code} memberCount={members.length} />
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 py-4">
        {managers.length === 0 && members.length > 0 && (
          <div className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
            <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-warning text-xs">
              <span className="font-semibold">No project manager.</span> Nobody can manage {language.name} until
              someone here is given that role.
            </p>
          </div>
        )}

        <div className="text-muted-foreground bg-muted/40 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-xs">
            A role here applies to <span className="text-foreground font-medium">every {language.name} project</span>.
            This is the only place it can be changed.
          </p>
        </div>

        {members.length === 0 ? (
          <div className="rounded-xl border px-4 py-12 text-center">
            <p className="text-muted-foreground text-sm">Nobody is on the {language.name} team yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="bg-muted/50 text-muted-foreground hidden gap-4 px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase sm:grid sm:grid-cols-[minmax(0,1fr)_11rem_7rem_2.5rem]">
              <span>Member</span>
              <span>Role</span>
              <span>Open work</span>
              <span />
            </div>

            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 border-t px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_11rem_7rem_2.5rem] sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={member.user.name} image={member.user.image} email={member.user.email} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.user.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{member.user.email}</p>
                  </div>
                </div>

                <RoleSelect
                  value={member.role}
                  disabled={pending === member.userId}
                  onChange={(role) => handleRoleChange(member, role)}
                />

                <p className={member.openWork > 0 ? 'text-sm' : 'text-muted-foreground text-sm'}>
                  {member.openWork > 0 ? `${member.openWork} open` : 'Nothing open'}
                </p>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.user.name}`}
                  className="justify-self-start sm:justify-self-auto"
                  disabled={pending === member.userId}
                  onClick={() => setRemoving(member)}
                >
                  <Trash2 className="text-muted-foreground size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Open work counts versions in {language.name} where the member is the translator or the reviewer and the
          status is neither approved nor deployed — the same rule the dashboard&apos;s My Work uses.
        </p>
      </div>

      <Dialog open={!!demoting} onOpenChange={(open) => !open && setDemoting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {demoting?.member.user.name}&apos;s role?</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3 text-sm">
            <p>
              {demoting?.member.user.name} is the only Project Manager in {language.name}. Making them{' '}
              {demoting && `a ${PROJECT_ROLE_LABELS[demoting.role]}`} leaves nobody who can manage it — no deploys, no
              assignments, until someone is promoted.
            </p>
            <p className="text-muted-foreground">You can promote someone else at any time.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoting(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => demoting && applyRole(demoting.member, demoting.role)}
              disabled={pending === demoting?.member.userId}
            >
              {pending === demoting?.member.userId ? 'Changing…' : 'Change role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.user.name} from {language.name}?</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3 text-sm">
            {removing && removing.openWork > 0 ? (
              <p>
                {removing.user.name} has{' '}
                <span className="font-semibold">
                  {removing.openWork} open {removing.openWork === 1 ? 'assignment' : 'assignments'}
                </span>{' '}
                in {language.name}. Removing them leaves that work unassigned — the documents keep their content, but
                nobody is on the hook for them.
              </p>
            ) : (
              <p>{removing?.user.name} has nothing open in {language.name}.</p>
            )}
            {removing && isLastManager(removing) && (
              <p className="text-warning">
                They are the only Project Manager. Removing them leaves nobody who can manage {language.name}.
              </p>
            )}
            <p className="text-muted-foreground">
              This removes their access to every {language.name} project, not just one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={pending === removing?.userId}>
              {pending === removing?.userId ? 'Removing…' : 'Remove from team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange((v ?? value) as ProjectRole)}
      items={PROJECT_ROLE_LABELS}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Select role" />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_ROLE_SEQUENCE.map((role) => (
          <SelectItem key={role} value={role}>
            {PROJECT_ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
