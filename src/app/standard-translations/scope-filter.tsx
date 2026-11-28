'use client';

import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import type { StandardTranslationsPage } from '@/domain/standard-translation/standard-translation.repository';
import type { ScopeSelection } from '@/domain/standard-translation/standard-translation.types';
import { scopeLabel, toggleGeneral, toggleProject } from './scope';

/**
 * Which entries the list shows: general ones ("All projects"), and those of
 * each project, active projects and completed ones in their own groups. The
 * menu stays open while ticking, so several can be changed in one go.
 */
export function ScopeFilter({
  selection,
  scopes,
  onChange,
}: {
  selection: ScopeSelection;
  scopes: StandardTranslationsPage['scopes'];
  onChange: (selection: ScopeSelection) => void;
}) {
  const selected = new Set(selection.projectIds);
  const active = scopes.projects.filter((project) => project.status === SourceProjectStatus.ACTIVE);
  const completed = scopes.projects.filter((project) => project.status === SourceProjectStatus.COMPLETE);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <span>Scope: {scopeLabel(selection, scopes.projects)}</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={selection.includeGeneral}
            onCheckedChange={() => onChange(toggleGeneral(selection))}
          >
            All projects
            <span className="text-muted-foreground ml-auto">{scopes.general}</span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        {active.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Active projects</DropdownMenuLabel>
            {active.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={selected.has(project.id)}
                onCheckedChange={() => onChange(toggleProject(selection, project.id))}
              >
                <span className="truncate">{project.name}</span>
                <span className="text-muted-foreground ml-auto">{project.count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        )}
        {completed.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Completed projects</DropdownMenuLabel>
            {completed.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={selected.has(project.id)}
                onCheckedChange={() => onChange(toggleProject(selection, project.id))}
              >
                <span className="truncate">{project.name}</span>
                <Badge variant="secondary" className="ml-auto">
                  Complete
                </Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
