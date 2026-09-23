'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { LanguageHealthPills } from '@/components/language-health-pills';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { countHealthProblems, languageHealth } from '@/domain/language/language-health';
import { createLanguageAction } from '@/domain/language/language.actions';
import type { LanguageListRow } from '@/domain/language/language.repository';
import { capture } from '@/lib/analytics';

/**
 * The index is the capability the old admin list never had: today nothing says
 * a language will throw at deploy or produce no audio until it does. Every
 * language is listed with the four checks that decide whether it can produce
 * anything, and how much of its work has shipped.
 */
export default function LanguagesIndexClient({ languages }: { languages: LanguageListRow[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () => languages.map((language) => ({ language, pills: languageHealth(language) })),
    [languages],
  );

  const unhealthy = rows.filter((row) => countHealthProblems(row.pills) > 0);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);

    try {
      const created = await createLanguageAction({ code, name, branchName });
      capture('language_created', { code: created.code });
      toast.success(`${created.name} added`);
      setDialogOpen(false);
      setCode('');
      setName('');
      setBranchName('');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add the language');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Languages"
        description="Every language, its team and whether it is configured to produce anything."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button />}>
              <Plus />
              Add language
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add language</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="code">Language code *</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="e.g., hr, cs, de"
                    required
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    This becomes the URL — /languages/{code || 'hr'} — and cannot be changed afterwards.
                  </p>
                </div>
                <div>
                  <Label htmlFor="name">Display name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g., Croatian"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="branchName">GitHub branch *</Label>
                  <Input
                    id="branchName"
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    placeholder="e.g., hr-croatian-translation"
                    required
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    Branch in the content repository. Required from the start, so a deploy is never the first thing to
                    find out it is missing.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Adding…' : 'Add language'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-col gap-4 px-4 py-4">
        {unhealthy.length > 0 && (
          <div className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
            <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-warning text-xs">
              <span className="font-semibold">
                {unhealthy.length} {unhealthy.length === 1 ? 'language is' : 'languages are'} not fully configured.
              </span>{' '}
              A missing branch fails at deploy, a missing voice generates no audio, and a language with no project
              manager cannot be managed by anyone.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border">
          <div className="bg-muted/50 text-muted-foreground hidden gap-4 px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(18rem,1fr)_9rem_1.25rem]">
            <span>Language</span>
            <span>Configuration</span>
            <span>Deployed</span>
            <span />
          </div>

          {rows.map(({ language, pills }) => (
            <Link
              key={language.id}
              href={`/languages/${encodeURIComponent(language.code)}/settings`}
              className="hover:bg-muted/40 flex flex-col gap-2.5 border-t px-4 py-3.5 transition-colors lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(18rem,1fr)_9rem_1.25rem] lg:items-center lg:gap-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{language.name}</span>
                  <Badge variant="secondary">{language.code}</Badge>
                  {language.isSource && <Badge variant="outline">Source</Badge>}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {language.isSource
                    ? 'Documents originate here'
                    : `${language.memberCount === 0 ? 'No members' : `${language.memberCount} ${language.memberCount === 1 ? 'member' : 'members'}`} · ${language.projectCount} ${language.projectCount === 1 ? 'project' : 'projects'}`}
                </p>
              </div>

              {language.isSource ? (
                <p className="text-muted-foreground text-xs">
                  Nothing translates <em>into</em> English, so it has no team, no voice and no instructions — none of
                  the four checks apply.
                </p>
              ) : (
                <LanguageHealthPills pills={pills} />
              )}

              <div className={language.isSource ? 'hidden lg:block' : ''}>
                {language.isSource ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-semibold">{percent(language.deployedCount, language.versionCount)}%</span>
                      <span className="text-muted-foreground">
                        {language.deployedCount} / {language.versionCount}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-foreground h-full"
                        style={{ width: `${percent(language.deployedCount, language.versionCount)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              <ChevronRight className="text-muted-foreground hidden size-4 lg:block" aria-hidden />
            </Link>
          ))}
        </div>

        <p className="text-muted-foreground text-xs">
          Deployed counts translations at status DEPLOYED across every project the language appears in — the same
          definition the project Statistics tab calls progress.
        </p>
      </div>
    </>
  );
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
