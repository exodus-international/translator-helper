'use client';

import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDocumentStatusConfig } from '@/constants/document-status';
import { DocumentStatus } from '@/generated/prisma/enums';
import { Eye, Pencil, User, UserMinus, UserPlus } from 'lucide-react';

interface DocumentInfoCardProps {
  status?: DocumentStatus | null;
  translator?: { id: string; name: string | null; email: string; image?: string | null } | null;
  reviewer?: { id: string; name: string | null; email: string; image?: string | null } | null;
  language?: string;
  onAssignTranslator?: () => void;
  onUnassignTranslator?: () => void;
  onAssignReviewer?: () => void;
  onUnassignReviewer?: () => void;
}

export function DocumentInfoCard({
  status,
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
    <Card className="rounded-none border-l-0 border-t-0 shrink-0">
      <CardContent className=" space-y-2.5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusConfig.color.textClass}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusConfig.color.hex }} />
            {statusConfig.name}
          </span>
        </div>

        {/* Language */}
        {language && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Language</span>
            <span className="text-xs font-medium">{language}</span>
          </div>
        )}

        {/* Translator */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            Translator
          </span>
          {translator ? (
            onAssignTranslator ? (
              <div className="flex items-center gap-0.5 -mr-1.5">
                <button
                  onClick={onAssignTranslator}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted transition-colors cursor-pointer group"
                  title="Change translator"
                >
                  <UserAvatar name={translator.name} image={translator.image} email={translator.email} size="xs" />
                  <span className="text-xs font-medium">{translator.name}</span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {onUnassignTranslator && (
                  <button
                    onClick={onUnassignTranslator}
                    className="rounded-md p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Unassign translator"
                  >
                    <UserMinus className="h-3 w-3" />
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
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={onAssignTranslator}>
              <UserPlus className="h-3 w-3" />
              Assign
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground italic">Unassigned</span>
          )}
        </div>

        {/* Reviewer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" />
            Reviewer
          </span>
          {reviewer ? (
            onAssignReviewer ? (
              <div className="flex items-center gap-0.5 -mr-1.5">
                <button
                  onClick={onAssignReviewer}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted transition-colors cursor-pointer group"
                  title="Change reviewer"
                >
                  <UserAvatar name={reviewer.name} image={reviewer.image} email={reviewer.email} size="xs" />
                  <span className="text-xs font-medium">{reviewer.name}</span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {onUnassignReviewer && (
                  <button
                    onClick={onUnassignReviewer}
                    className="rounded-md p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    title="Unassign reviewer"
                  >
                    <UserMinus className="h-3 w-3" />
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
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={onAssignReviewer}>
              <UserPlus className="h-3 w-3" />
              Assign
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground italic">Not assigned</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
