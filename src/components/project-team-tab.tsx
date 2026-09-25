'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Users } from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PROJECT_ROLE_LABELS } from '@/constants/project-role';
import { listTranslationProjectMembersAction } from '@/domain/user-language/user-language.actions';
import { ProjectRole } from '@/generated/prisma/enums';

/**
 * A roster, not an editor. Membership is language-scoped, so this table used to
 * be editable here, on the translation-project page and on the Users page -- and
 * each of them had to explain in small grey text that a change applied to
 * projects you were not looking at. The writes live at /languages/[code]/team
 * now, where the URL says the scope. A PM triaging a board still sees who is on
 * the language without leaving it.
 */
interface ProjectTeamTabProps {
  translationProjectId: string | null;
  canManage: boolean;
  selectedLanguageName: string;
  selectedLanguageCode: string;
  /** Reads the roster. Injectable so a component test can render it without a database. */
  loadMembers?: (translationProjectId: string) => Promise<Member[]>;
}

type Member = {
  id: string;
  userId: string;
  role: ProjectRole;
  user: { id: string; name: string; email: string; image: string | null };
};

export default function ProjectTeamTab({
  translationProjectId,
  canManage,
  selectedLanguageName,
  selectedLanguageCode,
  loadMembers = listTranslationProjectMembersAction,
}: ProjectTeamTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!translationProjectId) {
        setMembers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await loadMembers(translationProjectId);
        if (!cancelled) setMembers(data);
      } catch (error) {
        console.error('Error loading team members:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [translationProjectId, loadMembers]);

  if (!translationProjectId) {
    return (
      <div className="py-12 text-center">
        <Users className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
        <p className="text-muted-foreground">No translation project exists for {selectedLanguageName}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Loading team members…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">
            {selectedLanguageName} team ({members.length})
          </h2>
          <p className="text-muted-foreground text-sm">
            Members work on every {selectedLanguageName} project, not just this one.
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/languages/${encodeURIComponent(selectedLanguageCode)}/team`} />}
          >
            Manage team
            <ArrowUpRight />
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="py-12 text-center">
          <Users className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
          <p className="text-muted-foreground">No team members yet</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.user.name} image={member.user.image} email={member.user.email} />
                      <div>
                        <p className="text-sm font-medium">{member.user.name}</p>
                        <p className="text-muted-foreground text-xs">{member.user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{PROJECT_ROLE_LABELS[member.role]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
