'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DOCUMENT_STATUS_CONFIGS, DOCUMENT_STATUS_SEQUENCE } from '@/constants/document-status';
import { getDashboardDocumentsAction } from '@/domain/document/document.actions';
import { DocumentStatus } from '@prisma/client';
import { BarChart3, FileText, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProjectStatisticsTabProps {
  sourceProjectId: string;
  selectedLanguage: string;
  translationProject: {
    id: string;
    _count: {
      documentAssignments: number;
    };
    members: { userId: string }[];
  } | null;
}

export default function ProjectStatisticsTab({
  sourceProjectId,
  selectedLanguage,
  translationProject,
}: ProjectStatisticsTabProps) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, [sourceProjectId, selectedLanguage]);

  async function loadDocuments() {
    setLoading(true);
    try {
      const docs = await getDashboardDocumentsAction(selectedLanguage, sourceProjectId);
      setDocuments(docs);
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading statistics...</p>
      </div>
    );
  }

  // Calculate status breakdown
  const statusCounts: Record<string, number> = {};
  DOCUMENT_STATUS_SEQUENCE.forEach((status) => {
    statusCounts[status] = 0;
  });

  documents.forEach((doc) => {
    const version = doc.versions?.[0];
    const status = version?.status || DocumentStatus.PENDING_TRANSLATION;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const totalDocuments = documents.length;
  const deployedCount = statusCounts[DocumentStatus.DEPLOYED] || 0;
  const approvedCount = statusCounts[DocumentStatus.APPROVED] || 0;
  const progressPercent = totalDocuments > 0 ? Math.round((deployedCount / totalDocuments) * 100) : 0;
  const completedPercent =
    totalDocuments > 0 ? Math.round(((deployedCount + approvedCount) / totalDocuments) * 100) : 0;

  const uniqueMembers = translationProject ? new Set(translationProject.members.map((m) => m.userId)).size : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalDocuments}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{uniqueMembers}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Deployed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{progressPercent}%</p>
            <p className="text-sm text-gray-500">
              {deployedCount} of {totalDocuments} documents
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Translation Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Overall completion (approved + deployed)</span>
              <span className="font-medium">{completedPercent}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              {DOCUMENT_STATUS_SEQUENCE.map((status) => {
                const count = statusCounts[status] || 0;
                if (count === 0 || totalDocuments === 0) return null;
                const width = (count / totalDocuments) * 100;
                return (
                  <div
                    key={status}
                    className="h-full transition-all"
                    style={{
                      width: `${width}%`,
                      backgroundColor: DOCUMENT_STATUS_CONFIGS[status].color.hex,
                    }}
                    title={`${DOCUMENT_STATUS_CONFIGS[status].name}: ${count}`}
                  />
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DOCUMENT_STATUS_SEQUENCE.map((status) => {
              const count = statusCounts[status] || 0;
              const config = DOCUMENT_STATUS_CONFIGS[status];
              const percent = totalDocuments > 0 ? Math.round((count / totalDocuments) * 100) : 0;

              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: config.color.hex }} />
                  <span className="text-sm flex-1">{config.name}</span>
                  <Badge variant="secondary" size="sm">
                    {count}
                  </Badge>
                  <span className="text-sm text-gray-500 w-12 text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
