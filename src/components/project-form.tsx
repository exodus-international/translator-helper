'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import {
  EMPTY_PROJECT_FORM,
  isProjectFormComplete,
  toCreateProjectInput,
  toUpdateProjectInput,
  type ProjectFormValues,
} from '@/domain/source-project/source-project.form';

/**
 * The fields a source project is created and edited with, shared by the
 * dashboard dialog and the admin dialog.
 *
 * Each site keeps its own dialog chrome: the admin one is rendered through
 * AdminListPage, which owns the Dialog, the form and the submit button, and is
 * shared with the languages page. Only the fields and the payload are common,
 * and the payload is the half that was drifting.
 */

export type { ProjectFormValues };
export { isProjectFormComplete, toCreateProjectInput, toUpdateProjectInput };

/**
 * Mirrors `sourceProjectIdentifier` in source-project.types.ts. As an input
 * `pattern` it is enforced by the browser on submit, so both dialogs reject a
 * bad identifier before it becomes a masked server action error.
 */
const IDENTIFIER_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*';

/** A lone dash turns day naming off, so it has to pass alongside real acronyms. */
const ACRONYM_PATTERN = '-|[^\\s-]+';

export function useProjectForm(initial?: Partial<ProjectFormValues>) {
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY_PROJECT_FORM, ...initial });

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const reset = (next?: Partial<ProjectFormValues>) => setValues({ ...EMPTY_PROJECT_FORM, ...next });

  return { values, set, reset };
}

interface ProjectFormFieldsProps {
  values: ProjectFormValues;
  onChange: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
  /** Keeps input ids unique and stable per dialog. */
  idPrefix?: string;
}

export function ProjectFormFields({ values, onChange, idPrefix = 'project' }: ProjectFormFieldsProps) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Project Name *</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="e.g., Exodus90, Daily Readings"
          required
          minLength={2}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Optional description of the project"
          rows={3}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-identifier`}>Identifier *</Label>
        <Input
          id={`${idPrefix}-identifier`}
          value={values.identifier}
          onChange={(e) => onChange('identifier', e.target.value)}
          placeholder="e.g., exodus90, lent2026"
          required
          pattern={IDENTIFIER_PATTERN}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Used in document URLs and as the folder name in the content repository. Lowercase letters, numbers and
          dashes.
        </p>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-acronym`}>Acronym</Label>
        <Input
          id={`${idPrefix}-acronym`}
          value={values.acronym}
          onChange={(e) => onChange('acronym', e.target.value)}
          placeholder="e.g., SML"
          pattern={ACRONYM_PATTERN}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Prefixes the title of uploaded days, as in &quot;SML - DAY 03 - ...&quot;. Leave empty to number days
          without a prefix, or enter a single dash to leave titles alone.
        </p>
      </div>
    </>
  );
}
