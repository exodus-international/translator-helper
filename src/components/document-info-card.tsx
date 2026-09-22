'use client';

import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDocumentStatusConfig } from '@/constants/document-status';
import { DocumentStatus } from '@/generated/prisma/enums';
import { CalendarDays, CircleDot, Eye, Languages, Pencil, User, UserMinus, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface DocumentInfoCardProps {
  status?: DocumentStatus | null;
  /**
   * The status row's control — the status dropdown, in practice. The card only
   * reserves the row; who owns the transition stays with the editor.
   */
  statusControl?: ReactNode;
  /**
   * The numbers worth a glance — version, words, comments, when it last moved —
   * as one line. They are reference, not the point of the panel: as a grid of
   * tiles they took the eye before the status did.
   */
  meta?: string;
  translator?: { id: string; name: string | null; email: string; image?: string | null } | null;
  reviewer?: { id: string; name: string | null; email: string; image?: string | null } | null;
  language?: string;
  /** When this version is due, as the assignment carried it. */
  deadline?: Date | string | null;
  /** When the review is due, if it has a date of its own. */
  reviewDeadline?: Date | string | null;
  /** Opens the modal that sets or clears the deadline. Absent for readers. */
  onEditDeadline?: () => void;
  onAssignTranslator?: () => void;
  onUnassignTranslator?: () => void;
  onAssignReviewer?: () => void;
  onUnassignReviewer?: () => void;
}

/**
 * The facts about this version as one card: a label / value row per field,
 * hairline-divided, with the dry numbers in a line underneath. The panel
 * around it supplies the surface and the width, so the card only owns the
 * structure.
 */
export function DocumentInfoCard({
  status,
  statusControl,
  meta,
  translator,
  reviewer,
  language,
  deadline,
  reviewDeadline,
  onEditDeadline,
  onAssignTranslator,
  onUnassignTranslator,
  onAssignReviewer,
  onUnassignReviewer,
}: DocumentInfoCardProps) {
  const statusConfig = getDocumentStatusConfig(status);

  return (
    <div className="flex flex-col gap-3">
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

          {/* Deadline */}
          <Row icon={CalendarDays} label="Deadline">
            {onEditDeadline ? (
              // The row is the way in: a value that can be set is a value that
              // can be changed, and the pencil only says so on hover.
              <button
                onClick={onEditDeadline}
                className="group -mr-1.5 flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                title="Change deadline"
              >
                {deadline ? (
                  <span className="text-xs font-medium">{new Date(deadline).toLocaleDateString()}</span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Not set</span>
                )}
                <Pencil className="size-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : deadline ? (
              <span className="text-xs font-medium">{new Date(deadline).toLocaleDateString()}</span>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not set</span>
            )}
          </Row>

          {/* Review deadline: set with the reviewer, so it is changed there too. */}
          {reviewDeadline && (
            <Row icon={CalendarDays} label="Review due">
              {onAssignReviewer ? (
                <button
                  onClick={onAssignReviewer}
                  className="group -mr-1.5 flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted"
                  title="Change review deadline"
                >
                  <span className="text-xs font-medium">{new Date(reviewDeadline).toLocaleDateString()}</span>
                  <Pencil className="size-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ) : (
                <span className="text-xs font-medium">{new Date(reviewDeadline).toLocaleDateString()}</span>
              )}
            </Row>
          )}
        </CardContent>
      </Card>

      {meta && <p className="px-1 text-[11px] text-muted-foreground">{meta}</p>}
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
