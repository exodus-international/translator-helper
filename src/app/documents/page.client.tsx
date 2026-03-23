'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DOCUMENT_STATUS_SEQUENCE, NO_STATUS, getDocumentStatusConfig } from '@/constants/document-status';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { Document, DocumentStatus, Language } from '@prisma/client';
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type DocumentWithVersions = Document & {
  folder: any | null;
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
  const isAdmin = isAdminClient(user);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (selectedSourceProject !== 'all' && doc.sourceProjectId !== selectedSourceProject) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return doc.title.toLowerCase().includes(query) || doc.slug.toLowerCase().includes(query);
      }
      return true;
    });
  }, [documents, selectedSourceProject, searchQuery]);

  // Group documents by source project
  const groupedDocuments = useMemo(() => {
    const groups: Array<{ projectName: string; projectId: string | null; docs: DocumentWithVersions[] }> = [];
    const projectMap = new Map<string | null, DocumentWithVersions[]>();

    // Sort documents by project name then title
    const sorted = [...filteredDocuments].sort((a, b) => {
      const projA = a.sourceProject?.name || 'zzz';
      const projB = b.sourceProject?.name || 'zzz';
      if (projA !== projB) return projA.localeCompare(projB);
      return a.title.localeCompare(b.title);
    });

    for (const doc of sorted) {
      const key = doc.sourceProjectId;
      if (!projectMap.has(key)) {
        projectMap.set(key, []);
      }
      projectMap.get(key)!.push(doc);
    }

    for (const [projectId, docs] of projectMap) {
      const projectName = docs[0]?.sourceProject?.name || 'Unassigned';
      groups.push({ projectName, projectId, docs });
    }

    // Move "Unassigned" to the end
    groups.sort((a, b) => {
      if (a.projectId === null) return 1;
      if (b.projectId === null) return -1;
      return a.projectName.localeCompare(b.projectName);
    });

    return groups;
  }, [filteredDocuments]);

  const getLanguageStatus = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.status || null;
  };

  const getVersionId = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.id;
  };

  const totalColumns = 3 + languages.length + (isAdmin ? 1 : 0);

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

      <div className="container mx-auto px-4 py-4">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">No documents found</p>
          </div>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="min-w-[200px]">Title</TableHead>
                  <TableHead className="min-w-[120px]">Filename</TableHead>
                  <TableHead className="min-w-[80px]">Type</TableHead>
                  {languages.map((lang) => (
                    <TableHead key={lang.id} className="text-center min-w-[60px]">
                      {lang.name}
                    </TableHead>
                  ))}
                  {isAdmin && <TableHead className="text-right min-w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedDocuments.map((group) => (
                  <>
                    {/* Group header row */}
                    <TableRow
                      key={`group-${group.projectId || 'unassigned'}`}
                      className="bg-gray-100/60 hover:bg-gray-100/60"
                    >
                      <TableCell colSpan={totalColumns} className="py-2 px-4">
                        <span className="text-sm font-semibold text-gray-700">{group.projectName}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          ({group.docs.length} {group.docs.length === 1 ? 'document' : 'documents'})
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Document rows */}
                    {group.docs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Link
                              href={`/documents/${doc.id}/review?version=${doc.versions[0]?.id || ''}`}
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {doc.title}
                            </Link>
                            {doc.labels && doc.labels.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {doc.labels.map((label: string) => (
                                  <Badge key={label} variant="secondary" className="text-xs py-0">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">{doc.originalFilename || '—'}</TableCell>
                        <TableCell>
                          {doc.type ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {doc.type.replace('_', ' ')}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </TableCell>
                        {languages.map((lang) => {
                          const status = getLanguageStatus(doc, lang.id);
                          const versionId = getVersionId(doc, lang.id);
                          const statusConfig = getDocumentStatusConfig(status);
                          const IndicatorIcon = statusConfig.icon;

                          const href = versionId
                            ? status === 'PENDING_TRANSLATION' || status === 'IN_PROGRESS'
                              ? `/documents/${doc.id}/translate?lang=${lang.id}&version=${versionId}`
                              : `/documents/${doc.id}/review?version=${versionId}`
                            : `/documents/${doc.id}/translate?lang=${lang.id}`;

                          return (
                            <TableCell key={lang.id} className="text-center">
                              <Link href={href} className="group inline-flex justify-center">
                                <div
                                  className={`${statusConfig.color.textClass} transition-transform group-hover:scale-125 cursor-pointer`}
                                  title={versionId ? statusConfig.name : 'Start translation'}
                                >
                                  <IndicatorIcon className="h-4 w-4" />
                                </div>
                              </Link>
                            </TableCell>
                          );
                        })}
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Link href={`/documents/${doc.id}/edit`}>
                                <Button variant="ghost" size="sm">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete &ldquo;{doc.title}&rdquo;? This will delete the
                                      source version and all translation versions. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteDocument(doc.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Legend */}
        {filteredDocuments.length > 0 && (
          <Card className="mt-4 p-4 bg-gray-50">
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
