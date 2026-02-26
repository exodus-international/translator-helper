'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DOCUMENT_STATUS_CONFIGS } from '@/constants/document-status';
import { DocumentStatus } from '@prisma/client';
import { Eye, FileText, Pencil, User, UserMinus, UserPlus } from 'lucide-react';

interface DocumentInfoCardProps {
  status: DocumentStatus;
  translator?: { id: string; name: string | null; email: string } | null;
  reviewer?: { id: string; name: string | null; email: string } | null;
  language?: string;
  onAssignTranslator?: () => void;
  onUnassignTranslator?: () => void;
  onAssignReviewer?: () => void;
  onUnassignReviewer?: () => void;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase();
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
  const statusConfig = DOCUMENT_STATUS_CONFIGS[status];

  return (
    <Card className="rounded-none border-l border-t-0 shrink-0">
      <CardHeader className="px-2 border-b pb-0">
        <CardTitle className="h-7 text-xs uppercase tracking-wider flex items-center">
          <FileText className="h-3.5 w-3.5" />
          Document Info
        </CardTitle>
      </CardHeader>
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
                  <Avatar size="xs" name={translator.name || undefined}>
                    <AvatarFallback name={translator.name || undefined} className="text-[10px]">
                      {getInitials(translator.name)}
                    </AvatarFallback>
                  </Avatar>
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
                <Avatar size="xs" name={translator.name || undefined}>
                  <AvatarFallback name={translator.name || undefined} className="text-[10px]">
                    {getInitials(translator.name)}
                  </AvatarFallback>
                </Avatar>
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
                  <Avatar size="xs" name={reviewer.name || undefined}>
                    <AvatarFallback name={reviewer.name || undefined} className="text-[10px]">
                      {getInitials(reviewer.name)}
                    </AvatarFallback>
                  </Avatar>
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
                <Avatar size="xs" name={reviewer.name || undefined}>
                  <AvatarFallback name={reviewer.name || undefined} className="text-[10px]">
                    {getInitials(reviewer.name)}
                  </AvatarFallback>
                </Avatar>
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
