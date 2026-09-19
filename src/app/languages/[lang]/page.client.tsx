'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { LanguageTabs } from '@/components/language-tabs';
import { LanguageHealthPills } from '@/components/language-health-pills';
import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DOCUMENT_STATUS_CONFIGS, DOCUMENT_STATUS_SEQUENCE } from '@/constants/document-status';
import { PROJECT_ROLE_LABELS } from '@/constants/project-role';
import { ProjectRole } from '@/generated/prisma/enums';
import { countHealthProblems, type LanguageHealthPill } from '@/domain/language/language-health';
import type { LanguageProgress, LanguageProjectProgress } from '@/domain/language/language-progress';
import { formatLastActive } from '@/lib/format';
import { capture } from '@/lib/analytics';
import { useTrailStore } from '@/lib/page-trail';

interface LanguageOverviewClientProps {
  language: { code: string; name: string };
  progress: LanguageProgress;
  lastDeployAt: string | null;
  pills: LanguageHealthPill[];
  memberCount: number;
  roster: { id: string; role: ProjectRole; user: { name: string; email: string; image: string | null } }[];
}

export default function LanguageOverviewClient({
  language,
  progress,
  lastDeployAt,
  pills,
  memberCount,
  roster,
}: LanguageOverviewClientProps) {
  useEffect(() => {
    capture('language_page_viewed', { language: language.code, tab: 'overview' });
  }, [language.code]);

  const publishTrail = useTrailStore((s) => s.publish);
  useEffect(
    () => publishTrail([{ label: 'Languages', href: '/languages' }, { label: language.name }]),
    [publishTrail, language.name],
  );

  const problems = countHealthProblems(pills);
  const teamHref = `/languages/${encodeURIComponent(language.code)}/team`;

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
      >
        <LanguageTabs code={language.code} memberCount={memberCount} />
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                    Deployed across {progress.projects.length}{' '}
                    {progress.projects.length === 1 ? 'active project' : 'active projects'}
                  </p>
                  <p className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl leading-none font-bold">{progress.percent}%</span>
                    <span className="text-muted-foreground text-sm">
                      {progress.deployed} of {progress.documents}{' '}
                      {progress.documents === 1 ? 'document' : 'documents'}
                    </span>
                  </p>
                </div>
                <p className="text-muted-foreground max-w-xs text-xs sm:text-right">
                  Deployed only — the same definition the project Statistics tab calls progress.
                </p>
              </div>

              <div className="bg-muted mt-4 flex h-2 overflow-hidden rounded-full">
                {DOCUMENT_STATUS_SEQUENCE.map((status) => {
                  const count = progress.byStatus[status];
                  if (count === 0 || progress.documents === 0) return null;

                  return (
                    <div
                      key={status}
                      style={{
                        width: `${(count / progress.documents) * 100}%`,
                        background: DOCUMENT_STATUS_CONFIGS[status].color.hex,
                      }}
                      title={`${DOCUMENT_STATUS_CONFIGS[status].name}: ${count}`}
                    />
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {DOCUMENT_STATUS_SEQUENCE.map((status) => (
                  <div key={status}>
                    <p className="text-lg leading-none font-bold">{progress.byStatus[status]}</p>
                    <p className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ background: DOCUMENT_STATUS_CONFIGS[status].color.hex }}
                      />
                      <span className="text-muted-foreground text-xs">{DOCUMENT_STATUS_CONFIGS[status].name}</span>
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {progress.missingVersions > 0 && (
            <div className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
              <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-warning text-xs leading-5">
                <span className="font-semibold">
                  {progress.missingVersions}{' '}
                  {progress.missingVersions === 1 ? 'document has' : 'documents have'} no {language.name} version yet.
                </span>{' '}
                They count as untranslated above. A version is normally created when a document is added or a language
                joins a project, so a gap means something was written around both.
              </p>
            </div>
          )}

          <StatRow progress={progress} lastDeployAt={lastDeployAt} />

          <div className="overflow-hidden rounded-xl border">
            <div className="bg-muted/50 text-muted-foreground grid grid-cols-[minmax(0,1fr)_5.5rem] gap-4 px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem]">
              <span>Project</span>
              <span className="hidden sm:block">Progress</span>
              <span className="text-right">Deployed</span>
            </div>

            {progress.projects.length === 0 ? (
              <p className="text-muted-foreground border-t px-4 py-8 text-center text-sm">
                {language.name} is not in any active project.
              </p>
            ) : (
              progress.projects.map((project) => <ProjectRow key={project.id} project={project} />)
            )}

          </div>
        </div>

        <div className="flex flex-col gap-4 lg:w-72">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Configuration</CardTitle>
              {problems > 0 ? (
                <span className="border-warning/40 bg-warning/10 text-warning rounded-full border px-2 py-0.5 text-[11px]">
                  {problems} {problems === 1 ? 'problem' : 'problems'}
                </span>
              ) : (
                <span className="text-muted-foreground text-[11px]">All set</span>
              )}
            </CardHeader>
            <CardContent>
              <LanguageHealthPills pills={pills} className="flex-col items-start" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Team</CardTitle>
              <Link href={teamHref} className="text-muted-foreground hover:text-foreground text-xs">
                Manage →
              </Link>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {roster.length === 0 ? (
                <p className="text-muted-foreground text-xs">Nobody is on this language yet.</p>
              ) : (
                roster.map((member) => (
                  <div key={member.id} className="flex items-center gap-2.5">
                    <UserAvatar name={member.user.name} image={member.user.image} email={member.user.email} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs">{member.user.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {PROJECT_ROLE_LABELS[member.role]}
                    </Badge>
                  </div>
                ))
              )}
              {memberCount > roster.length && (
                <p className="text-muted-foreground text-xs">and {memberCount - roster.length} more</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * What the language has done in total, finished projects included -- the half
 * of the story the headline deliberately leaves out. Quiet by design: the one
 * hero figure on this page is the percentage above, and a row of equally loud
 * numbers would compete with it.
 */
function StatRow({ progress, lastDeployAt }: { progress: LanguageProgress; lastDeployAt: string | null }) {
  const { lifetime } = progress;

  const stats: { label: string; value: string; detail: string }[] = [
    {
      label: 'Projects',
      value: String(lifetime.projects),
      detail:
        lifetime.completedProjects > 0
          ? `${lifetime.completedProjects} completed`
          : 'none completed yet',
    },
    {
      label: 'Translated',
      value: `${lifetime.translatedPercent}%`,
      detail: `${lifetime.translated} of ${lifetime.documents} approved or deployed`,
    },
    {
      label: 'Deployed',
      value: String(lifetime.deployed),
      detail: lifetime.deployed === 1 ? 'document, all time' : 'documents, all time',
    },
    {
      label: 'Last deploy',
      value: lastDeployAt ? formatLastActive(lastDeployAt) : 'Never',
      detail: lastDeployAt ? 'to the content repository' : 'nothing has shipped yet',
    },
  ];

  return (
    <div className="rounded-xl border">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`px-4 py-3 ${index % 2 === 1 ? 'border-l' : ''} ${index > 1 ? 'border-t' : ''} sm:border-t-0 sm:not-first:border-l`}
          >
            <p className="text-muted-foreground text-xs">{stat.label}</p>
            <p className="mt-1 text-xl leading-none font-semibold">{stat.value}</p>
            <p className="text-muted-foreground mt-1.5 text-[11px] leading-4">{stat.detail}</p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
        All time, including completed projects — unlike the figure above, which counts active work only.
      </p>
    </div>
  );
}

function ProjectRow({ project }: { project: LanguageProjectProgress }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="hover:bg-muted/40 grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-4 border-t px-4 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {project.documents} {project.documents === 1 ? 'document' : 'documents'}
        </p>
      </div>
      <div className="bg-muted hidden h-1.5 overflow-hidden rounded-full sm:block">
        <div className="bg-foreground h-full" style={{ width: `${Math.max(project.percent, 1)}%` }} />
      </div>
      <p className="text-right text-xs">
        <span className="font-semibold">{project.percent}%</span>{' '}
        <span className="text-muted-foreground">
          {project.deployed}/{project.documents}
        </span>
      </p>
      <span className="sr-only">
        <ArrowUpRight />
      </span>
    </Link>
  );
}
