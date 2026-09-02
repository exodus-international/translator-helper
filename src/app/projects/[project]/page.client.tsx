'use client';

import ProjectKanbanBoard from '@/components/project-kanban-board';
import ProjectStatisticsTab from '@/components/project-statistics-tab';
import ProjectTeamTab from '@/components/project-team-tab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { updateSourceProjectAction } from '@/domain/source-project/source-project.actions';
import { capture } from '@/lib/analytics';
import { useActiveLanguage, useAnalyticsProjectGroup } from '@/components/analytics-project-group';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import { Language } from '@prisma/client';
import { ArrowLeft, BarChart3, CheckCircle2, LayoutDashboard, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ProjectDetailClientProps {
  user: SessionUser;
  sourceProject: {
    id: string;
    name: string;
    description: string | null;
    identifier: string | null;
    acronym: string | null;
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
  /** Resolved server-side from the user's assigned languages and this project's translation projects. */
  initialLanguageId: string;
}

export default function ProjectDetailClient({
  user,
  sourceProject,
  languages,
  translationProjects,
  initialLanguageId,
}: ProjectDetailClientProps) {
  const router = useRouter();
  useAnalyticsProjectGroup(sourceProject.id, sourceProject.name);
  const LANGUAGE_STORAGE_KEY = `project:${sourceProject.id}:selectedLanguage`;

  // Settings form state
  const [settingsName, setSettingsName] = useState(sourceProject.name);
  const [settingsDescription, setSettingsDescription] = useState(sourceProject.description || '');
  const [settingsIdentifier, setSettingsIdentifier] = useState(sourceProject.identifier || '');
  const [settingsAcronym, setSettingsAcronym] = useState(sourceProject.acronym || '');
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialLanguageId);

  // Register the active language as a PostHog super property (value is a language id)
  const selectedLang = languages.find((lang) => lang.id === selectedLanguage);
  useActiveLanguage(selectedLang?.code, selectedLang?.name);

  const handleLanguageChange = (value: string) => {
    setSelectedLanguage(value);
    const lang = languages.find((l) => l.id === value);
    if (lang) {
      capture('language_switched', { language: lang.code });
    }
  };

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
  const selectedTranslationProject = translationProjects.find((tp) => tp.languageId === selectedLanguage);

  const handleSaveSettings = async () => {
    // The identifier is a URL segment and the content repo folder name, so it
    // cannot be cleared. Caught here to say so, rather than letting the action
    // reject a null with a type error.
    if (!settingsIdentifier.trim()) {
      toast.warning('Identifier is required');
      return;
    }

    setSettingsSaving(true);
    try {
      await updateSourceProjectAction(sourceProject.id, {
        name: settingsName,
        description: settingsDescription || null,
        identifier: settingsIdentifier.trim(),
        acronym: settingsAcronym.trim() || null,
      });
      capture('project_settings_saved');
      toast.success('Project settings saved');
      router.refresh();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = sourceProject.status === 'ACTIVE' ? 'COMPLETE' : 'ACTIVE';
    try {
      await updateSourceProjectAction(sourceProject.id, { status: newStatus });
      capture('source_project_status_toggled', { status: newStatus === 'COMPLETE' ? 'complete' : 'active' });
      toast.success(newStatus === 'COMPLETE' ? 'Project marked as complete' : 'Project marked as active');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    }
  };

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
              {sourceProject.description && <p className="text-sm text-gray-500 mt-0.5">{sourceProject.description}</p>}
            </div>
            <div>
              <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
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
            {isAdminClient(user) && (
              <TabsTrigger value="settings" className="flex items-center gap-1.5">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            )}
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
              canManage={isAdminClient(user)}
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

          {isAdminClient(user) && (
            <TabsContent value="settings" className="mt-4">
              <div className="max-w-2xl space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="settings-name">Project Name *</Label>
                      <Input
                        id="settings-name"
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        placeholder="e.g., Exodus90"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="settings-description">Description</Label>
                      <Textarea
                        id="settings-description"
                        value={settingsDescription}
                        onChange={(e) => setSettingsDescription(e.target.value)}
                        placeholder="Optional description of the project"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="settings-identifier">Repository Identifier</Label>
                      <Input
                        id="settings-identifier"
                        value={settingsIdentifier}
                        onChange={(e) => setSettingsIdentifier(e.target.value)}
                        placeholder="e.g., exodus90, lent2026"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        GITHUB: Folder name in the content repository
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="settings-acronym">Acronym</Label>
                      <Input
                        id="settings-acronym"
                        value={settingsAcronym}
                        onChange={(e) => setSettingsAcronym(e.target.value)}
                        placeholder="e.g., SML"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Prefixes the title of uploaded days, as in &quot;SML - DAY 03 - ...&quot;. Leave empty for none.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveSettings} disabled={settingsSaving || !settingsName.trim()}>
                        {settingsSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Project Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {sourceProject.status === 'ACTIVE' ? 'Active' : 'Complete'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sourceProject.status === 'ACTIVE'
                            ? 'This project is currently active and accepting translations.'
                            : 'This project is marked as complete.'}
                        </p>
                      </div>
                      <Button variant="outline" onClick={handleToggleStatus}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {sourceProject.status === 'ACTIVE' ? 'Mark as Complete' : 'Mark as Active'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
