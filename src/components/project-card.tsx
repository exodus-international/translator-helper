'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Globe, Users } from 'lucide-react';
import Link from 'next/link';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    _count: {
      documents: number;
      translationProjects: number;
    };
    translationProjects: {
      id: string;
      language: {
        id: string;
        name: string;
        code: string;
      };
      members: {
        userId: string;
      }[];
    }[];
  };
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const uniqueUserIds = new Set(project.translationProjects.flatMap((tp) => tp.members.map((m) => m.userId)));
  const totalMembers = uniqueUserIds.size;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            {project.status === 'COMPLETE' && (
              <Badge variant="secondary" size="sm">
                Complete
              </Badge>
            )}
          </div>
          {project.description && <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              <span>{project._count.documents} documents</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              <span>{project._count.translationProjects} languages</span>
            </div>
            {totalMembers > 0 && (
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span>{totalMembers} members</span>
              </div>
            )}
          </div>
          {project.translationProjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {project.translationProjects.map((tp) => {
                const uniqueMembers = new Set(tp.members.map((m) => m.userId)).size;
                return (
                  <Badge key={tp.id} variant="secondary" size="xs" className="gap-1">
                    {tp.language.name}
                    {uniqueMembers > 0 && (
                      <span className="text-muted-foreground">
                        <Users className="inline h-3 w-3 ml-0.5" /> {uniqueMembers}
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
