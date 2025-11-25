'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DOCUMENT_STATUS_SEQUENCE, getDocumentStatusConfig } from '@/constants/document-status';
import { updateDocumentVersionStatusAction } from '@/domain/document-version/document-version.actions';
import { canDeployClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { DocumentStatus } from '@prisma/client';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useState } from 'react';

interface StatusDropdownProps {
  currentStatus: DocumentStatus | null;
  versionId: string;
  user: SessionUser;
  documentId?: string; // For navigation after status change
  languageId?: string; // For navigation after status change
  onStatusChange?: (newStatus: DocumentStatus) => void;
  allowedStatuses?: DocumentStatus[]; // For future permission filtering
  disabled?: boolean;
}

export function StatusDropdown({
  currentStatus,
  versionId,
  user,
  documentId,
  languageId,
  onStatusChange,
  allowedStatuses,
  disabled = false,
}: StatusDropdownProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentStatusConfig = getDocumentStatusConfig(currentStatus);
  const CurrentStatusIcon = currentStatusConfig.icon;

  // Filter available statuses based on permissions and allowedStatuses prop
  const availableStatuses = React.useMemo(() => {
    let statuses = DOCUMENT_STATUS_SEQUENCE;

    // Filter by allowedStatuses if provided
    if (allowedStatuses) {
      statuses = statuses.filter((status) => allowedStatuses.includes(status));
    }

    // Filter out DEPLOYED if user doesn't have permission
    if (!canDeployClient(user)) {
      statuses = statuses.filter((status) => status !== DocumentStatus.DEPLOYED);
    }

    return statuses;
  }, [allowedStatuses, user]);

  const transitionLabels: Partial<Record<DocumentStatus, string>> = {
    [DocumentStatus.IN_PROGRESS]: 'Start translation',
    [DocumentStatus.PENDING_REVIEW]: 'Give me feedback',
    [DocumentStatus.APPROVED]: 'Approve',
    [DocumentStatus.DEPLOYED]: 'Deploy',
  };

  const getTransitionLabel = (_from: DocumentStatus | null | undefined, to: DocumentStatus) => {
    return transitionLabels[to] ?? 'Transition to';
  };

  const handleStatusChange = async (newStatus: DocumentStatus) => {
    if (newStatus === currentStatus || loading) return;

    // Check permission for DEPLOYED
    if (newStatus === DocumentStatus.DEPLOYED && !canDeployClient(user)) {
      alert('Only deployers can deploy documents');
      return;
    }

    if (currentStatus === DocumentStatus.DEPLOYED && !canDeployClient(user)) {
      // alert('Only deployers can change the status of a deployed document');
      return;
    }

    setLoading(true);
    try {
      await updateDocumentVersionStatusAction(versionId, newStatus);
      onStatusChange?.(newStatus);
      setOpen(false);

      // Navigate to the correct page based on the new status
      if (documentId) {
        const isTranslateStatus =
          newStatus === DocumentStatus.PENDING_TRANSLATION || newStatus === DocumentStatus.IN_PROGRESS;

        if (isTranslateStatus && languageId) {
          // Navigate to translate page
          router.push(`/documents/${documentId}/translate?lang=${languageId}&version=${versionId}`);
        } else {
          // Navigate to review page for other statuses
          router.push(`/documents/${documentId}/review?version=${versionId}`);
        }
        // Refresh to get updated data
        router.refresh();
      } else {
        // If no documentId provided, just reload
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(error.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const translatorCannotChangeDeployedDocumentStatus =
    user.role === 'TRANSLATOR' && currentStatus === DocumentStatus.DEPLOYED;

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    return (
      <Button
        variant="outline"
        disabled={disabled || loading || translatorCannotChangeDeployedDocumentStatus}
        className={cn(
          'gap-2 h-auto py-1.5 px-3',
          currentStatusConfig.color.badgeClass,
          'border',
          'hover:opacity-90',
          'font-medium',
        )}
      >
        <CurrentStatusIcon className={cn('h-3.5 w-3.5', currentStatusConfig.color.textClass)} />
        <span className={cn('font-medium', currentStatusConfig.color.textClass)}>{currentStatusConfig.name}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </Button>
    );
  }

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          variant="outline"
          disabled={disabled || loading || translatorCannotChangeDeployedDocumentStatus}
          className={cn(
            'gap-2 h-auto py-1.5 px-3',
            currentStatusConfig.color.badgeClass,
            'border',
            'hover:opacity-90',
            'font-medium',
          )}
        >
          <CurrentStatusIcon className={cn('h-3.5 w-3.5', currentStatusConfig.color.textClass)} />
          <span className={cn('font-medium', currentStatusConfig.color.textClass)}>{currentStatusConfig.name}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className="min-w-[200px] bg-white rounded-md border shadow-md p-1 z-50"
          align="start"
          sideOffset={4}
        >
          {availableStatuses.map((status) => {
            const statusConfig = getDocumentStatusConfig(status);
            const StatusIcon = statusConfig.icon;
            const isCurrentStatus = status === currentStatus;

            const isDisabled =
              isCurrentStatus || loading || (user.role === 'TRANSLATOR' && status === DocumentStatus.DEPLOYED);

            return (
              <DropdownMenuPrimitive.Item
                key={status}
                disabled={isDisabled}
                className={cn(
                  'relative flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer outline-none',
                  'hover:bg-gray-100 focus:bg-gray-100',
                  isDisabled && 'opacity-50 cursor-not-allowed',
                  isCurrentStatus && 'bg-blue-50',
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!isDisabled) {
                    handleStatusChange(status);
                  }
                }}
              >
                {isCurrentStatus && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-r" />}
                <div className="flex w-full justify-between items-center gap-2">
                  <span className="text-gray-500">{getTransitionLabel(currentStatus, status)}</span>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    <Badge variant="secondary" className={cn('gap-1', statusConfig.color.badgeClass, 'justify-start')}>
                      <StatusIcon className={cn('h-3.5 w-3.5', statusConfig.color.textClass)} />
                      <span className={cn('font-medium', statusConfig.color.textClass)}>{statusConfig.name}</span>
                    </Badge>
                  </div>
                </div>
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
