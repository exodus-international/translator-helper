'use client';

import { GithubIcon } from '@/components/github-icon';
import { UserAvatar } from '@/components/user-avatar';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { SidebarSection } from '@/components/sidebar-section';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Languages,
  MessageSquarePlus,
  MessageSquareWarning,
  PenLine,
  Play,
  Rocket,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { ComponentType } from 'react';

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
  // lucide-react v1 dropped brand icons, so github_deployed vendors its own
  // SVG component; both it and LucideIcon render with just a className.
  icon: ComponentType<{ className?: string }>;
  colorClass: string;
}

const ACTION_MAP: Record<string, ActionConfig> = {
  created: { label: 'Created document', icon: FilePlus, colorClass: 'text-muted-foreground' },
  created_translation: { label: 'Started translation', icon: Languages, colorClass: 'text-info' },
  assigned_translation: { label: 'Assigned translation', icon: UserPlus, colorClass: 'text-info' },
  started_translation: { label: 'Resumed translation', icon: Play, colorClass: 'text-info' },
  edited: { label: 'Edited content', icon: PenLine, colorClass: 'text-muted-foreground' },
  submitted_for_review: { label: 'Submitted for review', icon: Send, colorClass: 'text-warning' },
  approved: { label: 'Approved', icon: CheckCircle2, colorClass: 'text-success' },
  requested_changes: { label: 'Requested changes', icon: MessageSquareWarning, colorClass: 'text-warning' },
  deployed: { label: 'Deployed', icon: Rocket, colorClass: 'text-hue-violet' },
  status_updated: { label: 'Changed status', icon: ArrowRightLeft, colorClass: 'text-muted-foreground' },
  github_deployed: { label: 'Deployed to GitHub', icon: GithubIcon, colorClass: 'text-hue-violet' },
  github_deploy_failed: { label: 'GitHub deploy failed', icon: AlertTriangle, colorClass: 'text-destructive' },
  audio_generation_started: { label: 'Started audio generation', icon: Volume2, colorClass: 'text-info' },
  audio_regeneration_requested: { label: 'Requested audio regeneration', icon: RotateCcw, colorClass: 'text-info' },
  audio_generated: { label: 'Audio generated', icon: Volume2, colorClass: 'text-success' },
  audio_generation_failed: { label: 'Audio generation failed', icon: AlertTriangle, colorClass: 'text-destructive' },
  audio_transcript_edited: { label: 'Edited the audio text', icon: PenLine, colorClass: 'text-info' },
  audio_transcript_kept: { label: 'Kept the edited audio text', icon: FileText, colorClass: 'text-info' },
  audio_transcript_reset: { label: 'Reset the audio text', icon: RotateCcw, colorClass: 'text-muted-foreground' },
  applied_suggestion: { label: 'Applied suggestion', icon: CheckCheck, colorClass: 'text-success' },
  reopened_suggestion: { label: 'Reopened suggestion', icon: RotateCcw, colorClass: 'text-warning' },
  dismissed_suggestion: { label: 'Dismissed suggestion', icon: XCircle, colorClass: 'text-muted-foreground' },
  created_suggestion: { label: 'Created suggestion', icon: MessageSquarePlus, colorClass: 'text-info' },
  edited_suggestion: { label: 'Edited suggestion', icon: PenLine, colorClass: 'text-muted-foreground' },
  deleted_suggestion: { label: 'Deleted suggestion', icon: Trash2, colorClass: 'text-destructive' },
};

const DEFAULT_CONFIG: ActionConfig = {
  label: 'Unknown action',
  icon: ArrowRightLeft,
  colorClass: 'text-muted-foreground',
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
    case 'audio_generation_started':
    case 'audio_regeneration_requested':
      return details.voice || null;
    case 'audio_transcript_edited':
      return details.characters ? `${details.characters} characters` : null;
    case 'github_deploy_failed':
    case 'audio_generation_failed':
      return details.error ? (details.error.length > 60 ? details.error.slice(0, 60) + '...' : details.error) : null;
    case 'created_suggestion':
    case 'deleted_suggestion':
    case 'dismissed_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const line = details.startLine
        ? details.startLine === details.endLine
          ? `L${details.startLine}`
          : `L${details.startLine}-${details.endLine}`
        : 'General';
      const comment = details.comment ? `'${details.comment}'` : null;
      return [type, line, comment].filter(Boolean).join(' · ');
    }
    case 'applied_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const range = details.range;
      const line = range?.startLine
        ? range.startLine === range.endLine
          ? `L${range.startLine}`
          : `L${range.startLine}-${range.endLine}`
        : null;
      return [type, line].filter(Boolean).join(' · ');
    }
    case 'reopened_suggestion': {
      const type = details.type === 'CHANGE' ? 'Change' : 'Comment';
      const reverted = details.reverted ? 'reverted' : null;
      return [type, reverted].filter(Boolean).join(' · ');
    }
    case 'edited_suggestion': {
      return details.comment ? `'${details.comment}'` : null;
    }
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

function CollapsedGroupRow({ group }: { group: CollapsedEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = group.config.icon;
  const representative = group.entries[0];
  const detailText = getDetailText(group.action, representative.details);
  const fullDate = group.lastTime.toLocaleString();
  const isCollapsible = group.count > 1;

  return (
    <div>
      <div className="flex items-start gap-3 text-sm py-1">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${group.config.colorClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium">{group.config.label}</span>
            {isCollapsible ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-0.5 text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                &times;{group.count}
              </button>
            ) : (
              detailText && <span className="text-muted-foreground">{detailText}</span>
            )}
            <span className="text-muted-foreground text-xs ml-auto shrink-0" title={fullDate}>
              {formatRelativeTime(group.lastTime)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserAvatar
              name={representative.user.name}
              image={representative.user.image}
              email={representative.user.email}
              size="xs"
            />
            <span>by {representative.user.name || representative.user.email}</span>
          </div>
        </div>
      </div>
      {isCollapsible && expanded && (
        <div className="ml-7 mt-1 mb-1 space-y-1 border-l-2 border-border pl-3">
          {group.entries.map((entry) => {
            const entryDetail = getDetailText(group.action, entry.details);
            const entryTime = new Date(entry.createdAt);
            return (
              <div key={entry.id} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                {entryDetail && <span>{entryDetail}</span>}
                <span className="text-muted-foreground ml-auto shrink-0" title={entryTime.toLocaleString()}>
                  {formatRelativeTime(entryTime)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ActivityLog({ entries, frame = 'card' }: ActivityLogProps & { frame?: 'card' | 'section' }) {
  if (!entries || entries.length === 0) return null;

  const collapsed = collapseEntries(entries);
  const rows = (
    <div className="space-y-2">
      {collapsed.map((group) => (
        <CollapsedGroupRow key={group.entries[0].id} group={group} />
      ))}
    </div>
  );

  if (frame === 'section') {
    return <SidebarSection title="Activity log">{rows}</SidebarSection>;
  }

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2">Activity Log</h3>
      {rows}
    </Card>
  );
}
