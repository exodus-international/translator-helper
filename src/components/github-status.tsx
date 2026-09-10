'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SidebarSection } from '@/components/sidebar-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, ExternalLink, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { getGitHubCommitsForVersionAction } from '@/domain/github/github.actions';
import { deployToGitHubAction } from '@/domain/github/github.actions';
import { capture } from '@/lib/analytics';
import { toast } from 'sonner';

interface GitHubStatusProps {
  documentVersionId: string;
  isDeployed: boolean;
  /** One-line summary row for the sidebar instead of the full card. */
  compact?: boolean;
  /** `section` renders in the flat sidebar frame; `card` is the standalone card. */
  frame?: 'card' | 'section';
}

interface GitHubCommitData {
  id: string;
  commitSha: string;
  branchName: string;
  filePath: string;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: 'OPEN' | 'MERGED' | 'CLOSED' | null;
  errorMessage: string | null;
  createdAt: string | Date;
}

/**
 * Badge's variants already carry both themes, so the chips only pick one.
 * Merged has no variant of its own — purple is GitHub's own convention for it,
 * so it borrows the violet status hue in the same soft-fill shape the other
 * three use.
 */
const PR_STATUS_BADGE: Record<string, React.ComponentProps<typeof Badge>> = {
  OPEN: { variant: 'success' },
  MERGED: { variant: 'secondary', className: 'bg-hue-violet/10 text-hue-violet dark:bg-hue-violet/20' },
  CLOSED: { variant: 'destructive' },
};

export function GitHubStatus({ documentVersionId, isDeployed, compact = false, frame = 'card' }: GitHubStatusProps) {
  const [commits, setCommits] = useState<GitHubCommitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const loadCommits = async () => {
    setLoading(true);
    try {
      const data = await getGitHubCommitsForVersionAction(documentVersionId);
      setCommits(data as unknown as GitHubCommitData[]);
    } catch (error) {
      console.error('[GitHubStatus] Error loading commits:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDeployed) {
      loadCommits();
    } else {
      setLoading(false);
    }
  }, [documentVersionId, isDeployed]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await deployToGitHubAction(documentVersionId);
      capture('github_deploy_retried');
      toast.success('GitHub deploy successful!');
      await loadCommits();
    } catch (error: any) {
      console.error('GitHub retry failed:', error);
      toast.error(error.message || 'GitHub deploy failed');
    } finally {
      setRetrying(false);
    }
  };

  if (!isDeployed) return null;

  if (compact) {
    const latest = commits[0];
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          GitHub
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {!loading && !latest && <span className="text-muted-foreground">Not deployed</span>}
          {!loading && latest?.errorMessage && <span className="text-destructive">Deploy failed</span>}
          {!loading && latest && !latest.errorMessage && latest.prNumber && (
            <>
              {latest.prUrl ? (
                <a href={latest.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                  PR #{latest.prNumber}
                </a>
              ) : (
                <span>PR #{latest.prNumber}</span>
              )}
              {latest.prStatus && (
                <Badge {...PR_STATUS_BADGE[latest.prStatus]}>{latest.prStatus}</Badge>
              )}
            </>
          )}
          {!loading && latest && !latest.errorMessage && !latest.prNumber && (
            <code className="text-[10px]">{latest.commitSha.substring(0, 7)}</code>
          )}
        </span>
      </div>
    );
  }

  const body = <>


      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading GitHub status...
        </div>
      )}

      {!loading && commits.length === 0 && (
        <div className="text-sm text-muted-foreground">
          <p>No GitHub deployment found for this version.</p>
          <Button variant="outline" className="mt-2" onClick={handleRetry} disabled={retrying}>
            <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Deploying...' : 'Deploy to GitHub'}
          </Button>
        </div>
      )}

      {!loading && commits.length > 0 && (
        <div className="space-y-4">
          {commits.map((commit) => (
            <div key={commit.id} className={frame === 'section' ? 'space-y-1.5 min-w-0' : 'border rounded p-3 space-y-1.5 min-w-0'}>
              {commit.errorMessage ? (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Deploy failed</p>
                    <p className="text-sm">{commit.errorMessage}</p>
                    <Button variant="outline" className="mt-2" onClick={handleRetry} disabled={retrying}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Retrying...' : 'Retry Deploy'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Commit:</span>
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">{commit.commitSha.substring(0, 7)}</code>
                  </div>

                  <div className="flex items-start gap-2 text-sm min-w-0">
                    <span className="text-muted-foreground shrink-0">Branch:</span>
                    <span className="break-all">{commit.branchName}</span>
                  </div>

                  <div className="flex items-start gap-2 text-sm min-w-0">
                    <span className="text-muted-foreground shrink-0">File:</span>
                    <code className="bg-muted px-2 py-0.5 rounded text-xs break-all">{commit.filePath}</code>
                  </div>

                  {commit.prNumber && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">PR:</span>
                      {commit.prUrl ? (
                        <a
                          href={commit.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          #{commit.prNumber}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>#{commit.prNumber}</span>
                      )}
                      {commit.prStatus && (
                        <Badge {...PR_STATUS_BADGE[commit.prStatus]}>{commit.prStatus}</Badge>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
  </>;

  if (frame === 'section') {
    return <SidebarSection title="GitHub deployment">{body}</SidebarSection>;
  }

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <GitBranch className="h-5 w-5" />
        GitHub Deployment
      </h3>
      {body}
    </Card>
  );
}
