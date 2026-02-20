'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, ExternalLink, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { getGitHubCommitsForVersionAction } from '@/domain/github/github.actions';
import { deployToGitHubAction } from '@/domain/github/github.actions';
import { toast } from 'sonner';

interface GitHubStatusProps {
  documentVersionId: string;
  isDeployed: boolean;
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

const PR_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-800',
  MERGED: 'bg-purple-100 text-purple-800',
  CLOSED: 'bg-red-100 text-red-800',
};

export function GitHubStatus({ documentVersionId, isDeployed }: GitHubStatusProps) {
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

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <GitBranch className="h-5 w-5" />
        GitHub Deployment
      </h3>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading GitHub status...
        </div>
      )}

      {!loading && commits.length === 0 && (
        <div className="text-sm text-gray-500">
          <p>No GitHub deployment found for this version.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRetry} disabled={retrying}>
            <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Deploying...' : 'Deploy to GitHub'}
          </Button>
        </div>
      )}

      {!loading && commits.length > 0 && (
        <div className="space-y-4">
          {commits.map((commit) => (
            <div key={commit.id} className="border rounded p-3 space-y-1.5">
              {commit.errorMessage ? (
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Deploy failed</p>
                    <p className="text-sm">{commit.errorMessage}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleRetry}
                      disabled={retrying}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Retrying...' : 'Retry Deploy'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Commit:</span>
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                      {commit.commitSha.substring(0, 7)}
                    </code>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Branch:</span>
                    <span>{commit.branchName}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">File:</span>
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{commit.filePath}</code>
                  </div>

                  {commit.prNumber && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">PR:</span>
                      {commit.prUrl ? (
                        <a
                          href={commit.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          #{commit.prNumber}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>#{commit.prNumber}</span>
                      )}
                      {commit.prStatus && (
                        <Badge className={PR_STATUS_COLORS[commit.prStatus] || ''}>
                          {commit.prStatus}
                        </Badge>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
