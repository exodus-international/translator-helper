'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_STATUS_SEQUENCE, NO_STATUS, getDocumentStatusConfig } from '@/constants/document-status';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { Document, DocumentStatus, Language } from '@prisma/client';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type DocumentWithVersions = Document & {
  folder: any | null; // Deprecated - kept for backward compatibility
  sourceProject: any | null;
  versions: Array<{
    id: string;
    languageId: string;
    status: DocumentStatus;
    language: Language;
    user: {
      id: string;
      name: string;
      email: string;
    };
    updatedAt: Date;
  }>;
};

interface DocumentsClientProps {
  user: SessionUser;
  documents: DocumentWithVersions[];
  languages: Language[];
  sourceProjects: any[];
  initialFilters: {
    sourceProject?: string;
    search?: string;
  };
  handleDeleteDocument: (id: string) => Promise<void>;
}

export default function DocumentsClient({
  user,
  documents,
  languages,
  sourceProjects,
  initialFilters,
  handleDeleteDocument,
}: DocumentsClientProps) {
  const [selectedSourceProject, setSelectedSourceProject] = useState<string>(initialFilters.sourceProject || 'all');
  const [searchQuery, setSearchQuery] = useState<string>(initialFilters.search || '');

  // Filter documents based on source project and search
  const filteredDocuments = documents.filter((doc) => {
    if (selectedSourceProject !== 'all' && doc.sourceProjectId !== selectedSourceProject) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(query) || doc.slug.toLowerCase().includes(query);
    }
    return true;
  });

  // Helper to get version status for a specific language
  const getLanguageStatus = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.status || null;
  };

  // Helper to get version ID for a specific language
  const getVersionId = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.id;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Documents Overview</h1>
              <p className="text-gray-600">View translation status across all languages</p>
            </div>
            <Link href="/documents/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </Link>
          </div>

          <div className="mt-4 flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={selectedSourceProject} onValueChange={setSelectedSourceProject}>
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {sourceProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} ({project._count.documents})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No documents found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header Row */}
            <Card className="p-4 bg-gray-50">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-4">
                  <h3 className="font-semibold text-sm text-gray-700">Document</h3>
                </div>
                <div className="col-span-7">
                  <div className="flex gap-6">
                    {languages.map((lang) => (
                      <div key={lang.id} className="flex-1 text-center">
                        <span className="text-sm font-medium text-gray-700">{lang.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {isDeployerClient(user) && (
                  <div className="flex justify-end col-span-1 text-sm font-medium text-gray-700"> Options </div>
                )}
              </div>
            </Card>

            {/* Document Rows */}
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Document Info */}
                  <div className="col-span-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{doc.title}</h3>
                        <p className="text-sm text-gray-600 truncate">
                          {doc.slug}
                          {doc.sourceProject && (
                            <>
                              {' '}
                              <span className="text-gray-400">•</span> {doc.sourceProject.name}
                            </>
                          )}
                        </p>
                        {doc.labels && doc.labels.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {doc.labels.map((label: string) => (
                              <Badge key={label} variant="secondary" className="text-xs">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Language Status Indicators */}
                  <div className="col-span-7">
                    <div className="flex gap-6">
                      {languages.map((lang) => {
                        const status = getLanguageStatus(doc, lang.id);
                        const versionId = getVersionId(doc, lang.id);
                        const statusConfig = getDocumentStatusConfig(status);
                        const IndicatorIcon = statusConfig.icon;

                        return (
                          <div key={lang.id} className="flex-1 flex justify-center items-center gap-2">
                            {versionId ? (
                              <>
                                <Link
                                  href={
                                    status === 'PENDING_TRANSLATION' || status === 'IN_PROGRESS'
                                      ? `/documents/${doc.id}/translate?lang=${lang.id}&version=${versionId}`
                                      : `/documents/${doc.id}/review?version=${versionId}`
                                  }
                                  className="group"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className={`${statusConfig.color.textClass} transition-transform group-hover:scale-110 cursor-pointer`}
                                    title={statusConfig.name}
                                  >
                                    <IndicatorIcon className="h-4 w-4" />
                                  </div>
                                </Link>
                              </>
                            ) : (
                              <Link
                                href={`/documents/${doc.id}/translate?lang=${lang.id}`}
                                className="group"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div
                                  className={`${statusConfig.color.textClass} transition-transform group-hover:scale-110 cursor-pointer`}
                                  title="Start translation"
                                >
                                  <IndicatorIcon className="h-4 w-4" />
                                </div>
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {isDeployerClient(user) && (
                    <div className="flex justify-end col-span-1">
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteDocument(doc.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Legend */}
        {filteredDocuments.length > 0 && (
          <Card className="mt-6 p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
            <div className="flex flex-wrap gap-6 text-sm">
              {[...DOCUMENT_STATUS_SEQUENCE, null].map((status) => {
                const config = status ? getDocumentStatusConfig(status) : NO_STATUS;
                const Icon = config.icon;

                return (
                  <div key={config.status} className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.color.textClass}`} />
                    <span className="text-gray-600">{config.name}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
