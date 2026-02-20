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
import { toast } from 'sonner';

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
  const [displayedStatus, setDisplayedStatus] = React.useState<DocumentStatus | null>(currentStatus);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Sync displayed status with prop when it changes
  React.useEffect(() => {
    setDisplayedStatus(currentStatus);
  }, [currentStatus]);

  const currentStatusConfig = getDocumentStatusConfig(displayedStatus);
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
    if (newStatus === displayedStatus || loading) return;

    // Check permission for DEPLOYED
    if (newStatus === DocumentStatus.DEPLOYED && !canDeployClient(user)) {
      toast.warning('Only deployers can deploy documents');
      return;
    }

    if (displayedStatus === DocumentStatus.DEPLOYED && !canDeployClient(user)) {
      toast.warning('Only deployers can change the status of a deployed document');
      return;
    }

    setLoading(true);

    // Show a loading toast for deploy (GitHub takes a few seconds)
    let deployToastId: string | number | undefined;
    if (newStatus === DocumentStatus.DEPLOYED) {
      deployToastId = toast.loading('Deploying to GitHub...');
    }

    try {
      const result = await updateDocumentVersionStatusAction(versionId, newStatus);

      // Show GitHub deploy feedback
      if (result.github) {
        if (deployToastId) toast.dismiss(deployToastId);
        if (result.github.status === 'success') {
          toast.success(result.github.prUrl ? `GitHub PR created successfully` : 'Deployed to GitHub successfully', {
            action: result.github.prUrl
              ? { label: 'Open PR', onClick: () => window.open(result.github!.prUrl, '_blank') }
              : undefined,
            duration: 8000,
          });
        } else if (result.github.status === 'failed') {
          toast.error(`GitHub deploy failed: ${result.github.error}`, { duration: 10000 });
        }
      } else if (deployToastId) {
        toast.dismiss(deployToastId);
      }

      // Update displayed status immediately for optimistic UI update
      setDisplayedStatus(newStatus);
      // Update parent state first so stepper and other components update immediately
      onStatusChange?.(newStatus);
      setOpen(false);

      // Navigate to the correct page based on the new status (only if needed)
      if (documentId) {
        const isTranslateStatus =
          newStatus === DocumentStatus.PENDING_TRANSLATION || newStatus === DocumentStatus.IN_PROGRESS;

        // Check current pathname to avoid unnecessary navigation
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const shouldBeOnTranslatePage = isTranslateStatus && languageId;
        const isOnTranslatePage = currentPath.includes('/translate');
        const isOnReviewPage = currentPath.includes('/review');

        // Only navigate if we need to switch between translate and review pages
        if (shouldBeOnTranslatePage && !isOnTranslatePage) {
          // Navigate to translate page
          router.push(`/documents/${documentId}/translate?lang=${languageId}&version=${versionId}`);
        } else if (!shouldBeOnTranslatePage && !isOnReviewPage) {
          // Navigate to review page for other statuses
          router.push(`/documents/${documentId}/review?version=${versionId}`);
        } else {
          // Already on the correct page, just refresh to get updated data
          router.refresh();
        }
      } else {
        // If no documentId provided, just reload
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    } catch (error: any) {
      if (deployToastId) toast.dismiss(deployToastId);
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const translatorCannotChangeDeployedDocumentStatus =
    user.role === 'TRANSLATOR' && displayedStatus === DocumentStatus.DEPLOYED;

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
            const isCurrentStatus = status === displayedStatus;

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
                  <span className="text-gray-500">{getTransitionLabel(displayedStatus, status)}</span>
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
