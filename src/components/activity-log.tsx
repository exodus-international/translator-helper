'use client';

import { Card } from '@/components/ui/card';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCheck,
  CheckCircle2,
  FilePlus,
  Github,
  Languages,
  MessageSquareWarning,
  PenLine,
  Play,
  Rocket,
  Send,
  UserPlus,
} from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

interface ActivityLogEntry {
  id: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string | Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
}

interface ActivityLogProps {
  entries: ActivityLogEntry[];
}

interface ActionConfig {
  label: string;
  icon: LucideIcon;
  colorClass: string;
}

const ACTION_MAP: Record<string, ActionConfig> = {
  created: { label: 'Created document', icon: FilePlus, colorClass: 'text-gray-500' },
  created_translation: { label: 'Started translation', icon: Languages, colorClass: 'text-blue-500' },
  assigned_translation: { label: 'Assigned translation', icon: UserPlus, colorClass: 'text-blue-500' },
  started_translation: { label: 'Resumed translation', icon: Play, colorClass: 'text-blue-500' },
  edited: { label: 'Edited content', icon: PenLine, colorClass: 'text-gray-500' },
  submitted_for_review: { label: 'Submitted for review', icon: Send, colorClass: 'text-yellow-500' },
  approved: { label: 'Approved', icon: CheckCircle2, colorClass: 'text-green-500' },
  requested_changes: { label: 'Requested changes', icon: MessageSquareWarning, colorClass: 'text-orange-500' },
  deployed: { label: 'Deployed', icon: Rocket, colorClass: 'text-violet-500' },
  status_updated: { label: 'Changed status', icon: ArrowRightLeft, colorClass: 'text-gray-500' },
  github_deployed: { label: 'Deployed to GitHub', icon: Github, colorClass: 'text-violet-500' },
  github_deploy_failed: { label: 'GitHub deploy failed', icon: AlertTriangle, colorClass: 'text-red-500' },
  applied_suggestion: { label: 'Applied suggestion', icon: CheckCheck, colorClass: 'text-green-500' },
};

const DEFAULT_CONFIG: ActionConfig = {
  label: 'Unknown action',
  icon: ArrowRightLeft,
  colorClass: 'text-gray-400',
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    PENDING_TRANSLATION: 'Pending Translation',
    IN_PROGRESS: 'In Progress',
    PENDING_REVIEW: 'Pending Review',
    APPROVED: 'Approved',
    DEPLOYED: 'Deployed',
  };
  return statusLabels[status] || status;
}

function getDetailText(action: string, details: Record<string, any> | null): string | null {
  if (!details || Object.keys(details).length === 0) return null;

  switch (action) {
    case 'edited':
      return null;
    case 'status_updated':
      return details.status ? `\u2192 ${getStatusLabel(details.status)}` : null;
    case 'created':
      return details.title || null;
    case 'approved':
    case 'requested_changes':
      return details.hasComment ? 'with comment' : null;
    case 'started_translation':
    case 'created_translation':
    case 'assigned_translation':
      return details.language || null;
    case 'github_deploy_failed':
      return details.error ? (details.error.length > 60 ? details.error.slice(0, 60) + '...' : details.error) : null;
    default:
      return null;
  }
}

interface CollapsedEntry {
  entries: ActivityLogEntry[];
  action: string;
  userId: string;
  config: ActionConfig;
  count: number;
  firstTime: Date;
  lastTime: Date;
}

function collapseEntries(entries: ActivityLogEntry[]): CollapsedEntry[] {
  const result: CollapsedEntry[] = [];

  for (const entry of entries) {
    const last = result[result.length - 1];
    const entryTime = new Date(entry.createdAt);

    if (last && last.action === entry.action && last.userId === entry.user.id) {
      last.entries.push(entry);
      last.count++;
      // entries are desc order, so this entry is older
      last.firstTime = entryTime;
    } else {
      result.push({
        entries: [entry],
        action: entry.action,
        userId: entry.user.id,
        config: ACTION_MAP[entry.action] || DEFAULT_CONFIG,
        count: 1,
        firstTime: entryTime,
        lastTime: entryTime,
      });
    }
  }

  return result;
}

export function ActivityLog({ entries }: ActivityLogProps) {
  if (!entries || entries.length === 0) return null;

  const collapsed = collapseEntries(entries);

  return (
    <Card className="mt-6 p-6">
      <h3 className="text-lg font-semibold mb-4">Activity Log</h3>
      <div className="space-y-2">
        {collapsed.map((group) => {
          const Icon = group.config.icon;
          const representative = group.entries[0];
          const detailText = getDetailText(group.action, representative.details);
          const fullDate = group.lastTime.toLocaleString();

          return (
            <div key={representative.id} className="flex items-start gap-3 text-sm py-1">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${group.config.colorClass}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">{group.config.label}</span>
                  {group.count > 1 && (
                    <span className="text-gray-400 text-xs">(&times;{group.count})</span>
                  )}
                  {detailText && (
                    <span className="text-gray-500">{detailText}</span>
                  )}
                  <span
                    className="text-gray-400 text-xs ml-auto shrink-0"
                    title={fullDate}
                  >
                    {formatRelativeTime(group.lastTime)}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  by {representative.user.name || representative.user.email}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
