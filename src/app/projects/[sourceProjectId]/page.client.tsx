'use client';

import ProjectKanbanBoard from '@/components/project-kanban-board';
import ProjectStatisticsTab from '@/components/project-statistics-tab';
import ProjectTeamTab from '@/components/project-team-tab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDeployerClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { Language } from '@prisma/client';
import { ArrowLeft, BarChart3, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ProjectDetailClientProps {
  user: SessionUser;
  sourceProject: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    documents: any[];
    translationProjects: {
      id: string;
      language: {
        id: string;
        name: string;
        code: string;
      };
      _count: {
        members: number;
      };
    }[];
  };
  languages: Language[];
  translationProjects: {
    id: string;
    languageId: string;
    sourceProject: any;
    language: {
      id: string;
      name: string;
      code: string;
    };
    members: { userId: string }[];
    _count: {
      documentAssignments: number;
    };
  }[];
}

export default function ProjectDetailClient({
  user,
  sourceProject,
  languages,
  translationProjects,
}: ProjectDetailClientProps) {
  const LANGUAGE_STORAGE_KEY = `project:${sourceProject.id}:selectedLanguage`;

  const [selectedLanguage, setSelectedLanguage] = useState<string>(languages[0]?.id || '');

  // Load persisted language selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && languages.some((lang) => lang.id === stored)) {
      setSelectedLanguage(stored);
    }
  }, [languages, LANGUAGE_STORAGE_KEY]);

  // Persist language selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedLanguage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [selectedLanguage, LANGUAGE_STORAGE_KEY]);

  // Find the translation project for the selected language
  const selectedTranslationProject = translationProjects.find(
    (tp) => tp.languageId === selectedLanguage,
  );

  const canManageTeam =
    isDeployerClient(user) ||
    selectedTranslationProject?.members?.some((m) => m.userId === user.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{sourceProject.name}</h1>
              {sourceProject.description && (
                <p className="text-sm text-gray-500 mt-0.5">{sourceProject.description}</p>
              )}
            </div>
            <div>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="min-w-[180px]">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.id} value={lang.id}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <ProjectKanbanBoard
              user={user}
              languages={languages}
              selectedLanguage={selectedLanguage}
              sourceProjectId={sourceProject.id}
              translationProjectId={selectedTranslationProject?.id}
            />
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <ProjectTeamTab
              translationProjectId={selectedTranslationProject?.id || null}
              user={user}
              canManage={isDeployerClient(user)}
              selectedLanguageName={languages.find((l) => l.id === selectedLanguage)?.name || ''}
            />
          </TabsContent>

          <TabsContent value="statistics" className="mt-4">
            <ProjectStatisticsTab
              sourceProjectId={sourceProject.id}
              selectedLanguage={selectedLanguage}
              translationProject={selectedTranslationProject || null}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
