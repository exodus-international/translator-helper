'use client';

import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDocumentStatusConfig } from '@/constants/document-status';
import { DocumentStatus } from '@/generated/prisma/enums';
import { CircleDot, Eye, Languages, Pencil, User, UserMinus, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface DocumentStat {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface DocumentInfoCardProps {
  status?: DocumentStatus | null;
  /**
   * The status row's control — the status dropdown, in practice. The card only
   * reserves the row; who owns the transition stays with the editor.
   */
  statusControl?: ReactNode;
  /** A couple of numbers worth glancing at, in the detail page's tile grid. */
  stats?: DocumentStat[];
  translator?: { id: string; name: string | null; email: string; image?: string | null } | null;
  reviewer?: { id: string; name: string | null; email: string; image?: string | null } | null;
  language?: string;
  onAssignTranslator?: () => void;
  onUnassignTranslator?: () => void;
  onAssignReviewer?: () => void;
  onUnassignReviewer?: () => void;
}

/**
 * The facts about this version as one card: stat tiles on top, then a label /
 * value row per field, hairline-divided. The panel around it supplies the
 * surface and the width, so the card only owns the structure.
 */
export function DocumentInfoCard({
  status,
  statusControl,
  stats,
  translator,
  reviewer,
  language,
  onAssignTranslator,
  onUnassignTranslator,
  onAssignReviewer,
  onUnassignReviewer,
}: DocumentInfoCardProps) {
  const statusConfig = getDocumentStatusConfig(status);

  return (
    <div className="flex flex-col gap-3">
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-1 bg-card p-3">
              <span className="truncate text-[11px] text-muted-foreground">{stat.label}</span>
              <span className="truncate text-base font-semibold tabular-nums">{stat.value}</span>
              {stat.hint && <span className="truncate text-[11px] text-muted-foreground">{stat.hint}</span>}
            </div>
          ))}
        </div>
      )}

      <Card className="shrink-0 gap-0 overflow-hidden rounded-lg bg-card py-0 shadow-none">
        <CardContent className="divide-y p-0">
          {/* Status */}
          <Row icon={CircleDot} label="Status">
            {statusControl ?? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusConfig.color.textClass}`}>
                <span className="size-2 rounded-full" style={{ backgroundColor: statusConfig.color.hex }} />
                {statusConfig.name}
              </span>
            )}
          </Row>

          {/* Language */}
          {language && <Row icon={Languages} label="Language" value={language} />}

          {/* Translator */}
          <Row icon={User} label="Translator">
            {translator ? (
              onAssignTranslator ? (
                <div className="-mr-1.5 flex items-center gap-0.5">
                  <button
                    onClick={onAssignTranslator}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                    title="Change translator"
                  >
                    <UserAvatar name={translator.name} image={translator.image} email={translator.email} size="xs" />
                    <span className="text-xs font-medium">{translator.name}</span>
                    <Pencil className="size-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                  {onUnassignTranslator && (
                    <button
                      onClick={onUnassignTranslator}
                      className="cursor-pointer rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Unassign translator"
                    >
                      <UserMinus className="size-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <UserAvatar name={translator.name} image={translator.image} email={translator.email} size="xs" />
                  <span className="text-xs font-medium">{translator.name}</span>
                </div>
              )
            ) : onAssignTranslator ? (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onAssignTranslator}>
                <UserPlus className="size-3" />
                Assign
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">Unassigned</span>
            )}
          </Row>

          {/* Reviewer */}
          <Row icon={Eye} label="Reviewer">
            {reviewer ? (
              onAssignReviewer ? (
                <div className="-mr-1.5 flex items-center gap-0.5">
                  <button
                    onClick={onAssignReviewer}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                    title="Change reviewer"
                  >
                    <UserAvatar name={reviewer.name} image={reviewer.image} email={reviewer.email} size="xs" />
                    <span className="text-xs font-medium">{reviewer.name}</span>
                    <Pencil className="size-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                  {onUnassignReviewer && (
                    <button
                      onClick={onUnassignReviewer}
                      className="cursor-pointer rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Unassign reviewer"
                    >
                      <UserMinus className="size-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <UserAvatar name={reviewer.name} image={reviewer.image} email={reviewer.email} size="xs" />
                  <span className="text-xs font-medium">{reviewer.name}</span>
                </div>
              )
            ) : onAssignReviewer ? (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onAssignReviewer}>
                <UserPlus className="size-3" />
                Assign
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not assigned</span>
            )}
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

/** One fact: a muted labelled icon on the left, whatever it resolves to on the right. */
function Row({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      {children ?? <span className="text-xs font-medium">{value}</span>}
    </div>
  );
}
