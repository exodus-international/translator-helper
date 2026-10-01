'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import type { DocumentStatusConfig } from '@/constants/document-status';
import type { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { AlertCircle, BookOpen, ChevronDown, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThreadSidebar } from '../thread-sidebar';

export interface DocumentPanelProps {
  /** Folded, the panel is a rail; this is what the rail says and offers. */
  isZen: boolean;
  targetLanguageMissing: boolean;
  status: DocumentStatusConfig | null;
  openSuggestionsCount: number;
  onOpenGuide?: () => void;
  onToggleZen?: () => void;
  /** Unfolded: what the host puts in the panel, top to bottom. */
  panelActions?: ReactNode;
  header?: ReactNode;
  actions?: ReactNode;
  summary?: ReactNode;
  details?: ReactNode;
  view: 'threads' | 'details';
  onViewChange: (view: 'threads' | 'details') => void;
  /** The feedback list, when the document has or may take feedback. */
  threads: {
    show: boolean;
    suggestions: SuggestionWithUser[];
    currentUserId: string;
    translationContent: string;
    canCreateSuggestions: boolean;
    activeThreadId: string | null;
    disableReopen: boolean;
    onReply?: (suggestionId: string, content: string) => void;
    onApply?: (suggestionId: string) => void;
    onDismiss?: (suggestionId: string) => void;
    onReopen?: (suggestionId: string) => void;
    onEdit?: (suggestionId: string, data: { comment: string; proposedText?: string }) => Promise<void> | void;
    onSuggestionClick: (suggestion: SuggestionWithUser) => void;
    onCreateGeneralThread?: (comment: string) => void;
  };
}

/**
 * The document panel beside the panes: facts, workflow actions, status rows
 * and the feedback list, folding to a rail that still says where the
 * document stands.
 *
 * A sidebar painted with the editor's own tokens, so the third column reads
 * as another sheet on the workspace rather than a second kind of surface.
 * Folded it keeps a rail, the same affordance as the app nav's, which is what
 * replaced the "Show panel" button the pane header used to carry.
 */
export function DocumentPanel({
  isZen,
  targetLanguageMissing,
  status,
  openSuggestionsCount,
  onOpenGuide,
  onToggleZen,
  panelActions,
  header,
  actions,
  summary,
  details,
  view,
  onViewChange,
  threads,
}: DocumentPanelProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <Sidebar
      side="right"
      variant="floating"
      collapsible="icon"
      style={{ '--sidebar': 'var(--editor)', '--sidebar-border': 'var(--border)' } as React.CSSProperties}
    >
      {/* Folded: the rail. */}
      <SidebarContent className="hidden gap-1 p-2 group-data-[collapsible=icon]:flex">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Open document panel" onClick={toggleSidebar}>
              <PanelRightOpen />
              <span>Open</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {targetLanguageMissing && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Select a target language from the documents page to start translating"
                onClick={toggleSidebar}
              >
                <AlertCircle className="text-muted-foreground" />
                <span>No language</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {status && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={`Status: ${status.name}`} onClick={toggleSidebar}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color.hex }} />
                <span>{status.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`${openSuggestionsCount} open ${openSuggestionsCount === 1 ? 'comment' : 'comments'}`}
              onClick={() => {
                onViewChange('threads');
                toggleSidebar();
              }}
            >
              <MessageSquare />
              <span>Comments</span>
              {openSuggestionsCount > 0 && (
                <span className="absolute top-0 right-0 rounded-full bg-primary px-1 text-[10px] leading-4 tabular-nums text-primary-foreground">
                  {openSuggestionsCount}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Markdown guide" onClick={onOpenGuide}>
              <BookOpen />
              <span>Guide</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {onToggleZen && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={isZen ? 'Exit zen mode' : 'Zen mode'} onClick={onToggleZen}>
                {isZen ? <Minimize2 /> : <Maximize2 />}
                <span>{isZen ? 'Exit zen' : 'Zen mode'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      {/* The panel's own header, the height of the panes': one control, so
          folding is a button as well as the seam between columns. */}
      <SidebarHeader className="gap-0 p-0 group-data-[collapsible=icon]:hidden">
        <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-b px-2">
          {panelActions && <div className="mr-auto flex items-center gap-1">{panelActions}</div>}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label="Fold document panel"
            title="Fold document panel"
          >
            <PanelRightClose />
          </Button>
        </div>
      </SidebarHeader>

      {/* Unfolded: the facts, the actions and the status rows scroll together,
          so a tall panel never clips the button someone came to press. */}
      <SidebarContent className="gap-0 p-0 group-data-[collapsible=icon]:hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {header}
          {actions}
          {summary && (
            <div className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card [&>*]:px-3 [&>*]:py-2.5">
              {summary}
            </div>
          )}
          {/* The details are their own card. The header is the trigger, which
              is why the label is a span rather than CardTitle: a control that
              is a whole row cannot hold a div, and a title nobody can click
              plus a chevron to hit splits one target into two. */}
          {details && (
            <Card className="gap-0 overflow-hidden rounded-lg py-0 shadow-none">
              <Collapsible open={view === 'details'} onOpenChange={(open) => onViewChange(open ? 'details' : 'threads')}>
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      // ring-inset: the card clips what it contains, and a
                      // focus ring on the header's edge would be half cut.
                      className="group h-auto w-full justify-between rounded-none bg-muted/60 px-3 py-2 transition-colors focus-visible:ring-inset"
                    />
                  }
                >
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Details</span>
                  <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t [&>section:last-child]:border-b-0">{details}</CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {threads.show && (
            <div className="flex min-h-[16rem] flex-1 flex-col">
              <ThreadSidebar
                suggestions={threads.suggestions}
                currentUserId={threads.currentUserId}
                translationContent={threads.translationContent}
                canCreateSuggestions={threads.canCreateSuggestions}
                onReply={threads.onReply}
                onApply={threads.onApply}
                onDismiss={threads.onDismiss}
                onReopen={threads.onReopen}
                onEdit={threads.onEdit}
                onSuggestionClick={threads.onSuggestionClick}
                onCreateGeneralThread={threads.onCreateGeneralThread}
                activeThreadId={threads.activeThreadId}
                disableReopen={threads.disableReopen}
              />
            </div>
          )}
        </div>
      </SidebarContent>

      {/* Folding happens at the panel's own edge, the way the app nav's does.
          The rail is only reachable on desktop, where the collapsed panel is
          still on screen. */}
      <SidebarRail />
    </Sidebar>
  );
}
